/**
 * 统一从异常里取给用户看的文案。
 *
 * <p>后端异常消息已是可读文案（英文/中文），直接展示；取不到再用调用方兜底，
 * 避免每个调用点各写一次 `e instanceof Error ? e.message : '…'`。</p>
 */
export function messageOf(error: unknown, fallback = '操作失败'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}
