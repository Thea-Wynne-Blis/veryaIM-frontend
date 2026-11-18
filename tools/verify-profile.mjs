/**
 * 用户资料卡实测（生产环境）：
 *  1. 通讯录点好友 → 右侧资料卡显示地区、个性签名、添加时间（im_friend.created_at）；
 *  2. 设置页可编辑昵称/地区/个性签名，保存后刷新仍然生效；
 *  3. 添加好友搜索结果点陌生人 → 资料卡 + 添加好友入口；
 *  4. 群成员点头像/昵称 → 好友 / 陌生人 / 自己三种资料卡形态。
 */
import { chromium } from 'playwright-core'

const BASE = 'http://82.157.47.151:8899'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const GROUP = '产品设计小组'
const BOB_REGION = '上海 · 徐汇'
const BOB_SIGNATURE = '设计是一种沟通方式，而不是装饰。'
const MY_REGION = `北京 · 朝阳 ${new Date().toISOString().slice(11, 19)}`
const MY_SIGNATURE = `保持好奇，持续交付。${new Date().toISOString().slice(11, 19)}`

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`)
}

async function apiLogin(username) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      deviceId: `probe-${Date.now()}`,
      platform: 'LINUX',
      deviceName: 'probe',
    }),
  })
  const body = await res.json()
  return body.data.token
}

// 先给鲍勃写好资料，爱丽丝点开时才有内容可看。
{
  const token = await apiLogin('demo_bob')
  const res = await fetch(`${BASE}/api/v1/users/me`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ region: BOB_REGION, signature: BOB_SIGNATURE }),
  })
  check('setup bob profile', res.ok, `status=${res.status}`)
}

async function cancelPending(token) {
  const res = await fetch(`${BASE}/api/v1/friends/requests?direction=outgoing`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  // 请求 ID 超过 2^53，原生 JSON.parse 会四舍五入，这里直接按文本取原始数字。
  const text = await res.text()
  const ids = [...text.matchAll(/"requestId":(\d+)(?=[^{}]*"status":"PENDING")/g)].map(
    (match) => match[1],
  )
  for (const id of ids) {
    await fetch(`${BASE}/api/v1/friends/requests/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  }
  return ids
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[placeholder="至少 3 位"]', 'demo_alice')
await page.fill('input[placeholder="至少 6 位"]', 'password123')
await page.click('button:has-text("进入 VERYAL")')
await page.waitForURL('**/app/chat', { timeout: 25000 })
await page.waitForSelector('.conv', { timeout: 20000 })

// 上一轮跑挂时可能留下待处理的好友申请，先清干净再测。
await cancelPending(await page.evaluate(() => localStorage.getItem('veryal.token')))

// ---------- 1. 通讯录：好友资料卡 ----------
await page.click('button[aria-label="通讯录"]')
await page.waitForSelector('.row:has-text("鲍勃")', { timeout: 20000 })
await page.locator('.row', { hasText: '鲍勃' }).first().click()
await page.waitForSelector('.profile-card', { timeout: 10000 })

const cardText = await page.locator('.profile-card').innerText()
check('friend card shows region', cardText.includes(BOB_REGION), cardText.replace(/\n/g, ' | '))
check('friend card shows signature', cardText.includes(BOB_SIGNATURE), cardText.replace(/\n/g, ' | '))
check('friend card shows friend-since date', /添加时间/.test(cardText) && /\d{4}年\d{1,2}月\d{1,2}日/.test(cardText),
  cardText.replace(/\n/g, ' | '))
check('friend card offers chat/remark/remove',
  /发消息/.test(cardText) && /修改备注/.test(cardText) && /删除好友/.test(cardText))

// ---------- 2. 设置页：编辑地区与签名 ----------
await page.click('button[aria-label="我的"]')
await page.waitForSelector('.me-card.hero', { timeout: 20000 })
await page.locator('.field', { hasText: '地区' }).locator('input').fill(MY_REGION)
await page.locator('.field', { hasText: '个性签名' }).locator('textarea').fill(MY_SIGNATURE)
await page.click('button:has-text("保存资料")')
await page.waitForSelector('.toast-ok', { timeout: 10000 })
check('settings save shows toast', (await page.locator('.toast-ok').innerText()).includes('已保存'))
check('hero previews new signature',
  (await page.locator('.me-card.hero').innerText()).includes(MY_SIGNATURE))

