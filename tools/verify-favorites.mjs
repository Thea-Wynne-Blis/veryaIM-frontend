/** 收藏的本地 UI 与导航回归，只使用拦截数据。 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const base = 'http://127.0.0.1:5187'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5187', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
let browser
let page
const errors = []
const cid = 'favorite-fixture'
const user = { userId: '101', username: 'fixture', nickname: '林晓' }
const mid = seq => String(380000000000000000n + BigInt(seq))
const text = '周五发布前，先确认这三件事：\n1. 更新首页与移动端的交互稿\n2. 整理交付文件和组件说明\n3. 和研发确认上线检查项\n\n有变动我们在群里同步。'
const snapshot = (id, messageId, type, extra = {}) => ({ id: String(390000000000000000n + BigInt(id)), messageId, conversationId: cid, type, text: null, fileId: null, fileName: null, sizeBytes: null, contentType: null, senderId: '102', senderName: '陈一', conversationTitle: '产品设计讨论组', createdAt: `2026-11-18T0${8 - id}:30:00Z`, ...extra })
let favorites = [
  snapshot(1, mid(12), 'TEXT', { text }),
  snapshot(2, mid(13), 'FILE', { fileId: '201', fileName: '产品设计交付说明 v3.pdf', sizeBytes: 2457600, contentType: 'application/pdf' }),
  snapshot(3, mid(14), 'IMAGE', { fileId: '202', fileName: '首页布局探索.png', sizeBytes: 512000, contentType: 'image/png' }),
  snapshot(4, mid(15), 'TEXT', { text: '交互动效参考\nhttps://example.com/design\n卡片切换和消息定位的反馈可以参考这里。', senderName: '许知远', senderId: '103' }),
  snapshot(5, mid(99), 'TEXT', { text: '这是一条仍可查看的收藏快照。原消息已撤回，项目备忘仍保存在这里。' }),
  snapshot(6, mid(98), 'AUDIO', { conversationId: 'left-group', conversationTitle: '项目沟通群', fileId: '203', fileName: '需求沟通.webm', sizeBytes: 98400, contentType: 'audio/webm' }),
]
let slow = false
let recalled = false
let failList = false
let downloadAuth = ''
const contextCalls = []
const imageSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#dbece7"/><rect x="58" y="44" width="524" height="332" rx="22" fill="#fff"/><rect x="82" y="70" width="116" height="22" rx="6" fill="#12876f"/><rect x="82" y="122" width="230" height="118" rx="12" fill="#e7f3ef"/><circle cx="197" cy="182" r="33" fill="#12876f"/><rect x="336" y="126" width="202" height="14" rx="7" fill="#d2dedb"/><rect x="336" y="158" width="148" height="10" rx="5" fill="#e7edeb"/><rect x="336" y="190" width="176" height="10" rx="5" fill="#e7edeb"/><rect x="336" y="222" width="82" height="26" rx="6" fill="#12876f"/><rect x="82" y="268" width="456" height="10" rx="5" fill="#e7edeb"/><rect x="82" y="294" width="366" height="10" rx="5" fill="#e7edeb"/><rect x="82" y="320" width="404" height="10" rx="5" fill="#e7edeb"/></svg>'
const message = seq => ({ messageId: mid(seq), conversationId: cid, senderId: seq % 2 ? '101' : '102', sequence: seq, type: 'TEXT', contentEncoding: 'utf8', content: seq === 12 ? text : `第 ${seq} 条聊天内容，用于验证定位后不会自动回到最新消息。`, createdAt: '2026-11-18T08:00:00Z' })

async function assertLocated(selector) {
  const target = page.locator(`${selector} [data-mid="${mid(12)}"]`)
  await target.waitFor()
  const inside = () => page.evaluate(({ selector, id }) => {
    const area = document.querySelector(selector)?.getBoundingClientRect()
    const row = document.querySelector(`${selector} [data-mid="${id}"]`)?.getBoundingClientRect()
    return !!area && !!row && row.top >= area.top - 2 && row.bottom <= area.bottom + 2
  }, { selector, id: mid(12) })
  assert.equal(await inside(), true)
  assert.equal(await page.evaluate(() => window.scrollY === 0 && window.scrollX === 0 &&
    [...document.querySelectorAll('.stage, .frame')].every(el => el.scrollTop === 0 && el.scrollLeft === 0)), true, '定位只能滚动消息列表')
  const frame = await page.locator('.frame').count() ? await page.locator('.frame').boundingBox() : null
  if (frame) assert.ok(frame.y >= 0 && frame.y + frame.height <= page.viewportSize().height + 1, '外框必须保持完整可见')
  await page.waitForTimeout(300)
  assert.equal(await inside(), true)
}

try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base)).ok) break } catch { /* 启动中 */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Hong_Kong' })
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(user => { localStorage.setItem('veryal.token', 'favorites-fixture'); localStorage.setItem('veryal.user', JSON.stringify(user)) }, user)
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    const p = url.pathname.replace('/api/v1', '')
    let data = []
    if (p === '/auth/me' || p === '/users/me') data = user
    else if (p === '/users/me/privacy') data = {}
    else if (p === '/favorites') {
      if (failList) return route.fulfill({ status: 503, json: { code: 503, message: '加载暂时失败，请重试' } })
      if (route.request().method() === 'POST') data = favorites[0]
      else data = favorites
    } else if (p.startsWith('/favorites/') && route.request().method() === 'DELETE') {
      favorites = favorites.filter(row => String(row.id) !== p.split('/').at(-1)); data = null
    } else if (p === '/conversations/cards') data = [{ conversationId: cid, title: '产品设计讨论组', type: 'GROUP', memberCount: 2, lastSeq: 240, lastReadSeq: 240, lastMessagePreview: '刚刚更新了设计稿', lastMessageType: 'TEXT', lastMessageAt: '2026-11-18T08:00:00Z', updatedAt: '2026-11-18T08:00:00Z', unreadCount: 0, pinned: false, muted: false, hidden: false }]
    else if (p.endsWith('/context')) {
      const id = p.split('/').at(-2)
      contextCalls.push(id)
      if (id === mid(99) || (recalled && id === mid(12))) return route.fulfill({ status: 404, json: { code: 404, message: 'message not found' } })
      if (p.includes('left-group')) return route.fulfill({ status: 403, json: { code: 403, message: 'not a member' } })
      if (slow) await new Promise(resolve => setTimeout(resolve, 700))
      data = { messages: Array.from({ length: 40 }, (_, index) => message(index + 1)), nextCursor: '40', hasMore: true }
    } else if (p.endsWith('/messages')) {
      const cursor = Number(url.searchParams.get('cursor'))
      data = { messages: cursor < 240 ? Array.from({ length: 60 }, (_, i) => message(i + 181)) : [], nextCursor: '240', hasMore: false }
    } else if (p.endsWith('/members')) data = [{ userId: '101', nickname: '林晓', role: 'OWNER' }, { userId: '102', nickname: '陈一', role: 'MEMBER' }]
    else if (p.endsWith('/moderation')) data = { announcement: '设计资料与交付文件统一整理在群内。', muteAll: false }
    else if (p.startsWith('/files/202/')) return route.fulfill({ contentType: 'image/svg+xml', body: imageSvg })
    else if (p === '/files/201/content') { downloadAuth = route.request().headers().authorization; return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4 fixture' }) }
    else if (p === '/auth/ticket') return route.fulfill({ status: 503, json: { code: 503, message: 'Local fixture' } })
    else if (route.request().method() !== 'GET') data = null
    await route.fulfill({ json: { code: 0, message: 'ok', data } }).catch(() => {})
  })
  await mkdir('.shots', { recursive: true })
  await page.goto(`${base}/app/favorites`)
  const favoritesView = page.getByRole('region', { name: '我的收藏', exact: true })
  await favoritesView.locator('.fav-card').first().waitFor()
  assert.equal(await favoritesView.locator('.fav-card').count(), 6)
  await page.screenshot({ animations: 'disabled', path: '.shots/favorites-desktop.png' })
  await favoritesView.getByRole('button', { name: '文件', exact: true }).click()
  assert.equal(await favoritesView.locator('.fav-card').count(), 1)
  await favoritesView.getByRole('button', { name: '全部', exact: true }).click()
  await favoritesView.getByRole('searchbox').fill('研发')
  assert.equal(await favoritesView.locator('.fav-card').count(), 1)
  await favoritesView.locator('.fav-preview').first().click()
  const detail = page.getByRole('dialog', { name: '收藏详情', exact: true })
  await detail.waitFor()
  assert.equal(new URL(page.url()).pathname, '/app/favorites')
  assert.equal(await detail.locator('.favorite-full-text').innerText(), text)
  await page.screenshot({ animations: 'disabled', path: '.shots/favorites-detail.png' })
  await detail.getByRole('button', { name: '查看原消息', exact: true }).click()
  await page.waitForURL(`**/app/chat/c/${cid}`)
  await page.locator(`[data-mid="${mid(12)}"].flash`).waitFor()
  assert.equal(contextCalls.at(-1), mid(12))
  await assertLocated('.messages')
  await page.setViewportSize({ width: 1688, height: 842 })
  await assertLocated('.messages')
  await page.screenshot({ path: '.shots/workspace-compact.png' })
  assert.ok((await page.locator('.frame').boundingBox()).width <= 1280)
  await page.setViewportSize({ width: 1440, height: 860 })
  await assertLocated('.messages')
  await page.getByRole('button', { name: '收藏', exact: true }).click()
  await favoritesView.locator('.fav-card').first().waitFor()
  // 即使缓存里已有消息，也重新确认原消息当前是否可访问。
  recalled = true
  await favoritesView.locator('.fav-preview').first().click()
  await detail.getByRole('button', { name: '查看原消息', exact: true }).click()
  await detail.getByRole('alert').filter({ hasText: '收藏内容仍可查看' }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/app/favorites')
  assert.equal(await detail.locator('.favorite-full-text').innerText(), text)
  await detail.getByRole('button', { name: '关闭收藏详情', exact: true }).click()
  recalled = false
  // 取消正在等待的定位，不得在关闭预览后突然跳走。
  slow = true
  await favoritesView.locator('.fav-preview').first().click()
  const request = page.waitForRequest(request => request.url().includes(`/messages/${mid(12)}/context`))
  await detail.getByRole('button', { name: '查看原消息', exact: true }).click()
  await request
  await detail.getByRole('button', { name: '关闭收藏详情', exact: true }).click()
  await page.waitForTimeout(850)
  assert.equal(new URL(page.url()).pathname, '/app/favorites')
  slow = false
  await favoritesView.getByRole('button', { name: '文件', exact: true }).click()
  await favoritesView.locator('.fav-preview').first().click()
  const download = page.waitForEvent('download')
  await detail.getByRole('button', { name: '下载', exact: true }).click()
  assert.equal((await download).suggestedFilename(), '产品设计交付说明 v3.pdf')
  assert.equal(downloadAuth, 'Bearer favorites-fixture')
  await detail.getByRole('button', { name: '取消收藏', exact: true }).click()
  await detail.waitFor({ state: 'detached' })
  assert.equal(favorites.length, 5)
  await favoritesView.getByText('没有找到相关收藏', { exact: true }).waitFor()
  await favoritesView.getByRole('button', { name: '清除筛选', exact: true }).click()
  failList = true
  await favoritesView.getByRole('button', { name: '刷新收藏', exact: true }).click()
  await favoritesView.getByRole('alert').waitFor()
  assert.equal(await favoritesView.locator('.fav-card').count(), 5)
  failList = false
  await favoritesView.getByRole('button', { name: '重新加载', exact: true }).click()
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await page.screenshot({ animations: 'disabled', path: '.shots/favorites-dark.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${base}/app/favorites`)
  await favoritesView.locator('.fav-card').first().waitFor()
  await page.screenshot({ animations: 'disabled', path: '.shots/favorites-mobile.png' })
  await favoritesView.locator('.fav-preview').first().click()
  await detail.getByRole('button', { name: '查看原消息', exact: true }).click()
  await page.locator(`.m-messages [data-mid="${mid(12)}"].flash`).waitFor()
  await detail.waitFor({ state: 'detached' })
  await assertLocated('.m-messages')
  await page.getByRole('region', { name: '聊天', exact: true }).getByRole('button', { name: '返回', exact: true }).click()
  await page.waitForURL('**/app/favorites')
  await page.getByRole('region', { name: '聊天', exact: true }).waitFor({ state: 'detached' })
  await favoritesView.getByRole('button', { name: '语音', exact: true }).click()
  await favoritesView.locator('.fav-preview').first().click()
  await detail.getByRole('button', { name: '查看原消息', exact: true }).click()
  await detail.getByRole('alert').filter({ hasText: '原会话已不可访问' }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/app/favorites')
  await detail.getByRole('button', { name: '关闭收藏详情', exact: true }).click()
  await favoritesView.getByRole('button', { name: '返回我的', exact: true }).click()
  await page.getByRole('button', { name: '我的收藏', exact: true }).click()
  await favoritesView.locator('.fav-card').first().waitFor()
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await favoritesView.evaluate(view => view.scrollWidth <= view.clientWidth), true)
    await favoritesView.locator('.fav-preview').first().click()
    assert.equal(await detail.evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true)
    await detail.getByRole('button', { name: '关闭收藏详情', exact: true }).click()
  }
  assert.deepEqual(errors, [])
  console.log('PASS: 收藏分类、搜索、完整预览、19 位消息 ID、旧消息定位及滚动稳定、撤回/失权快照、取消定位、鉴权下载、取消收藏、失败重试、移动入口与返回、320–768px 和明暗主题')
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ animations: 'disabled', path: '.shots/favorites-failure.png' }).catch(() => {})
  console.error('Page errors:', errors)
  throw error
} finally {
  await browser?.close()
  server.kill()
}
