import { createApp, defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from '../useToast'

/** 在真实组件实例里跑，才能触发 onBeforeUnmount。 */
function mountWithToast() {
  const el = document.createElement('div')
  let api!: ReturnType<typeof useToast>
  const app = createApp(
    defineComponent({
      setup() {
        api = useToast(1000)
        return () => h('span')
      },
    }),
  )
  app.mount(el)
  return { api, unmount: () => app.unmount() }
}

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('展示文案并在时长后自动消失', () => {
    const { api } = mountWithToast()
    api.show('已复制')
    expect(api.message.value).toBe('已复制')
    vi.advanceTimersByTime(999)
    expect(api.message.value).toBe('已复制')
    vi.advanceTimersByTime(1)
    expect(api.message.value).toBe('')
  })

  it('连续提示以最后一次为准，不会提前消失', () => {
    const { api } = mountWithToast()
    api.show('第一条')
    vi.advanceTimersByTime(800)
    api.show('第二条')
    vi.advanceTimersByTime(800)
    expect(api.message.value).toBe('第二条')
    vi.advanceTimersByTime(200)
    expect(api.message.value).toBe('')
  })

  it('手动清空后定时器不再覆盖新提示', () => {
    const { api } = mountWithToast()
    api.show('旧提示')
    api.clear()
    expect(api.message.value).toBe('')
    api.show('新提示')
    vi.advanceTimersByTime(500)
    expect(api.message.value).toBe('新提示')
  })

  it('组件卸载后定时器被清理', () => {
    const { api, unmount } = mountWithToast()
    api.show('提示')
    unmount()
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })
})
