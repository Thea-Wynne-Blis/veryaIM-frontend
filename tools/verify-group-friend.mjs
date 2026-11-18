/**
 * 群成员「添加好友」入口实测（产品设计小组：鲍勃=群主、爱丽丝=我、戴维=非好友）：
 *  1. 自己那行没有加好友图标；
 *  2. 已经是好友的成员显示「已是好友」；
 *  3. 非好友成员显示「添加好友」，点击后走 /friends/requests，图标变为待通过；
 *  4. 好友列表只拉一次，不产生逐成员请求。
 */
import { chromium } from 'playwright-core'

const BASE = process.env.VERYAL_BASE ?? 'http://82.157.47.151:8899'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const GROUP = '产品设计小组'
const SELF = '爱丽丝'
/** 群成员显示名优先用好友备注；登录后按真实备注覆盖。 */
let FRIEND = '鲍勃'
const STRANGER = '戴维'
const STRANGER_ID = '380621346419249152'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`)
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const apiCalls = []
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('request', (request) => {
  const url = request.url()
  if (url.includes('/api/v1/')) apiCalls.push(`${request.method()} ${url.split('/api/v1')[1]}`)
})

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[placeholder="至少 3 位"]', 'demo_alice')
await page.fill('input[placeholder="至少 6 位"]', 'password123')
await page.click('button:has-text("进入 VERYAL")')
await page.waitForURL('**/app/chat', { timeout: 25000 })
await page.waitForSelector('.conv', { timeout: 20000 })
// 群成员行显示「好友备注优先」，从后端取鲍勃当前的显示名，别写死昵称。
FRIEND = await page.evaluate(async () => {
  const token = localStorage.getItem('veryal.token')
  const text = await fetch('/api/v1/friends', {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.text())
  // 雪花 ID 超过 2^53，先转成字符串再 JSON.parse。
  const body = JSON.parse(text.replace(/:(\d{16,})/g, ':"$1"'))
  const bob = (body.data ?? []).find((friend) => friend.nickname === '鲍勃')
  return bob ? bob.remark?.trim() || bob.nickname : '鲍勃'
})
// 上面这次是脚本自己的准备请求，后面的「只拉一次好友」只统计打开群管理之后的。
apiCalls.length = 0
await page.locator('.conv', { hasText: GROUP }).first().click()
await page.waitForTimeout(1200)
// 切换会话后右侧详情会自动收起，「群管理」入口在详情里，先展开。
if (!(await page.locator('.frame.detail-open').count())) {
  await page.click('button[aria-label="会话详情"]')
}
await page.waitForSelector('button.action-btn:has-text("群管理")', { timeout: 10000 })
await page.click('button.action-btn:has-text("群管理")')
await page.waitForSelector('.dialog[aria-label="群管理"] .member-row', { timeout: 20000 })
await page.waitForTimeout(600)

const dialog = page.locator('.dialog[aria-label="群管理"]')
const rowOf = (name) => dialog.locator('.member-row').filter({ hasText: name }).first()

check('self row has no add-friend button',
  (await rowOf(SELF).locator('button[title="添加好友"], button[title="已是好友"]').count()) === 0)
check('existing friend shows 已是好友',
  (await rowOf(FRIEND).locator('button[title="已是好友"]').count()) === 1,
  await rowOf(FRIEND).innerText())
check('stranger shows 添加好友',
  (await rowOf(STRANGER).locator('button[title="添加好友"]').count()) === 1,
  await rowOf(STRANGER).innerText())

const friendsCalls = apiCalls.filter((call) => call === 'GET /friends')
check('friend list fetched once', friendsCalls.length === 1, friendsCalls.join(', '))

const strangerRow = rowOf(STRANGER)
await strangerRow.locator('button[title="添加好友"]').click()
await page.waitForTimeout(1500)

const notice = await page.locator('.dialog[aria-label="群管理"] ~ .toast, .toast').first().innerText().catch(() => '')
check('send request shows toast', notice.includes(STRANGER) && notice.includes('好友申请'), notice)

const toastBox = await page.locator('.toast').first().boundingBox()
const dialogBox = await dialog.boundingBox()
check('toast floats above dialog, not inline',
  !!toastBox && !!dialogBox && toastBox.y < dialogBox.y, JSON.stringify({ toastBox, dialogBox }))
check('icon switches to pending',
  (await strangerRow.locator('button[title="好友申请等待对方通过"]').count()) === 1,
  await strangerRow.innerText())
check('no duplicate request on second click',
  (await strangerRow.locator('button[title="添加好友"]').count()) === 0)

const postCalls = apiCalls.filter((call) => call === 'POST /friends/requests')
check('exactly one friend request sent', postCalls.length === 1, postCalls.join(', '))

await page.screenshot({ path: 'tools/verify-group-friend.png' })
await context.close()
await browser.close()

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} UI checks passed`)
if (failed.length) {
  console.log('FAILED:', failed.map((item) => item.name).join(', '))
  process.exit(1)
}
