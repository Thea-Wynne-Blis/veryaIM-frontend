/**
 * 后端错误码：群禁言（含全员禁言）。
 * 与 `ErrorCode.GROUP_MUTED` 保持一致。
 */
const GROUP_MUTED = 40306

function codeOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null
  const code = Number((error as { code: unknown }).code)
  return Number.isFinite(code) ? code : null
}

/**
 * 统一从异常里取给用户看的文案。
 *
 * <p>后端异常消息已是可读文案（英文/中文），直接展示；取不到再用调用方兜底，
 * 避免每个调用点各写一次 `e instanceof Error ? e.message : '…'`。</p>
 */
export function messageOf(error: unknown, fallback = '操作失败'): string {
  // 被禁言是高频、用户必须立刻理解的状态：统一成一句明确的中文提示，
  // 不直接把后端的 "group is muted" / "you are muted until ..." 抛给用户。
  if (codeOf(error) === GROUP_MUTED) return '你已被禁言，请联系管理员'
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}
