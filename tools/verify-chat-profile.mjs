/**
 * 聊天里点头像看资料（生产环境实测）：
 *  1. 单聊：点顶部头像 / 消息头像 / 发送者昵称 → 打开好友资料卡（地区 + 签名 + 添加时间）；
 *  2. 群聊：点成员消息头像 → 好友 / 陌生人资料卡，点自己的消息头像 → 自己；
 *  3. 会话详情右侧成员格也能点开资料卡；
 *  4. 资料卡里点「发消息」能回到对应单聊。
 */
import { chromium } from 'playwright-core'

const BASE = process.env.VERYAL_BASE ?? 'http://82.157.47.151:8899'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const DIRECT = '鲍勃'
const GROUP = '产品设计小组'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`)
}

/** 拿一个账号的 token：前置准备每次换新 deviceId，避免「设备已绑定」。 */
async function loginToken(username, devicePrefix) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      deviceId: `${devicePrefix}-${Date.now()}`,
      platform: 'LINUX',
      deviceName: devicePrefix,
    }),
  })
  const { data } = await res.json()
  return data?.token
}

/**
 * 脚本会把群里的「陌生人」加成好友，重复跑时按钮会变成「申请已发送」。
 * 每次先把 demo_alice 待处理的 outgoing 申请撤掉，保证断言只看得到「加好友」。
 */
async function resetOutgoingFriendRequests(token) {
  if (!token) return
  const list = await fetch(`${BASE}/api/v1/friends/requests?direction=outgoing`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  // 请求 ID 是雪花 ID，超过 2^53，用文本正则取原始数字避免精度丢失。
  const text = await list.text()
  const ids = [...text.matchAll(/"requestId":(\d+)(?=[^{}]*"status":"PENDING")/g)].map(
    (match) => match[1],
  )
  for (const id of ids) {
    await fetch(`${BASE}/api/v1/friends/requests/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  }
}

/**
 * 单聊最近一页可能全是 Alice 自己发的消息，这时「消息头像」没有对方气泡可点。
 * 先用 demo_bob 的身份补一条，保证最近一页一定有对方消息。
 */
async function seedIncomingMessage() {
  const token = await loginToken('demo_bob', 'seed-in')
  if (!token) return
  const cards = await fetch(`${BASE}/api/v1/conversations/cards`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  const direct = (cards.data ?? []).find(
    (card) => card.type === 'PRIVATE' && card.title?.includes('爱丽丝'),
  )
  if (!direct) return
  await fetch(`${BASE}/api/v1/conversations/${direct.conversationId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: direct.conversationId,
      clientMessageId: `seed-${Date.now()}`,
      type: 'TEXT',
      content: `头像实测 seed ${new Date().toISOString()}`,
    }),
  })
}

/**
 * 反过来：最近一页也可能全是 Alice 自己发的，「自己的消息头像」就没有气泡可点。
 * 用 Alice 自己的 token 再补一条，保证最近一页一定有 .msg.out。
 */
async function seedOutgoingMessage(token) {
  if (!token) return
  const cards = await fetch(`${BASE}/api/v1/conversations/cards`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  // 会话标题可能是好友备注，这里按好友 id 找会话，不靠昵称匹配。
  const friends = await fetch(`${BASE}/api/v1/friends`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  const bob = (friends.data ?? []).find((friend) => friend.nickname === '鲍勃')
  if (!bob) return
  const direct = (cards.data ?? []).find(
    (card) => card.type === 'PRIVATE' && String(card.peerUserId) === String(bob.friendId),
  )
  if (!direct) return
  await fetch(`${BASE}/api/v1/conversations/${direct.conversationId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: direct.conversationId,
      clientMessageId: `seed-out-${Date.now()}`,
      type: 'TEXT',
      content: `自拍实测 seed ${new Date().toISOString()}`,
    }),
  })
}

// 清理是「让脚本可重复跑」的辅助步骤，网络抖动不应该让整轮实测直接崩掉。
// 两次前置登录合并成一次 Alice 登录，少打一次登录限流。
try {
  const aliceToken = await loginToken('demo_alice', 'prep')
  await resetOutgoingFriendRequests(aliceToken)
  await seedOutgoingMessage(aliceToken)
  await seedIncomingMessage()
} catch (e) {
  console.log('[warn] 实测前置准备失败，继续跑：', e.message)
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

const cardSel = '.card[aria-label="用户资料"]'

async function waitCard() {
  await page.waitForSelector(cardSel, { timeout: 10000 })
  await page.waitForFunction(
    (sel) => {
      const card = document.querySelector(sel)
      return card && !card.querySelector('.loading')
    },
    cardSel,
    { timeout: 15000 },
  )
  return page.locator(cardSel).innerText()
}

async function closeCard() {
  await page.click(`${cardSel} button[aria-label="关闭"]`)
  await page.waitForSelector(cardSel, { state: 'detached', timeout: 10000 })
}

async function openConversation(name) {
  // 「发消息」之后列表会刷新，可能刚点的会话被异步切换覆盖，这里允许重试。
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('.conv', { hasText: name }).first().click()
    try {
      await page.waitForFunction(
        (target) => document.querySelector('.chat-title')?.textContent?.includes(target),
        name,
        { timeout: 4000 },
      )
      await page.waitForTimeout(900)
      return
    } catch {
      /* 下一轮重试 */
    }
  }
  throw new Error(`打不开会话：${name}`)
}

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[placeholder="至少 3 位"]', 'demo_alice')
await page.fill('input[placeholder="至少 6 位"]', 'password123')
await page.click('button:has-text("进入 VERYAL")')
await page.waitForURL('**/app/chat', { timeout: 25000 })
await page.waitForSelector('.conv', { timeout: 20000 })

