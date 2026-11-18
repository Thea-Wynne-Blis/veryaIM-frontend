/** 本地确定性 UI 回归：仅拦截测试数据，不读取或修改线上账号。 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const port = 5186
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
const errors = []
let browser
const user = { userId: '101', username: 'search_test', nickname: '林晓' }
const cid = 'search-fixture'
const createdAt = '2026-11-18T08:02:00Z'
const members = [
  { userId: '101', nickname: '林晓', role: 'OWNER', online: true },
  { userId: '102', nickname: '陈一', role: 'MEMBER', online: true },
  { userId: '103', nickname: '许知远', role: 'MEMBER', online: false },
]
const recent = { messageId: '900', conversationId: cid, senderId: '102', sequence: 900, type: 'TEXT', content: '今天把设计方案再确认一下，文件已经发到群里了。', contentEncoding: 'utf8', createdAt }
const hit = (id, text, extra = {}) => ({ messageId: String(id), seq: id, senderId: '102', senderName: '陈一', type: 'TEXT', text, createdAt, fileId: null, fileName: null, sizeBytes: null, contentType: null, ...extra })
const fixtures = [
  hit(15, '设计方案已经更新，大家看一下，有问题随时沟通。'),
  hit(14, '', { type: 'FILE', fileId: '201', fileName: '产品设计方案 v3.pdf', sizeBytes: 2457600 }),
  hit(13, '参考链接：https://example.com/design'),
  hit(12, '', { type: 'IMAGE', fileId: '202', fileName: '首页设计效果图.png', sizeBytes: 512000 }),
  hit(11, '昨天讨论的方案我整理好了，明天上午一起过一遍。'),
]
let requests = []
let contextRequested = false
let alphaCount = 0
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (server.exitCode != null) throw new Error('测试预览服务启动失败')
    try { if ((await fetch(base)).ok) break } catch { /* 启动中 */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Hong_Kong' })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({ user }) => {
    localStorage.setItem('veryal.token', 'local-search-fixture')
    localStorage.setItem('veryal.user', JSON.stringify(user))
  }, { user })
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    const p = url.pathname.replace('/api/v1', '')
    let data = []
    if (p === '/auth/me') data = user
    else if (p === '/conversations/cards') data = [{ conversationId: cid, title: '产品设计讨论组', type: 'GROUP', memberCount: 3, lastSeq: 900, lastReadSeq: 900, lastMessageType: 'TEXT', lastMessagePreview: recent.content, updatedAt: createdAt, lastMessageAt: createdAt, unreadCount: 0, pinned: false, muted: false, hidden: false }]
    else if (p === `/groups/${cid}/members`) data = members
    else if (p === `/groups/${cid}/moderation`) data = { announcement: '每周三同步设计进展，相关文件请在聊天记录中查找。', muteAll: false }
    else if (p.endsWith('/context')) { contextRequested = true; data = { messages: [{ ...recent, messageId: '15', sequence: 15, content: fixtures[0].text }], nextCursor: null, hasMore: false } }
    else if (p === `/conversations/${cid}/messages`) data = { messages: Number(url.searchParams.get('cursor')) < 900 ? [recent] : [], nextCursor: 900, hasMore: false }
    else if (p === `/conversations/${cid}/search`) {
      requests.push(url)
      const query = url.searchParams.get('keyword') ?? ''
      const category = url.searchParams.get('category')
      if (query === 'A') {
        const call = ++alphaCount
        await new Promise(resolve => setTimeout(resolve, call === 1 ? 900 : 30))
        data = { messages: [hit(20, call === 1 ? '过期的 A 请求' : '最终 A 结果')], nextCursor: null, hasMore: false }
      } else if (query === 'B') {
        await new Promise(resolve => setTimeout(resolve, 500))
        data = { messages: [hit(21, '过期的 B 请求')], nextCursor: null, hasMore: false }
      } else {
        let rows = fixtures.filter(row => !query || `${row.text} ${row.fileName ?? ''}`.includes(query))
        if (category === 'FILE') rows = rows.filter(row => row.type === 'FILE')
        if (category === 'MEDIA') rows = rows.filter(row => ['IMAGE', 'VIDEO'].includes(row.type))
        if (category === 'LINK') rows = rows.filter(row => row.text.includes('https://'))
        if (category === 'AUDIO') rows = []
        if (url.searchParams.has('senderId') && url.searchParams.get('senderId') !== '102') rows = []
        data = { messages: url.searchParams.has('cursor') ? [hit(10, '更早的记录')] : rows, nextCursor: '11', hasMore: !query && category === 'ALL' && !url.searchParams.has('cursor') }
      }
    } else if (p === '/search') data = { contacts: [{ userId: '102', name: '设计同学', nickname: '陈一', online: true }], groups: [], messages: [{ messageId: '15', conversationId: cid, conversationTitle: '产品设计讨论组', senderId: '102', senderName: '陈一', text: '设计方案已确认', createdAt }], files: [] }
    else if (p === '/auth/ticket') return route.fulfill({ status: 503, json: { code: 503, message: 'Local fixture' } })
    else if (route.request().method() !== 'GET') data = null
    await route.fulfill({ json: { code: 0, message: 'ok', data } })
  })
  await page.goto(`${base}/app/chat/c/${cid}`)
  const sidebar = page.getByRole('complementary', { name: '会话详情', exact: true })
  await sidebar.getByText('查找聊天内容', { exact: true }).waitFor()
  assert.equal(await sidebar.getByRole('tab', { name: '文件' }).count(), 0)
  await mkdir('.shots', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.shots/chat-sidebar.png' })
  await sidebar.getByText('查找聊天内容', { exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.locator('.history-hit').first().waitFor()
  assert.equal(await modal.locator('.history-hit').count(), 5)
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '搜索聊天内容或文件名')
  await page.screenshot({ animations: 'disabled', path: '.shots/chat-search.png' })
  await modal.getByText('加载更多记录', { exact: true }).click()
  await modal.getByText('更早的记录', { exact: true }).waitFor()
  assert.equal(await modal.locator('.history-hit').count(), 6)
  await modal.getByRole('button', { name: '文件', exact: true }).click()
  await modal.locator('.history-file-name').getByText('产品设计方案 v3.pdf', { exact: true }).waitFor()
  assert.equal(await modal.locator('.history-hit').count(), 1)
  await modal.getByRole('button', { name: '图片与视频', exact: true }).click()
  await modal.getByText('首页设计效果图.png', { exact: true }).waitFor()
  await modal.getByRole('button', { name: '全部', exact: true }).click()
  const search = modal.getByRole('searchbox')
  await search.fill('设计')
  await modal.locator('mark').first().waitFor()
  assert.ok(await modal.locator('mark').count() >= 3)
  await modal.getByLabel('按发送人筛选').selectOption('102')
  await modal.getByLabel('按日期筛选').fill('2026-11-18')
  await page.waitForFunction(() => !document.querySelector('.history-results[aria-busy="true"]'))
  assert.equal(requests.at(-1).searchParams.get('senderId'), '102')
  assert.equal(requests.at(-1).searchParams.get('from'), '2026-11-17T16:00:00.000Z')
  await search.fill('不存在的文件')
  await modal.getByText('没有找到相关聊天内容', { exact: true }).waitFor()
  await modal.getByRole('button', { name: '重置', exact: true }).click()
  await modal.locator('.history-hit').first().waitFor()
  // A → B → A：较早同关键词的请求也不能覆盖最后一次结果。
  await search.fill('A')
  await page.waitForRequest(request => new URL(request.url()).searchParams.get('keyword') === 'A')
  await search.fill('B')
  await page.waitForRequest(request => new URL(request.url()).searchParams.get('keyword') === 'B')
  await search.fill('A')
  await modal.getByText('最终 A 结果', { exact: false }).waitFor()
  await page.waitForTimeout(900)
  assert.match(await modal.innerText(), /最终 A 结果/)
  assert.doesNotMatch(await modal.innerText(), /过期的/)
  await modal.getByRole('button', { name: '重置', exact: true }).click()
  await modal.locator('.history-hit').first().waitFor()
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  assert.equal(await modal.getByLabel('按日期筛选').evaluate(input => getComputedStyle(input).colorScheme), 'dark')
  await page.screenshot({ animations: 'disabled', path: '.shots/chat-search-dark.png' })
  await modal.locator('.history-hit-main').first().click()
  await page.locator('[data-mid="15"].flash').waitFor()
  assert.equal(contextRequested, true)
  await page.keyboard.press('Control+f')
  await modal.waitFor()
  await page.keyboard.press('Escape')
  await modal.waitFor({ state: 'detached' })
  await page.keyboard.press('Control+k')
  const global = page.getByRole('complementary', { name: '搜索', exact: true })
  await global.getByRole('searchbox').fill('设计')
  await global.getByText('设计同学', { exact: true }).waitFor()
  await global.getByRole('button', { name: '聊天记录', exact: true }).click()
  assert.equal(await global.getByText('设计同学', { exact: true }).count(), 0)
  assert.equal(await global.locator('button button').count(), 0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '查找聊天内容', exact: true }).click()
  await modal.locator('.history-hit').first().waitFor()
  const rect = await modal.boundingBox()
  assert.ok(rect.width <= 390 && rect.height <= 844)
  await page.screenshot({ animations: 'disabled', path: '.shots/chat-search-mobile.png' })
  assert.deepEqual(errors, [])
  console.log('PASS: 侧栏入口、分类、分页、高亮、组合筛选、空结果、A/B/A 请求竞态、旧消息定位、快捷键、全局搜索、移动端及明暗主题')
} finally {
  await browser?.close()
  server.kill()
}
