import { chromium } from 'playwright-core'

const BASE = 'http://82.157.47.151:8899'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()

page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('request', (r) => {
  if (r.url().includes('/api/v1/groups')) {
    console.log(`[req] ${r.method()} ${r.url()}`)
    console.log('      postData:', r.postData())
  }
})
page.on('response', async (r) => {
  if (r.url().includes('/api/v1/groups')) {
    let body = ''
    try { body = (await r.text()).slice(0, 300) } catch {}
    console.log(`[res] ${r.status()} ${r.request().method()} ${r.url()}`)
    console.log('      body:', body)
  }
})

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[placeholder="至少 3 位"]', 'demo_alice')
await page.fill('input[placeholder="至少 6 位"]', 'password123')
await page.click('button:has-text("进入 VERYAL")')
await page.waitForURL('**/app/chat', { timeout: 20000 })
await page.waitForSelector('.conv', { timeout: 15000 })
await page.waitForTimeout(500)

await page.click('button[aria-label="新建会话"]')
await page.waitForTimeout(300)
await page.click('.new-item:has-text("创建群聊")')
await page.waitForTimeout(1500)
console.log('pick-row:', await page.locator('.pick-row').count())

const name = `调试建群 ${Date.now().toString().slice(-5)}`
await page.fill('input[placeholder="给群起个名字"]', name)
const picks = page.locator('.pick-row')
for (let i = 0; i < Math.min(2, await picks.count()); i++) await picks.nth(i).click()
console.log('已选:', await page.locator('.picked-hint').textContent().catch(() => 'n/a'))

await page.click('.dialog-foot button.primary')
await page.waitForTimeout(3000)
console.log('创建对话是否关闭:', (await page.locator('.dialog').count()) === 0)
await page.screenshot({ path: 'tools/debug-group.png' })
await browser.close()
