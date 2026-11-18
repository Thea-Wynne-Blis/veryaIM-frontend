/**
 * 统一实测入口。
 *
 *   npm run e2e                        # 默认打线上环境
 *   npm run e2e -- --target=local      # 打本机 vite dev（http://127.0.0.1:5173）
 *   npm run e2e -- --base=http://x:8899
 *   npm run e2e -- --only=chat,group   # 只跑名字里带 chat / group 的脚本
 *
 * 每个脚本都读 VERYAL_BASE，失败即停，最后汇总。
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 顺序有依赖：资料页会把陌生人加成好友，放最后不影响聊天里的「陌生人」断言。 */
const SUITES = [
  { name: 'chat', script: 'verify-chat-profile.mjs' },
  { name: 'presence', script: 'verify-presence.mjs' },
  { name: 'group', script: 'verify-group-manage.mjs' },
  { name: 'group-friend', script: 'verify-group-friend.mjs' },
  { name: 'profile', script: 'verify-profile.mjs' },
]

function arg(name, fallback = '') {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const target = arg('target', 'prod')
const base = arg(
  'base',
  target === 'local' ? 'http://127.0.0.1:5173' : 'http://82.157.47.151:8899',
)
const only = arg('only')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const suites = only.length ? SUITES.filter((suite) => only.includes(suite.name)) : SUITES
if (!suites.length) {
  console.error(`没有匹配的实测目标：${only.join(', ')}`)
  console.error(`可选：${SUITES.map((suite) => suite.name).join(', ')}`)
  process.exit(1)
}

console.log(`实测环境：${base}`)
console.log(`用例：${suites.map((suite) => suite.name).join(' / ')}`)

const failures = []
for (const suite of suites) {
  console.log(`\n=== ${suite.name} (${suite.script}) ===`)
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(HERE, suite.script)], {
      stdio: 'inherit',
      env: { ...process.env, VERYAL_BASE: base },
    })
    child.on('exit', (exitCode) => resolve(exitCode ?? 1))
  })
  if (code !== 0) failures.push(suite.name)
}

console.log('\n=== 汇总 ===')
if (failures.length) {
  console.error(`失败：${failures.join(', ')}`)
  process.exit(1)
}
console.log(`全部通过：${suites.length} 个用例`)
