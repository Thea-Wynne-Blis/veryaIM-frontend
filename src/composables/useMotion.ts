import { ref } from 'vue'

/**
 * 切换会话时的进入动效预设。
 *
 * 只影响「换会话」这一次渲染：发消息（乐观占位）永远直接出现，
 * 不做淡入，避免按下回车后还要等动画。
 *
 * 预设通过 <html data-motion> 驱动 CSS，各预设的时长/位移写在 app.css；
 * 消息节点用 `enter` 类触发一次入场动画，标题/头像靠 `:key` 重挂载重放。
 */
export type MotionPreset = 'rise' | 'fade' | 'slide' | 'stagger' | 'none'

export type MotionOption = {
  value: MotionPreset
  label: string
  hint: string
}

export const MOTION_PRESETS: MotionOption[] = [
  { value: 'rise', label: '柔和上浮', hint: '淡入 + 上移 8px，最接近 BoardUI 的克制感' },
  { value: 'fade', label: '纯淡入', hint: '只有透明度过渡，几乎察觉不到位移' },
  { value: 'slide', label: '横向滑入', hint: '从右侧轻推 18px，像翻了一页' },
  { value: 'stagger', label: '逐条流动', hint: '每条约错开 10ms，最多 100ms，有节奏感' },
  { value: 'none', label: '关闭', hint: '切换会话直接呈现，零动效' },
]

const MOTION_KEY = 'veryal.motion'
const FALLBACK: MotionPreset = 'rise'

function readPreset(): MotionPreset {
  try {
    const saved = localStorage.getItem(MOTION_KEY)
    if (saved && MOTION_PRESETS.some((item) => item.value === saved)) {
      return saved as MotionPreset
    }
  } catch {
    /* 隐私模式下 localStorage 可能不可用 */
  }
  return FALLBACK
}

const preset = ref<MotionPreset>(readPreset())

function apply(value: MotionPreset) {
  document.documentElement.dataset.motion = value
}

/** 应用启动时调用一次，避免用户选了「关闭」却先闪一下默认动画。 */
export function initMotion() {
  apply(preset.value)
}

export function useMotion() {
  function setPreset(value: MotionPreset) {
    preset.value = value
    apply(value)
    try {
      localStorage.setItem(MOTION_KEY, value)
    } catch {
      /* 忽略写入失败 */
    }
  }
  return { preset, setPreset }
}
