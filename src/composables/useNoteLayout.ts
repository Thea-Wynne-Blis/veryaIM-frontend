/**
 * 笔记三栏布局的尺寸状态。
 *
 * <p>笔记页有两条分隔线：列表 / 编辑器、编辑器 / 实时预览。列表按像素保存，
 * 预览按编辑器宽度的比例保存，窗口变化时自动收放。这里只算尺寸，
 * 拖拽交互交给 {@link PaneSplitter}，组件里不再重复写指针事件。</p>
 */
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

const LIST_WIDTH_KEY = 'veryal.notesListWidth'
const SPLIT_KEY = 'veryal.notesSplit'

const DEFAULT_LIST_WIDTH = 290
const MIN_LIST_WIDTH = 190
const MAX_LIST_WIDTH = 460
/** 编辑器至少留这么宽，窗口变窄时列表自动收回来。 */
const MIN_EDITOR_WIDTH = 320
const MIN_SPLIT = 0.25
const MAX_SPLIT = 0.75
const KEYBOARD_LIST_STEP = 16
const KEYBOARD_SPLIT_STEP = 0.02

export type NotePane = 'list' | 'split'

function storedNumber(key: string, min: number, max: number): number | null {
  try {
    const saved = Number(window.localStorage.getItem(key))
    return Number.isFinite(saved) && saved >= min && saved <= max ? saved : null
  } catch {
    return null
  }
}

export type NoteLayout = {
  bodyEl: Ref<HTMLElement | null>
  areaEl: Ref<HTMLElement | null>
  listWidth: Ref<number | null>
  split: Ref<number>
  bodyStyle: Ref<Record<string, string>>
  areaStyle: Ref<Record<string, string>>
  beginDrag: (pane: NotePane) => void
  dragBy: (pane: NotePane, deltaX: number) => void
  endDrag: () => void
  nudge: (pane: NotePane, direction: number) => void
  reset: (pane: NotePane) => void
}

export function useNoteLayout(isMobile: () => boolean): NoteLayout {
  const bodyEl = ref<HTMLElement | null>(null)
  const areaEl = ref<HTMLElement | null>(null)
  const listWidth = ref<number | null>(
    storedNumber(LIST_WIDTH_KEY, MIN_LIST_WIDTH, MAX_LIST_WIDTH),
  )
  const split = ref<number>(storedNumber(SPLIT_KEY, MIN_SPLIT, MAX_SPLIT) ?? 0.5)

  let baseList = DEFAULT_LIST_WIDTH
  let baseSplit = split.value
  let baseAreaWidth = 1

  const bodyStyle = computed((): Record<string, string> => {
    if (isMobile() || !listWidth.value) return {}
    return { '--notes-list-width': `${listWidth.value}px` }
  })
  const areaStyle = computed((): Record<string, string> => {
    if (isMobile()) return {}
    return { '--notes-split': `${(split.value * 100).toFixed(2)}%` }
  })

  function listElement(): HTMLElement | null {
    return bodyEl.value?.querySelector('.notes-list') ?? null
  }

  /** 列表能拉到多宽：至少给编辑器留 320px。 */
  function clampListWidth(width: number): number {
    let max = MAX_LIST_WIDTH
    const body = bodyEl.value
    if (body) {
      max = Math.min(
        MAX_LIST_WIDTH,
        Math.max(MIN_LIST_WIDTH, body.clientWidth - MIN_EDITOR_WIDTH),
      )
    }
    return Math.round(Math.min(Math.max(width, MIN_LIST_WIDTH), max))
  }

  function clampSplit(ratio: number): number {
    return Math.min(Math.max(ratio, MIN_SPLIT), MAX_SPLIT)
  }

  function persist() {
    try {
      if (listWidth.value) {
        window.localStorage.setItem(LIST_WIDTH_KEY, String(listWidth.value))
      } else {
        window.localStorage.removeItem(LIST_WIDTH_KEY)
      }
      window.localStorage.setItem(SPLIT_KEY, String(split.value))
    } catch {
      // 隐私模式下 localStorage 不可写，忽略即可
    }
  }

  function beginDrag(pane: NotePane) {
    baseList = listWidth.value ?? listElement()?.getBoundingClientRect().width
      ?? DEFAULT_LIST_WIDTH
    baseSplit = split.value
    baseAreaWidth = Math.max(1, areaEl.value?.getBoundingClientRect().width ?? 1)
    void pane
  }

  function dragBy(pane: NotePane, deltaX: number) {
    if (pane === 'list') listWidth.value = clampListWidth(baseList + deltaX)
    else split.value = clampSplit(baseSplit + deltaX / baseAreaWidth)
  }

  function endDrag() {
    persist()
  }

  function nudge(pane: NotePane, direction: number) {
    if (pane === 'list') {
      const current = listWidth.value
        ?? listElement()?.getBoundingClientRect().width
        ?? DEFAULT_LIST_WIDTH
      listWidth.value = clampListWidth(current + direction * KEYBOARD_LIST_STEP)
    } else {
      split.value = clampSplit(split.value + direction * KEYBOARD_SPLIT_STEP)
    }
    persist()
  }

  function reset(pane: NotePane) {
    if (pane === 'list') listWidth.value = null
    else split.value = 0.5
    persist()
  }

  /** 窗口变窄时把持久化的列表宽度收回来。 */
  function onWindowResize() {
    if (listWidth.value) listWidth.value = clampListWidth(listWidth.value)
  }

  onMounted(() => {
    window.addEventListener('resize', onWindowResize)
    window.requestAnimationFrame(onWindowResize)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', onWindowResize)
  })

  return {
    bodyEl,
    areaEl,
    listWidth,
    split,
    bodyStyle,
    areaStyle,
    beginDrag,
    dragBy,
    endDrag,
    nudge,
    reset,
  }
}