// 会话列表第二行：不显示占位文案，也不显示系统提示，只显示真实消息。
const previews = await page.locator('.conv-preview').allTextContents()
check('conversation list has no placeholder preview',
  !previews.includes('还没有消息'), previews.join(' | '))
check('system notices stay out of conversation previews',
  !previews.some((text) => text.includes('禁言')), previews.join(' | '))

// 群聊预览必须是「姓名：内容」，且后端卡片与列表渲染对得上。
const previewContract = await page.evaluate(async () => {
  const token = localStorage.getItem('veryal.token')
  if (!token) return { error: 'no token' }
  const res = await fetch('/api/v1/conversations/cards', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  const cards = body.data ?? []
  const friends = await fetch('/api/v1/friends', {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  const bob = (friends.data ?? []).find((friend) => friend.nickname === '鲍勃')
  const rows = [...document.querySelectorAll('.conv')].map((el) => ({
    name: el.querySelector('.conv-name')?.textContent?.trim() ?? '',
    preview: el.querySelector('.conv-preview')?.textContent?.trim() ?? '',
  }))
  return {
    cards,
    rows,
    bobId: bob ? String(bob.friendId) : null,
    // 群里的作者名现在优先显示好友备注，和单聊标题保持一致。
    bobDisplayName: bob ? (bob.remark?.trim() || bob.nickname) : null,
  }
})
if (previewContract.error) {
  check('group preview renders sender name prefix', false, previewContract.error)
} else {
  const groupCard = previewContract.cards.find(
    (card) => card.type === 'GROUP' && card.lastMessagePreview,
  )
  if (!groupCard) {
    check('group preview renders sender name prefix', false, '没有带消息的群会话可验证')
  } else {
    const row = previewContract.rows.find((item) => item.name === groupCard.title)
    const expected = `${groupCard.lastMessageSenderName}：${groupCard.lastMessagePreview}`
    check('group preview renders sender name prefix',
      Boolean(row) && row.preview === expected,
      JSON.stringify({ title: groupCard.title, expected, got: row?.preview }))
  }
  const emptyCards = previewContract.cards.filter((card) => !card.lastMessagePreview)
  check('cards without real messages render empty preview',
    emptyCards.every((card) =>
      previewContract.rows.find((row) => row.name === card.title)?.preview === ''),
    JSON.stringify(emptyCards.map((card) => card.title)))
}

// ---------- 1. 单聊：顶部头像 ----------
// 会话标题可能是好友备注（demo_alice 给鲍勃设了备注），按鲍勃的会话卡片取真实标题。
const directCard = previewContract.cards?.find(
  (card) => card.type === 'PRIVATE' && String(card.peerUserId) === previewContract.bobId,
)
const DIRECT_ROW = directCard?.title ?? DIRECT
/** 群聊里鲍勃的显示名：有备注时是备注，没备注才是昵称。 */
const FRIEND = previewContract.bobDisplayName ?? DIRECT
await openConversation(DIRECT_ROW)
await page.waitForSelector('.msg', { timeout: 15000 })
check('direct chat has message avatars',
  (await page.locator('.msg-avatar-slot .avatar-btn').count()) > 0)

const headAvatar = page.locator('.chat-head .head-avatar')
await headAvatar.click()
const fromHead = await waitCard()
const popInfo = await page.locator(cardSel).evaluate((el) => ({
  popover: el.classList.contains('pop'),
  mask: Boolean(document.querySelector('.mask')),
  animation: getComputedStyle(el).animationName,
}))
check('card is an anchored popover, not a centered modal',
  popInfo.popover && !popInfo.mask, JSON.stringify(popInfo))
check('popover slides out instead of popping in',
  popInfo.animation.startsWith('profile-slide'), popInfo.animation)
const headBox = await headAvatar.boundingBox()
const headCard = await page.locator(cardSel).boundingBox()
const besideHead = Math.abs(headCard.x - (headBox.x + headBox.width) - 10) <= 2 ||
  Math.abs(headCard.x + headCard.width - headBox.x) <= 12
check('popover sits next to the clicked avatar', besideHead,
  JSON.stringify({ headBox, headCard }))
check('header avatar opens profile', fromHead.includes(DIRECT), fromHead.replace(/\n/g, ' | '))
check('header card shows region + signature + add-time',
  /地区/.test(fromHead) && /个性签名/.test(fromHead) && /添加时间/.test(fromHead))
await closeCard()

// ---------- 2. 单聊：消息头像 ----------
const incoming = page.locator('.msg:not(.out) .msg-avatar-slot .avatar-btn').last()
await incoming.click()
const fromMsg = await waitCard()
check('message avatar opens the sender card', fromMsg.includes(DIRECT), fromMsg.replace(/\n/g, ' | '))
const msgBox = await incoming.boundingBox()
const msgCard = await page.locator(cardSel).boundingBox()
const besideMsg = Math.abs(msgCard.x - (msgBox.x + msgBox.width) - 10) <= 2 ||
  Math.abs(msgCard.x + msgCard.width - msgBox.x) <= 12
check('message popover sits beside its avatar', besideMsg,
  JSON.stringify({ msgBox, msgCard }))
await page.mouse.click(1000, 720)
await page.waitForSelector(cardSel, { state: 'detached', timeout: 5000 })
check('clicking elsewhere closes the popover', true)

await incoming.click()
await waitCard()
await page.keyboard.press('Escape')
await page.waitForSelector(cardSel, { state: 'detached', timeout: 5000 })
check('Escape closes the popover', true)

const outgoing = page.locator('.msg.out .msg-avatar-slot .avatar-btn').first()
await outgoing.click()
const fromSelf = await waitCard()
check('own message avatar opens self card', /我自己/.test(fromSelf), fromSelf.replace(/\n/g, ' | '))
check('self card links to settings', /编辑我的资料/.test(fromSelf))
await closeCard()

// ---------- 3. 昵称不参与点击：只有头像可点开 ----------

// ---------- 4. 资料卡 → 发消息 ----------
await page.click('.chat-head .head-avatar')
await waitCard()
await page.click(`${cardSel} button:has-text("发消息")`)
await page.waitForSelector(cardSel, { state: 'detached', timeout: 10000 })
check('chat action closes the card and keeps conversation',
  (await page.locator('.chat-title').innerText()).includes(DIRECT_ROW))
// 「发消息」还会异步补一次会话跳转，等它落定再切群，否则会被拉回单聊。
await page.waitForTimeout(1500)

// ---------- 5. 群聊：成员 / 陌生人 / 自己 ----------
await openConversation(GROUP)
await page.waitForSelector('.msg .msg-author', { timeout: 15000 })
// 头像按钮比作者名晚一帧渲染，等它出现再点，避免点到占位节点。
await page.waitForSelector('.msg .msg-avatar-slot .avatar-btn', { timeout: 15000 })
// 上一个会话是单聊，切过来时右侧详情应该已经自动收起。
check('switching conversation collapses the detail panel',
  (await page.locator('.frame.detail-open').count()) === 0,
  '切到新会话后详情面板仍然展开')

/**
 * 点某个人的消息头像打开资料卡。
 * 切换会话后消息列表是分批渲染的，偶尔第一次点击会落在还没稳定下来的节点上，
 * 所以点完先看卡片是否出现，没有就再点一次（最多 3 次），避免用例假失败。
 */
async function openByAuthor(name) {
  const msg = page.locator('.msg', { has: page.locator('.msg-author', { hasText: name }) }).first()
  for (let attempt = 0; attempt < 3; attempt++) {
    await msg.locator('.msg-avatar-slot .avatar-btn').click()
    if (await page.locator(cardSel).isVisible().catch(() => false)) {
      return waitCard()
    }
    await page.waitForTimeout(400)
  }
  return waitCard()
}

const friendText = await openByAuthor(FRIEND)
check('group friend avatar opens friend card',
  /好友/.test(friendText) && /添加时间/.test(friendText), friendText.replace(/\n/g, ' | '))
await closeCard()

const strangerText = await openByAuthor('戴维')
check('group stranger avatar opens stranger card',
  /添加好友/.test(strangerText) && !/添加时间/.test(strangerText), strangerText.replace(/\n/g, ' | '))
await closeCard()

const daveMsg = page.locator('.msg', { has: page.locator('.msg-author', { hasText: '戴维' }) }).first()
await daveMsg.locator('.msg-author').click()
await page.waitForTimeout(1200)
check('sender nickname is not clickable', (await page.locator(cardSel).count()) === 0,
  '点击昵称不应该弹出资料卡')

const ownMsg = page.locator('.msg.out', { has: page.locator('.msg-avatar-slot .avatar-btn') }).first()
await ownMsg.locator('.msg-avatar-slot .avatar-btn').click()
const selfInGroup = await waitCard()
check('own avatar in group opens self card', /我自己/.test(selfInGroup), selfInGroup.replace(/\n/g, ' | '))
await closeCard()

// ---------- 6. 右侧会话详情的成员头像 ----------
// 侧边栏在切换会话时收起了，这里手动展开再查成员头像。
if (!(await page.locator('.frame.detail-open').count())) {
  await page.click('button[aria-label="会话详情"]')
}
await page.waitForSelector('.detail-pane .member', { timeout: 10000 })
const member = page.locator('.detail-pane .member', { hasText: FRIEND }).first()
check('detail panel member exists', (await member.count()) === 1)
await member.locator('.member-avatar').click()
const memberText = await waitCard()
check('detail panel member opens profile',
  /鲍勃/.test(memberText) && /添加时间/.test(memberText), memberText.replace(/\n/g, ' | '))
await closeCard()

// ---------- 7. 会话文件 / 全局搜索 / 收藏 ----------
const pageToken = await page.evaluate(() => localStorage.getItem('veryal.token'))
const fileName = `e2e-${Date.now()}.txt`
const form = new FormData()
form.append('file', new Blob(['veryal note'], { type: 'text/plain' }), fileName)
form.append('conversationId', directCard.conversationId)
const uploadRaw = await fetch(`${BASE}/api/v1/files`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${pageToken}` },
  body: form,
}).then((r) => r.text())
// fileId 是雪花 ID，超过 2^53，JSON.parse 会丢精度，按文本抠原始数字。
const uploadedFileId = uploadRaw.match(/"fileId":(\d+)/)?.[1]
check('file upload for conversation file test', Boolean(uploadedFileId), uploadRaw)

if (uploadedFileId) {
  await fetch(`${BASE}/api/v1/conversations/${directCard.conversationId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pageToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: directCard.conversationId,
      clientMessageId: `file-${Date.now()}`,
      type: 'FILE',
      // content 里必须是原始数字，否则后端按字符串取不到 fileId。
      content: `{"fileId":${uploadedFileId},"fileName":"${fileName}"}`,
    }),
  })
}

