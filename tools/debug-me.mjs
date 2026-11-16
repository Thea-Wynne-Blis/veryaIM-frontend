import { chromium } from 'playwright-core'

const BASE = 'http://82.157.47.151:8899'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()

page.on('console', (m) => console.log(`[console:${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`))
page.on('requestfailed', (r) => console.log(`[reqfail] ${r.url()} ${r.failure()?.errorText}`))
page.on('response', async (r) => {
  if (r.url().includes('/api/')) {
    let body = ''
    if (r.status() >= 400) {
      try { body = (await r.text()).slice(0, 200) } catch {}
    }
    console.log(`[api] ${r.status()} ${r.request().method()} ${r.url()} ${body}`)
  }
})

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[placeholder="至少 3 位"]', 'demo_alice')
await page.fill('input[placeholder="至少 6 位"]', 'password123')
await page.click('button:has-text("进入 VERYAL")')
await page.waitForURL('**/app/chat', { timeout: 20000 })
console.log('--- 已登录 ---')

await page.goto(`${BASE}/app/me`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
console.log('--- /app/me 页面结构 ---')
console.log('me-cards:', await page.locator('.me-card').count())
console.log('me-loading:', await page.locator('.me-loading').count())
console.log('danger-btn:', await page.locator('button.danger').count())
const text = await page.locator('body').innerText()
console.log('--- body 文本（前 600 字）---')
console.log(text.slice(0, 600))
await browser.close()
