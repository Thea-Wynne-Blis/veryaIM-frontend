/**
 * ReactBits 风格「聚光卡片」：把指针位置写入 CSS 变量，
 * 由 .spot::before 的 radial-gradient 跟随渲染。
 */
export function trackSpotlight(event: PointerEvent | MouseEvent): void {
  const el = event.currentTarget as HTMLElement | null
  if (!el) return
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
  el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
}

/**
 * ReactBits 风格「磁吸」：元素向指针方向轻微位移，离开后弹回。
 *
 * @param strength 位移强度，0.1 ~ 0.3 比较克制
 */
export function trackMagnet(
  event: PointerEvent | MouseEvent,
  strength = 0.18,
): void {
  const el = event.currentTarget as HTMLElement | null
  if (!el) return
  const rect = el.getBoundingClientRect()
  const dx = (event.clientX - (rect.left + rect.width / 2)) * strength
  const dy = (event.clientY - (rect.top + rect.height / 2)) * strength
  el.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`
}

export function resetMagnet(event: PointerEvent | MouseEvent): void {
  const el = event.currentTarget as HTMLElement | null
  if (el) el.style.transform = ''
}
