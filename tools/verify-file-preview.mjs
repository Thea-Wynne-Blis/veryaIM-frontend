/** 文件预览与外框回归，所有文件均为本地拦截的测试内容。 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { zipSync, strToU8 } from 'fflate'

const base = 'http://127.0.0.1:5188'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5188', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
let browser
let page
const errors = []
const user = { userId: '101', username: 'preview', nickname: '林晓' }
const cid = 'preview-fixture'
const makeZip = files => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strToU8(value)]))))
function pdf() {
  const stream = 'BT /F1 24 Tf 64 710 Td (Project brief) Tj 0 -42 Td /F1 13 Tf (File preview inside VERYAL) Tj ET'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  let result = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(result)); result += `${i + 1} 0 obj\n${objects[i]}\nendobj\n` }
  const xref = Buffer.byteLength(result)
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(result)
}
const document = makeZip({ 'word/document.xml': '<w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>产品交付说明</w:t></w:r></w:p><w:p><w:r><w:t>本次交付包括聊天、收藏与文件预览三个模块。</w:t></w:r></w:p><w:p><w:r><w:t>一、交互原则</w:t></w:r></w:p><w:p><w:r><w:t>点击文件即可预览；明确操作后再下载。定位只在聊天消息区域内发生。</w:t></w:r></w:p><w:p><w:r><w:t>二、验收项目</w:t></w:r></w:p><w:p><w:r><w:t>检查桌面与手机布局、原消息定位，以及图片和文档的预览体验。</w:t></w:r></w:p></w:body></w:document>' })
const workbook = makeZip({ 'xl/workbook.xml': '<workbook xmlns:r="urn:r"><sheets><sheet name="交付计划" r:id="rId1"/><sheet name="验收" r:id="rId2"/></sheets></workbook>', 'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>', 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>模块</t></is></c><c r="B1" t="inlineStr"><is><t>负责人</t></is></c></row><row><c r="A2" t="inlineStr"><is><t>文件预览</t></is></c><c r="B2" t="inlineStr"><is><t>陈一</t></is></c></row></sheetData></worksheet>', 'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>验收通过</t></is></c></row></sheetData></worksheet>' })
const slides = makeZip({ 'ppt/slides/slide1.xml': '<slide><p><t>产品交付</t></p><p><t>文件预览与消息定位</t></p></slide>', 'ppt/slides/slide2.xml': '<slide><p><t>移动端体验</t></p></slide>' })
const fixtures = [
  ['501', '交付说明.txt', 'text/plain', Buffer.from('# 项目交付说明\n点击文件先预览，再选择是否下载。\n<script>window.previewExecuted=true</script>')],
  ['502', '项目简报.pdf', 'application/pdf', pdf()],
  ['503', '产品交付说明.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', document],
  ['504', '交付计划.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', workbook],
  ['505', '交付演示.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', slides],
  ['506', '交付资料.zip', 'application/zip', makeZip({ 'notes.txt': '交付说明', 'docs/checklist.txt': '检查项目' })],
  ['507', '空白说明.txt', 'text/plain', Buffer.alloc(0)],
  ['508', '设计源文件.psd', 'application/octet-stream', Buffer.from('fixture')],
  ['509', '图片.png', 'image/png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')],
]
const files = fixtures.map(([fileId, name, contentType, body]) => ({ fileId, name, contentType, sizeBytes: body.length, createdAt: '2026-11-18T08:00:00Z' }))
let downloads = 0
const requests = []
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base)).ok) break } catch { /* 启动中 */ } await new Promise(resolve => setTimeout(resolve, 100)) }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Hong_Kong' })
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('download', () => downloads++)
  await page.addInitScript(user => { localStorage.setItem('veryal.token', 'preview-fixture'); localStorage.setItem('veryal.user', JSON.stringify(user)) }, user)
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    const p = url.pathname.replace('/api/v1', '')
    let data = []
    if (p === '/auth/me' || p === '/users/me') data = user
    else if (p === '/files/mine') data = files
    else if (/^\/files\/\d+\/(content|thumb)$/.test(p)) {
      requests.push(route.request())
      const file = fixtures.find(file => file[0] === p.split('/')[2])
      assert.equal(route.request().headers().authorization, 'Bearer preview-fixture')
      return route.fulfill({ contentType: file[2], body: file[3] })
    } else if (p === '/conversations/cards') data = [{ conversationId: cid, title: '产品设计讨论组', type: 'GROUP', memberCount: 2, lastSeq: 3, lastReadSeq: 3, lastMessagePreview: '文件已更新', lastMessageType: 'FILE', lastMessageAt: '2026-11-18T08:00:00Z', updatedAt: '2026-11-18T08:00:00Z', unreadCount: 0, pinned: false, muted: false, hidden: false }]
    else if (p.endsWith('/members')) data = [{ userId: '101', nickname: '林晓', role: 'OWNER' }, { userId: '102', nickname: '陈一', role: 'MEMBER' }]
    else if (p.endsWith('/moderation')) data = { announcement: '文件交付与预览', muteAll: false }
    else if (p.endsWith('/messages')) data = { messages: Number(url.searchParams.get('cursor')) < 3 ? [files[0], files[8], files[2]].map((file, index) => ({ messageId: String(index + 1), senderId: '102', sequence: index + 1, type: file.fileId === '509' ? 'IMAGE' : 'FILE', conversationId: cid, contentEncoding: 'base64', content: Buffer.from(JSON.stringify({ fileId: file.fileId, fileName: file.name, sizeBytes: file.sizeBytes, contentType: file.contentType })).toString('base64'), createdAt: '2026-11-18T08:00:00Z' })) : [], nextCursor: '3', hasMore: false }
    else if (p === '/search') data = { contacts: [], groups: [], messages: [], files: [{ ...files[2], messageId: '3', conversationId: cid, conversationTitle: '产品设计讨论组', senderId: '102', senderName: '陈一', type: 'FILE' }] }
    else if (p === `/conversations/${cid}/search`) data = { messages: [{ ...files[2], fileName: files[2].name, messageId: '3', seq: 3, senderId: '102', senderName: '陈一', type: 'FILE', text: '' }], nextCursor: null, hasMore: false }
    else if (p === '/favorites') data = [{ id: '901', messageId: '3', conversationId: cid, type: 'FILE', fileId: '503', fileName: files[2].name, contentType: files[2].contentType, sizeBytes: files[2].sizeBytes, senderId: '102', senderName: '陈一', conversationTitle: '产品设计讨论组', createdAt: files[2].createdAt }]
    else if (p === '/auth/ticket') return route.fulfill({ status: 503, json: { code: 503, message: 'Local fixture' } })
    else if (route.request().method() !== 'GET') data = null
    await route.fulfill({ json: { code: 0, message: 'ok', data } })
  })
  await mkdir('.shots', { recursive: true })
  await page.goto(`${base}/app/files`)
  await page.getByRole('button', { name: '预览 交付说明.txt', exact: true }).click()
  const viewer = page.getByRole('dialog', { name: '文件预览', exact: true })
  await viewer.locator('.preview-text').waitFor()
  assert.match(await viewer.locator('.preview-text').innerText(), /<script>/)
  assert.equal(await page.evaluate(() => window.previewExecuted), undefined)
  assert.equal(downloads, 0)
  await page.screenshot({ animations: 'disabled', path: '.shots/preview-text.png' })
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  await page.getByRole('button', { name: '预览 产品交付说明.docx', exact: true }).click()
  await viewer.locator('.preview-document').getByText('本次交付包括聊天、收藏与文件预览三个模块。', { exact: true }).waitFor()
  await page.screenshot({ animations: 'disabled', path: '.shots/preview-word.png' })
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  await page.getByRole('button', { name: '预览 交付计划.xlsx', exact: true }).click()
  await viewer.getByRole('cell', { name: '文件预览', exact: true }).waitFor()
  await viewer.getByRole('button', { name: '验收', exact: true }).click()
  await viewer.getByRole('cell', { name: '验收通过', exact: true }).waitFor()
  await page.screenshot({ animations: 'disabled', path: '.shots/preview-spreadsheet.png' })
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  await page.getByRole('button', { name: '预览 交付演示.pptx', exact: true }).click()
  await viewer.getByText('移动端体验', { exact: true }).waitFor()
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  await page.getByRole('button', { name: '预览 交付资料.zip', exact: true }).click()
  await viewer.getByText('docs/checklist.txt', { exact: true }).waitFor()
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  await page.getByRole('button', { name: '预览 空白说明.txt', exact: true }).click()
  await viewer.getByText('这是一个空文件', { exact: true }).waitFor()
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  const beforeUnsupported = requests.length
  await page.getByRole('button', { name: '预览 设计源文件.psd', exact: true }).click()
  await viewer.getByText('此格式暂不支持在线展开', { exact: true }).waitFor()
  assert.equal(requests.length, beforeUnsupported)
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  await page.getByRole('button', { name: '预览 图片.png', exact: true }).click()
  await viewer.getByRole('img', { name: '图片.png', exact: true }).waitFor()
  await viewer.getByRole('button', { name: '放大图片', exact: true }).click()
  await viewer.getByText('125%', { exact: true }).waitFor()
  await viewer.getByRole('button', { name: '图片适合窗口', exact: true }).click()
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  await page.getByRole('button', { name: '预览 项目简报.pdf', exact: true }).click()
  await viewer.locator('iframe[title="PDF 文件预览"]').waitFor()
  assert.match(await viewer.locator('iframe').getAttribute('src'), /^blob:/)
  assert.equal(downloads, 0)
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  await page.goto(`${base}/app/chat/c/${cid}`)
  await page.getByRole('button', { name: '预览 交付说明.txt', exact: true }).click()
  await viewer.locator('.preview-text').waitFor()
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  await page.getByRole('button', { name: '预览 图片.png', exact: true }).click()
  await viewer.getByRole('img', { name: '图片.png', exact: true }).waitFor()
  assert.equal(page.context().pages().length, 1)
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  await page.keyboard.press('Control+k')
  await page.getByRole('complementary', { name: '搜索', exact: true }).getByRole('searchbox').fill('交付')
  await page.getByRole('button', { name: '预览 产品交付说明.docx', exact: true }).click()
  await viewer.locator('.preview-document').waitFor()
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  await page.getByRole('button', { name: '关闭搜索', exact: true }).click()
  await page.keyboard.press('Control+f')
  const history = page.getByRole('dialog').filter({ has: page.locator('.history-window') })
  await history.getByRole('button', { name: '预览 产品交付说明.docx', exact: true }).click()
  await viewer.locator('.preview-document').waitFor()
  await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  assert.equal(await history.isVisible(), true)
  await history.getByRole('button', { name: '关闭聊天记录', exact: true }).click()
  await page.goto(`${base}/app/favorites`)
  await page.locator('.fav-preview').first().click()
  const favorite = page.getByRole('dialog', { name: '收藏详情', exact: true })
  await favorite.locator('.preview-document').waitFor()
  assert.equal(downloads, 0)
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    if (await favorite.count()) await favorite.getByRole('button', { name: '关闭收藏详情', exact: true }).click()
    await page.goto(`${base}/app/files`)
    await page.getByRole('button', { name: '预览 交付计划.xlsx', exact: true }).click()
    await viewer.getByRole('cell', { name: '文件预览', exact: true }).waitFor()
    assert.equal(await viewer.evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true)
    await viewer.getByRole('button', { name: '关闭文件预览', exact: true }).click()
  }
  assert.deepEqual(errors, [])
  console.log('PASS: 聊天、文件中心、全局/聊天搜索及收藏预览；图片缩放、PDF、TXT、空文件、Word、Excel、PPT、ZIP、HTML 安全展示、鉴权请求和移动布局')
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ animations: 'disabled', path: '.shots/file-preview-failure.png' }).catch(() => {})
  console.error('Page errors:', errors)
  throw error
} finally { await browser?.close(); server.kill() }
