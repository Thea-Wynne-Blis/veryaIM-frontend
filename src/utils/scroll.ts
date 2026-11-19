/** 仅滚动消息列表，避免 scrollIntoView 把 stage、frame 或页面也卷走。 */
export function centerMessage(container: HTMLElement, target: HTMLElement): void {
  const bounds = container.getBoundingClientRect()
  const message = target.getBoundingClientRect()
  const offset = message.top - bounds.top - container.clientTop + container.scrollTop
  const gap = message.height < container.clientHeight ? (container.clientHeight - message.height) / 2 : 16
  const top = Math.max(0, Math.min(offset - gap, container.scrollHeight - container.clientHeight))
  container.scrollTo({ top, behavior: 'instant' })
}
