/**
 * 在线人数实测（生产环境）：
 *  1. 群详情里的「在线」不再是 0，且与成员接口返回一致；
 *  2. 自己的连接在 Redis 里的 lastHeartbeat 会被服务端续期任务持续推进，
 *     不会再出现「5 分钟 TTL 到期后人还连着却显示离线」。
 */
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'

const BASE = 'http://82.157.47.151:8899'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const GROUP = '产品设计小组'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`)
}

function remote(script) {
  return execFileSync('ssh', ['-o', 'StrictHostKeyChecking=no', 'ubuntu@82.157.47.151', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
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
await page.locator('.conv', { hasText: GROUP }).first().click()
await page.waitForTimeout(2500)

const stats = page.locator('.stat-cell')
const online = Number((await stats.nth(1).innerText()).split('\n')[0].trim())
check('detail panel shows at least 1 online', online >= 1, `online=${online}`)

async function memberList() {
  return page.evaluate(async () => {
    const token = localStorage.getItem('veryal.token') ?? ''
    const cards = await (await fetch('/api/v1/conversations/cards', {
      headers: { Authorization: `Bearer ${token}` },
    })).json()
    const card = cards.data.find((item) => item.title?.includes('产品设计小组'))
    const list = await (await fetch(`/api/v1/groups/${card.conversationId}/members`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json()
    return list.data
  })
}

const members = await memberList()
const onlineMembers = members.filter((m) => m.online)
check('alice reports online via API', onlineMembers.some((m) => m.nickname === '爱丽丝'),
  JSON.stringify(members.map((m) => `${m.nickname}:${m.online}`)))
check('panel count matches API', onlineMembers.length === online,
  `panel=${online} api=${onlineMembers.length}`)

const deviceId = await page.evaluate(() => localStorage.getItem('veryal.deviceId'))

/**
 * 前端用 json-bigint 把超大 ID 当字符串解析，这里用原生 fetch 会丢精度，
 * 所以不按 userId 拼 key，而是按 deviceId 在 presence 里反查自己的连接。
 */
function findKey() {
  return remote(
    `for k in $(sudo docker exec veryal-redis redis-cli --scan --pattern "veryal:presence:*"); do` +
    ` if [ -n "$(sudo docker exec veryal-redis redis-cli hget $k ${deviceId})" ]; then echo $k; fi; done`)
}

let key = ''
let before = ''
for (let i = 0; i < 10; i++) {
  key = findKey()
  if (key) {
    before = remote(`sudo docker exec veryal-redis redis-cli hget ${key} ${deviceId}`)
    if (before) break
  }
  await page.waitForTimeout(500)
}
if (!before) {
  console.log('presence keys:', remote(
    `sudo docker exec veryal-redis redis-cli --scan --pattern "veryal:presence:*"`))
}
check('own connection recorded in redis', before.includes(deviceId), `${deviceId} -> ${before}`)
const beatBefore = JSON.parse(before).lastHeartbeat
const ttlBefore = Number(remote(`sudo docker exec veryal-redis redis-cli pttl ${key}`))
check('presence key has ttl to renew', ttlBefore > 0, `pttl=${ttlBefore}`)

console.log('waiting 70s for the renew task…')
await page.waitForTimeout(70000)

const after = remote(`sudo docker exec veryal-redis redis-cli hget ${key} ${deviceId}`)
check('renew task advances lastHeartbeat', after.length > 0 && JSON.parse(after).lastHeartbeat > beatBefore,
  `${beatBefore} -> ${after}`)
const ttlAfter = Number(remote(`sudo docker exec veryal-redis redis-cli pttl ${key}`))
check('ttl kept fresh by renewal', ttlAfter > 200000, `pttl=${ttlAfter}`)

const again = await memberList()
check('alice still online after 70s', again.some((m) => m.nickname === '爱丽丝' && m.online),
  JSON.stringify(again.map((m) => `${m.nickname}:${m.online}`)))

// 模拟旧 bug 的最坏情况：presence 记录被 TTL 清空（人还连着）。
// 续期任务必须把它重建出来，否则用户会永久显示离线直到重新登录。
remote(`sudo docker exec veryal-redis redis-cli del ${key}`)
console.log('deleted presence record, waiting 65s for self-heal…')
await page.waitForTimeout(65000)

const healed = remote(
  `for k in $(sudo docker exec veryal-redis redis-cli --scan --pattern "veryal:presence:*"); do` +
  ` if [ -n "$(sudo docker exec veryal-redis redis-cli hget $k ${deviceId})" ]; then echo $k; fi; done`)
check('presence restored after record loss', healed === key, `${key} -> ${healed}`)
const healedMembers = await memberList()
check('still online after record loss', healedMembers.some((m) => m.nickname === '爱丽丝' && m.online),
  JSON.stringify(healedMembers.map((m) => `${m.nickname}:${m.online}`)))

await page.screenshot({ path: 'tools/verify-presence.png' })
await browser.close()

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} presence checks passed`)
if (failed.length) {
  console.log('FAILED:', failed.map((item) => item.name).join(', '))
  process.exit(1)
}
