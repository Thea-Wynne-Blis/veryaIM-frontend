/**
 * 限制并发数的任务队列。
 *
 * <p>多选图片时会一次产生多个上传任务，全部同时发出只会互相抢带宽，
 * 每个都变慢；这里最多同时跑 {@code limit} 个，其余排队等前一个结束。</p>
 */
export function createTaskQueue(limit: number) {
  const pending: Array<() => void> = []
  let active = 0

  function pump(): void {
    if (active >= limit) return
    const start = pending.shift()
    if (!start) return
    active++
    start()
  }

  return function enqueue(task: () => Promise<void>): void {
    pending.push(() => {
      void task().finally(() => {
        active--
        pump()
      })
    })
    pump()
  }
}