// 刚发的消息没经过 WebSocket（脚本直接打 API），刷新一次页面拿最新会话与消息。
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.conv', { timeout: 20000 })

await openConversation(DIRECT_ROW)
if (!(await page.locator('.frame.detail-open').count())) {
  await page.click('button[aria-label="会话详情"]')
}
await page.click('.detail-tab:has-text("文件")')
await page.waitForSelector('.file-filters', { timeout: 10000 })
const fileRow = page.locator('.file-row', { hasText: fileName }).first()
await fileRow.waitFor({ timeout: 15000 })
check('detail panel lists conversation files', (await fileRow.count()) === 1)

await page.click('.detail-tab:has-text("详情")')
await page.click('button[aria-label="搜索聊天记录"]')
await page.waitForSelector('.search-pane input', { timeout: 10000 })
await page.fill('.search-pane input', fileName)
await page.waitForSelector('.hit-group', { timeout: 15000 })
const searchText = await page.locator('.search-pane').innerText()
check('global search finds the file', searchText.includes(fileName))
check('search offers sender and conversation context', searchText.includes('文件'))
await page.click('button[aria-label="关闭搜索"]')
await page.waitForSelector('.search-pane', { state: 'detached', timeout: 10000 })

// 右键文件消息 → 收藏。
const fileMsg = page.locator('.msg', { hasText: fileName }).first()
await fileMsg.waitFor({ timeout: 15000 })
await fileMsg.click({ button: 'right' })
await page.waitForSelector('.msg-menu-item:has-text("收藏")', { timeout: 10000 })
await page.click('.msg-menu-item:has-text("收藏")')
await page.waitForSelector('.app-toast:has-text("已收藏")', { timeout: 10000 })
check('message menu favorites the message', true)

await page.click('button[aria-label="收藏"]')
await page.waitForURL('**/app/favorites', { timeout: 10000 })
await page.waitForSelector('.fav-row', { timeout: 15000 })
const favText = await page.locator('.favorites').innerText()
check('favorite appears in the favorites page', favText.includes(fileName), favText.replace(/\n/g, ' | '))

await page.locator('.fav-main', { hasText: fileName }).first().click()
await page.waitForFunction(
  (target) => document.querySelector('.chat-title')?.textContent?.includes(target),
  DIRECT_ROW,
  { timeout: 15000 },
)
check('favorite links back to the original conversation', true)

await page.screenshot({ path: 'tools/verify-chat-profile.png' })

await browser.close()

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} chat-profile checks passed`)
if (failed.length) {
  console.log('FAILED:', failed.map((item) => item.name).join(', '))
  process.exit(1)
}