const token = await page.evaluate(() => localStorage.getItem('veryal.token'))
const me = await page.evaluate(async (t) => {
  const res = await fetch('/api/v1/users/me', { headers: { Authorization: `Bearer ${t}` } })
  return (await res.json()).data
}, token)
check('profile persisted to backend', me.region === MY_REGION && me.signature === MY_SIGNATURE,
  JSON.stringify({ region: me.region, signature: me.signature }))

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.me-card.hero', { timeout: 25000 })
const reloaded = await page.locator('.me-card.hero').innerText()
check('region survives reload', reloaded.includes(MY_REGION), reloaded.replace(/\n/g, ' | '))
check('signature survives reload', reloaded.includes(MY_SIGNATURE), reloaded.replace(/\n/g, ' | '))

// ---------- 3. 陌生人资料卡（添加好友搜索结果） ----------
await page.click('button[aria-label="通讯录"]')
await page.waitForSelector('.row:has-text("鲍勃")', { timeout: 20000 })
await page.click('button[title="添加好友"]')
await page.waitForSelector('.dialog:has-text("搜索用户")', { timeout: 10000 })
await page.fill('input[placeholder="输入用户名或昵称"]', 'demo_dave')
await page.waitForSelector('.dialog-body .row:has-text("戴维")', { timeout: 15000 })
await page.locator('.dialog-body .row', { hasText: '戴维' }).first().click()
await page.waitForSelector('.card[aria-label="用户资料"]', { timeout: 10000 })
await page.waitForFunction(() => {
  const card = document.querySelector('.card[aria-label="用户资料"]')
  return card && !card.querySelector('.loading')
}, null, { timeout: 15000 })

const strangerText = await page.locator('.card[aria-label="用户资料"]').innerText()
check('stranger card opens from search', strangerText.includes('戴维'), strangerText.replace(/\n/g, ' | '))
check('stranger card has region row', /地区/.test(strangerText))
check('stranger card offers add-friend', /添加好友/.test(strangerText))
check('stranger card hides add-time', !/添加时间/.test(strangerText), strangerText.replace(/\n/g, ' | '))

await page.click('.card[aria-label="用户资料"] button:has-text("添加好友")')
await page.waitForFunction(() => {
  const card = document.querySelector('.card[aria-label="用户资料"]')
  return card?.textContent?.includes('好友申请已发送')
}, null, { timeout: 15000 })
check('add friend flips to pending state',
  (await page.locator('.card[aria-label="用户资料"]').innerText()).includes('好友申请已发送'))
await page.click('.card[aria-label="用户资料"] button[aria-label="关闭"]')

// 关掉「添加好友」搜索弹窗，否则它的遮罩会挡住左侧导航。
await page.locator('.dialog:has-text("搜索用户") button.icon-btn').first().click()
await page.waitForSelector('.dialog:has-text("搜索用户")', { state: 'detached', timeout: 10000 })

// 清掉测试产生的好友申请，避免污染线上数据。
await cancelPending(token)

// ---------- 4. 群成员资料卡：好友 / 陌生人 / 自己 ----------
await page.click('button[aria-label="消息"]')
await page.waitForSelector('.conv', { timeout: 20000 })
await page.locator('.conv', { hasText: GROUP }).first().click()
await page.waitForTimeout(1200)
await page.click('button.action-btn:has-text("群管理")')
await page.waitForSelector('.dialog[aria-label="群管理"] .member-row', { timeout: 20000 })

async function openMember(name) {
  await page.locator('.dialog[aria-label="群管理"] .member-open', { hasText: name }).first().click()
  await page.waitForSelector('.card[aria-label="用户资料"]', { timeout: 10000 })
  await page.waitForFunction(() => {
    const card = document.querySelector('.card[aria-label="用户资料"]')
    return card && !card.querySelector('.loading')
  }, null, { timeout: 15000 })
  return page.locator('.card[aria-label="用户资料"]').innerText()
}

const friendText = await openMember('鲍勃')
check('member(friend) card shows add-time', /添加时间/.test(friendText), friendText.replace(/\n/g, ' | '))
check('member(friend) card offers chat', /发消息/.test(friendText))
await page.click('.card[aria-label="用户资料"] button[aria-label="关闭"]')

const strangerMemberText = await openMember('戴维')
check('member(stranger) card offers add-friend', /添加好友|好友申请/.test(strangerMemberText),
  strangerMemberText.replace(/\n/g, ' | '))
await page.click('.card[aria-label="用户资料"] button[aria-label="关闭"]')

const selfText = await openMember('爱丽丝')
check('member(self) card marks 我自己', /我自己/.test(selfText), selfText.replace(/\n/g, ' | '))
check('member(self) card has settings entry', /编辑我的资料/.test(selfText))
await page.click('.card[aria-label="用户资料"] button[aria-label="关闭"]')

await page.screenshot({ path: 'tools/verify-profile.png' })
await browser.close()

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} profile checks passed`)
if (failed.length) {
  console.log('FAILED:', failed.map((item) => item.name).join(', '))
  process.exit(1)
}
