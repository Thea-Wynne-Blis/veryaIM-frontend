import { computed, ref, watch } from 'vue'

/**
 * 翻译目标语言偏好。
 *
 * <p>仅影响「译文」按钮的默认目标语言；聊天内容本身不动。
 * 存在 localStorage，换设备需要重新选择。</p>
 */

export type TranslateLanguage = {
  /** 百度翻译语言代码 */
  code: string
  label: string
}

/** 常用目标语言；顺序即设置页展示顺序。 */
export const TRANSLATE_LANGUAGES: TranslateLanguage[] = [
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: '英语' },
  { code: 'cht', label: '繁体中文' },
  { code: 'yue', label: '粤语' },
  { code: 'jp', label: '日语' },
  { code: 'kor', label: '韩语' },
  { code: 'fra', label: '法语' },
  { code: 'spa', label: '西班牙语' },
  { code: 'de', label: '德语' },
  { code: 'ru', label: '俄语' },
  { code: 'pt', label: '葡萄牙语' },
  { code: 'it', label: '意大利语' },
  { code: 'ara', label: '阿拉伯语' },
  { code: 'th', label: '泰语' },
  { code: 'vie', label: '越南语' },
  { code: 'nl', label: '荷兰语' },
  { code: 'pl', label: '波兰语' },
  { code: 'el', label: '希腊语' },
  { code: 'swe', label: '瑞典语' },
  { code: 'fin', label: '芬兰语' },
  { code: 'dan', label: '丹麦语' },
  { code: 'cs', label: '捷克语' },
  { code: 'hu', label: '匈牙利语' },
  { code: 'rom', label: '罗马尼亚语' },
  { code: 'bul', label: '保加利亚语' },
  { code: 'est', label: '爱沙尼亚语' },
  { code: 'slo', label: '斯洛文尼亚语' },
  { code: 'wyw', label: '文言文' },
]

const STORAGE_KEY = 'veryal.translateTo'
const DEFAULT_LANGUAGE = 'en'

/** 模块级单例，多个组件共享同一份偏好。 */
const target = ref(loadTarget())

function loadTarget(): string {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored && TRANSLATE_LANGUAGES.some((item) => item.code === stored)
    ? stored
    : DEFAULT_LANGUAGE
}

watch(target, (value) => {
  localStorage.setItem(STORAGE_KEY, value)
})

export function useTranslatePrefs() {
  const label = computed(
    () => TRANSLATE_LANGUAGES.find((item) => item.code === target.value)?.label ?? '英语',
  )
  return {
    target,
    label,
    languages: TRANSLATE_LANGUAGES,
    setTarget(code: string) {
      if (TRANSLATE_LANGUAGES.some((item) => item.code === code)) target.value = code
    },
  }
}

/** 给不在 setup 上下文里的代码读取当前目标语言。 */
export function currentTranslateTarget(): string {
  return target.value
}
