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

/**
 * 脚本会把群里的「陌生人」加成好友，重复跑时按钮会变成「申请已发送」。
 * 每次先把 demo_alice 待处理的 outgoing 申请撤掉，保证断言只看得到「加好友」。
 */
async function resetOutgoingFriendRequests() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'demo_alice',
      password: 'password123',
      deviceId: `cleanup-${Date.now()}`,
      platform: 'LINUX',
      deviceName: 'cleanup',
    }),
  })
  const { data } = await res.json()
  const token = data?.token
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

await resetOutgoingFriendRequests()

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

// ---------- 1. 单聊：顶部头像 ----------
await openConversation(DIRECT)
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
  (await page.locator('.chat-title').innerText()).includes(DIRECT))
// 「发消息」还会异步补一次会话跳转，等它落定再切群，否则会被拉回单聊。
await page.waitForTimeout(1500)

// ---------- 5. 群聊：成员 / 陌生人 / 自己 ----------
await openConversation(GROUP)
await page.waitForSelector('.msg .msg-author', { timeout: 15000 })

async function openByAuthor(name) {
  const msg = page.locator('.msg', { has: page.locator('.msg-author', { hasText: name }) }).first()
  await msg.locator('.msg-avatar-slot .avatar-btn').click()
  return waitCard()
}

const friendText = await openByAuthor('鲍勃')
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
const member = page.locator('.detail-pane .member', { hasText: '鲍勃' }).first()
check('detail panel member exists', (await member.count()) === 1)
await member.locator('.member-avatar').click()
const memberText = await waitCard()
check('detail panel member opens profile',
  /鲍勃/.test(memberText) && /添加时间/.test(memberText), memberText.replace(/\n/g, ' | '))
await closeCard()

await page.screenshot({ path: 'tools/verify-chat-profile.png' })
await browser.close()

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} chat-profile checks passed`)
if (failed.length) {
  console.log('FAILED:', failed.map((item) => item.name).join(', '))
  process.exit(1)
}
