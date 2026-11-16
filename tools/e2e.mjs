/**
 * VERYAL 真机走查（Playwright + 本机 Chrome）
 *
 * 覆盖：登录 → 打开会话 → 发送消息 → 消息上屏 → 切换页面 → 退出登录
 * 任何 /api 4xx/5xx 都会被记录并让用例失败。
 *
 * 运行：node tools/e2e.mjs
 */
import { chromium } from 'playwright-core'

const BASE = process.env.VERYAL_BASE ?? 'http://82.157.47.151:8899'
const USER = process.env.VERYAL_USER ?? 'demo_alice'
const PASS = process.env.VERYAL_PASS ?? 'password123'
const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const failures = []
const apiErrors = []
const step = (name) => console.log(`\n▶ ${name}`)
const ok = (msg) => console.log(`  ✓ ${msg}`)
const bad = (msg) => {
  console.log(`  ✗ ${msg}`)
  failures.push(msg)
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

page.on('response', (res) => {
  const url = res.url()
  if (url.includes('/api/') && res.status() >= 400) {
    apiErrors.push(`${res.status()} ${res.request().method()} ${url}`)
  }
})
page.on('pageerror', (err) => failures.push(`页面异常: ${err.message}`))

try {
  /* ---------- 1. 登录 ---------- */
  step('1. 登录')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[placeholder="至少 3 位"]', USER)
  await page.fill('input[placeholder="至少 6 位"]', PASS)
  await page.click('button:has-text("进入 VERYAL")')
  await page.waitForURL('**/app/chat', { timeout: 15000 })
  ok(`已进入聊天页 ${page.url()}`)

  /* ---------- 2. 会话列表 ---------- */
  step('2. 会话列表')
  await page.waitForSelector('.conv', { timeout: 15000 })
  const convCount = await page.locator('.conv').count()
  if (convCount > 0) ok(`会话数 ${convCount}`)
  else bad('会话列表为空')

  /* ---------- 3. 打开第一个会话并发送消息 ---------- */
  step('3. 发送消息')
  await page.locator('.conv').first().click()
  await page.waitForSelector('.messages', { timeout: 10000 })
  await page.waitForTimeout(800)

  const text = `自动化测试消息 ${Date.now()}`
  const input = page.locator('#composer-input')
  await input.fill(text)

  const beforeCount = await page.locator('.msg.out').count()
  await page.click('button:has-text("发送")')
  await page.waitForTimeout(2500)

  const bubble = page.locator('.bubble', { hasText: text })
  const appeared = (await bubble.count()) > 0
  const afterCount = await page.locator('.msg.out').count()
  if (appeared) ok(`消息已上屏（气泡数 ${beforeCount} → ${afterCount}）`)
  else bad('发送后消息没有出现在界面上')

  const errBanner = page.locator('.send-error')
  if ((await errBanner.count()) > 0) {
    const t = await errBanner.first().textContent()
    bad(`界面显示了发送错误：${t}`)
  }

  /* ---------- 4. 刷新后消息仍在（验证已落库） ---------- */
  step('4. 刷新校验持久化')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.conv', { timeout: 15000 })
  await page.locator('.conv').first().click()
  await page.waitForTimeout(2000)
  if ((await page.locator('.bubble', { hasText: text }).count()) > 0) ok('刷新后消息仍在')
  else bad('刷新后消息丢失')

  /* ---------- 5. 通讯录 / 文件 / 我的 ---------- */
  step('5. 页面切换')
  for (const [label, path, marker] of [
    ['通讯录', '/app/contacts', '.view-title'],
    ['文件', '/app/files', '.files-title'],
    ['我的', '/app/me', '.me-card'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForSelector(marker, { timeout: 10000 })
      ok(`${label} 页面已渲染`)
    } catch {
      bad(`${label} 页面未渲染`)
    }
  }

  /* ---------- 6. 退出登录 ---------- */
  step('6. 退出登录')
  await page.goto(`${BASE}/app/me`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('button.danger', { timeout: 25000 })
  await page.locator('button.danger').scrollIntoViewIfNeeded()
  await page.locator('button.danger').click()
  await page.waitForURL('**/login', { timeout: 15000 })
  ok('已退出并跳回登录页')

  const token = await page.evaluate(() => localStorage.getItem('veryal.token'))
  if (token === null) ok('本地令牌已清除')
  else bad('本地令牌未清除')

  /* ---------- 7. 旧令牌已失效 ---------- */
  step('7. 退出后访问受保护页面')
  await page.goto(`${BASE}/app/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  if (page.url().includes('/login')) ok('未登录被正确拦截到登录页')
  else bad(`未登录仍可进入 ${page.url()}`)
} catch (e) {
  bad(`用例异常: ${e.message}`)
} finally {
  console.log('\n──────── 结果 ────────')
  if (apiErrors.length) {
    console.log('接口错误:')
    for (const e of [...new Set(apiErrors)]) console.log(`  ! ${e}`)
  } else {
    console.log('接口错误: 无')
  }
  console.log(`断言失败: ${failures.length}`)
  for (const f of failures) console.log(`  - ${f}`)
  await browser.close()
  process.exit(failures.length === 0 && apiErrors.length === 0 ? 0 : 1)
}
