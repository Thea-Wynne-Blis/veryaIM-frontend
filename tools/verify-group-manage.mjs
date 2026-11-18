/**
 * 群管理弹窗 UI 实测：
 *  1. 群主视角：角色标签、禁言三档（7 分钟 / 30 分钟 / 永久）、解除禁言、全员禁言开关、转让/踢人按钮；
 *  2. 操作后静默刷新，不出现整页 loading（弹窗不闪）；
 *  3. 成员数据只发一次 /groups/{id}/members，不再逐个 /users/{id}/profile；
 *  4. 普通成员视角：无禁言、无设管理员、无转让/踢人、群名与公告只读。
 */
import { chromium } from 'playwright-core'

const BASE = 'http://82.157.47.151:8899'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const GROUP = '调试建群'
const MUTE_TARGET = '艾琳'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`)
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })

async function openManage(username) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const apiCalls = []
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/api/v1/')) apiCalls.push(`${request.method()} ${url.split('/api/v1')[1]}`)
  })

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[placeholder="至少 3 位"]', username)
  await page.fill('input[placeholder="至少 6 位"]', 'password123')
  await page.click('button:has-text("进入 VERYAL")')
  await page.waitForURL('**/app/chat', { timeout: 25000 })
  await page.waitForSelector('.conv', { timeout: 20000 })
  await page.locator('.conv', { hasText: GROUP }).first().click()
  await page.waitForTimeout(1200)
  await page.click('button.action-btn:has-text("群管理")')
  await page.waitForSelector('.dialog[aria-label="群管理"] .member-row', { timeout: 20000 })
  await page.waitForTimeout(400)
  return { page, context, apiCalls }
}

// ---------------- 群主视角 ----------------
{
  const { page, context, apiCalls } = await openManage('demo_alice')
  check('owner: dialog opened', (await page.locator('.dialog[aria-label="群管理"]').count()) === 1)

  const rows = page.locator('.dialog[aria-label="群管理"] .member-row')
  const rowCount = await rows.count()
  check('owner: member rows rendered', rowCount >= 3, `rows=${rowCount}`)

  const firstRowHtml = await rows.first().innerHTML()
  check('owner: owner sorted first with tag', firstRowHtml.includes('tag owner'), firstRowHtml.slice(0, 200))
  const tags = await page.locator('.dialog[aria-label="群管理"] .tag.owner, .dialog[aria-label="群管理"] .tag.me').count()
  check('owner: owner/me tags present', tags >= 2, `tags=${tags}`)

  const selects = page.locator('.dialog[aria-label="群管理"] select.mini-select')
  check('owner: mute select only for other members', (await selects.count()) === rowCount - 1,
    `selects=${await selects.count()}, rows=${rowCount}`)

  const options = await selects.first().locator('option').allTextContents()
  check('owner: 7/30/forever options',
    options.join('|').includes('禁言 7 分钟') && options.join('|').includes('禁言 30 分钟')
    && options.join('|').includes('永久禁言'), options.join('|'))
  check('owner: no legacy extra options', !options.some((o) => /小时|天/.test(o)), options.join('|'))

  check('owner: mute-all switch visible', (await page.locator('.dialog[aria-label="群管理"] .switch-btn').count()) === 1)
  check('owner: transfer buttons visible', (await page.locator('.dialog[aria-label="群管理"] button[title="转让群主"]').count()) === rowCount - 1)
  check('owner: kick buttons visible', (await page.locator('.dialog[aria-label="群管理"] button[title="移出群聊"]').count()) === rowCount - 1)
  check('owner: disband visible', (await page.locator('.dialog[aria-label="群管理"] button:has-text("解散群聊")').count()) === 1)

  // 观察静默刷新期间是否出现整页 loading
  await page.evaluate(() => {
    window.__dialogLoadingSeen = false
    const observer = new MutationObserver(() => {
      if (document.querySelector('.dialog-loading')) window.__dialogLoadingSeen = true
    })
    observer.observe(document.body, { subtree: true, childList: true })
  })

  // 弹窗打开后的请求才算在操作成本里
  apiCalls.length = 0

  const targetRow = rows.filter({ hasText: MUTE_TARGET }).first()
  await targetRow.locator('select.mini-select').selectOption('MUTE_7M')
  await page.waitForTimeout(1800)
  const muteCalls = apiCalls.filter((call) => call.startsWith('GET /groups/') && call.endsWith('/members'))
  check('owner: mute refresh uses at most 2 member fetches', muteCalls.length <= 2,
    muteCalls.join(', '))

  const mutedText = await targetRow.innerText()
  check('owner: 7m mute applied and shown', mutedText.includes('禁言'), mutedText.replace(/\s+/g, ' ').slice(0, 120))
  const loadingSeen = await page.evaluate(() => window.__dialogLoadingSeen)
  check('owner: silent refresh (no full-dialog loading)', loadingSeen === false)

  const bodyVisible = await page.locator('.dialog[aria-label="群管理"] .dialog-body').isVisible()
  check('owner: dialog body stays mounted', bodyVisible)

  apiCalls.length = 0
  await targetRow.locator('select.mini-select').selectOption('UNMUTE')
  await page.waitForTimeout(1800)
  const unmuteCalls = apiCalls.filter((call) => call.startsWith('GET /groups/') && call.endsWith('/members'))
  check('owner: unmute refresh uses at most 2 member fetches', unmuteCalls.length <= 2,
    unmuteCalls.join(', '))
  check('owner: unmute clears state', (await targetRow.locator('.tag.muted').count()) === 0,
    (await targetRow.innerText()).replace(/\s+/g, ' ').slice(0, 120))

  const profileCalls = apiCalls.filter((call) => /\/users\/\d+\/profile/.test(call))
  check('owner: no per-user profile N+1', profileCalls.length === 0, profileCalls.join(', '))

  await page.screenshot({ path: 'tools/verify-group-owner.png' })
  await context.close()
}

// ---------------- 普通成员视角 ----------------
{
  const { page, context } = await openManage('demo_carol')
  check('member: dialog opened', (await page.locator('.dialog[aria-label="群管理"]').count()) === 1)
  check('member: no mute select', (await page.locator('.dialog[aria-label="群管理"] select.mini-select').count()) === 0)
  check('member: no mute-all switch', (await page.locator('.dialog[aria-label="群管理"] .switch-btn').count()) === 0)
  check('member: no transfer button', (await page.locator('.dialog[aria-label="群管理"] button[title="转让群主"]').count()) === 0)
  check('member: no kick button', (await page.locator('.dialog[aria-label="群管理"] button[title="移出群聊"]').count()) === 0)
  check('member: no admin toggle', (await page.locator('.dialog[aria-label="群管理"] button[title="设为管理员"]').count()) === 0)
  check('member: no disband button', (await page.locator('.dialog[aria-label="群管理"] button:has-text("解散群聊")').count()) === 0)
  check('member: leave button visible', (await page.locator('.dialog[aria-label="群管理"] button:has-text("退出群聊")').count()) === 1)
  check('member: group name readonly',
    await page.locator('.dialog[aria-label="群管理"] input.field-input').first().isDisabled())
  check('member: no announcement editor',
    (await page.locator('.dialog[aria-label="群管理"] textarea.field-textarea').count()) === 0)
  check('member: announcement shown read-only',
    (await page.locator('.dialog[aria-label="群管理"] .field-readonly').first().innerText()).includes('群公告')
    || (await page.locator('.dialog[aria-label="群管理"] .field-readonly').first().innerText()).length > 0)

  await page.screenshot({ path: 'tools/verify-group-member.png' })
  await context.close()
}

await browser.close()

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} UI checks passed`)
if (failed.length) {
  console.log('FAILED:', failed.map((item) => item.name).join(', '))
  process.exit(1)
}
