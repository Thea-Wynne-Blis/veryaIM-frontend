import { nextTick, ref } from 'vue'
import { translateText } from '../api/client'
import type { ChatMessage } from '../types/chat'
import { messageOf } from '../utils/error'
import { canRecallAt, copyTextOf, midOf, quotePreviewOf } from '../utils/message'
import { useTranslatePrefs } from './useTranslatePrefs'

export type ReplyDraft = { messageId: string; senderId: string; author: string; preview: string }

export type MessageActionsOptions = {
  /** 当前会话 ID；返回空表示没有打开的会话，动作直接忽略 */
  conversationId: () => string | undefined
  /** 消息列表滚动容器，用于「定位原消息」 */
  scroller: () => HTMLElement | null
  /** 自己的用户 ID，引用自己的消息时用 */
  myId: () => string
  /** 关闭右键 / 长按菜单 */
  closeMenu: () => void
  /** 顶部小提示 */
  showNotice: (text: string) => void
  /** 撤回接口（store 里的 recallMessage） */
  recall: (conversationId: string, messageId: string) => Promise<unknown>
  /** 仅本地隐藏（store 里的 hideMessage） */
  hideMessage: (conversationId: string, messageId: string) => void
  /** 转发入口（桌面弹转发框、移动端走自己的流程） */
  forward?: (message: ChatMessage) => void
  /** 引用后把焦点放回输入框；移动端可不传 */
  focusComposer?: () => void
}

/**
 * 消息级操作：复制、引用、撤回、删除、定位、翻译、转发。
 *
 * <p>桌面 ChatPane 与移动端 MobileWorkspace 原先各写了一份几乎相同的实现，
 * 文案与行为已经出现细微差别（例如发送中删除的提示、引用后是否聚焦输入框）。
 * 这里收敛成一份，组件只负责菜单交互与布局。</p>
 */
export function useMessageActions(options: MessageActionsOptions) {
  const { target: translateTarget } = useTranslatePrefs()

  const replyTo = ref<ReplyDraft | null>(null)
  /** 译文按消息 id 存；切换会话不清空，回来还能看到。 */
  const translations = ref<Record<string, { text: string; to: string }>>({})
  const translatingId = ref<string | null>(null)

  /* ---------- 复制 ---------- */
  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 非安全上下文 / 无剪贴板权限时退回 execCommand。
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.style.position = 'fixed'
        area.style.top = '-1000px'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        area.remove()
        return ok
      } catch {
        return false
      }
    }
  }

  async function copyMessage(message: ChatMessage) {
    options.closeMenu()
    const text = copyTextOf(message)
    if (!text) {
      options.showNotice('这条消息没有可复制的内容')
      return
    }
    options.showNotice((await copyText(text)) ? '已复制' : '复制失败，请手动选择文本')
  }

  /* ---------- 撤回 / 删除 ---------- */
  function canRecall(message: ChatMessage): boolean {
    return canRecallAt(message)
  }

  async function deleteMessage(message: ChatMessage) {
    options.closeMenu()
    const conversationId = options.conversationId()
    if (!conversationId) return
    if (message.pending) {
      options.showNotice('消息正在发送中，稍后再删除')
      return
    }
    const messageId = midOf(message)
    if (canRecall(message)) {
      try {
        await options.recall(conversationId, messageId)
        options.showNotice('已撤回')
      } catch (e) {
        options.showNotice(messageOf(e, '撤回失败'))
      }
      return
    }
    options.hideMessage(conversationId, messageId)
    options.showNotice('已从本地删除')
  }

  /* ---------- 引用 ---------- */
  function canQuote(message: ChatMessage): boolean {
    return !message.recalled && !message.pending
  }

  function quoteMessage(message: ChatMessage) {
    options.closeMenu()
    if (!canQuote(message)) {
      options.showNotice('这条消息不能引用')
      return
    }
    replyTo.value = {
      messageId: midOf(message),
      senderId: String(message.mine ? options.myId() : (message.senderId ?? '')),
      author: message.author,
      preview: quotePreviewOf(message),
    }
    if (options.focusComposer) nextTick(options.focusComposer)
  }

  function cancelQuote() {
    replyTo.value = null
  }

  /** 点击引用块定位原消息；不在已加载范围时给出提示。 */
  function locateMessage(messageId: string) {
    const el = options.scroller()?.querySelector<HTMLElement>(`[data-mid="${messageId}"]`)
    if (!el) {
      options.showNotice('原消息不在当前已加载的记录里')
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('flash')
    window.setTimeout(() => el.classList.remove('flash'), 1200)
  }

  /* ---------- 翻译 ---------- */
  function translationOf(message: ChatMessage) {
    return translations.value[midOf(message)]
  }

  async function translateMessage(message: ChatMessage) {
    options.closeMenu()
    const id = midOf(message)
    if (translations.value[id]) {
      const next = { ...translations.value }
      delete next[id]
      translations.value = next
      return
    }
    if (message.recalled) {
      options.showNotice('已撤回的消息不能翻译')
      return
    }
    if (message.attachment) {
      options.showNotice('暂不支持翻译附件消息')
      return
    }
    const text = message.text.trim()
    if (!text) return
    translatingId.value = id
    try {
      const result = await translateText(text, translateTarget.value)
      translations.value = { ...translations.value, [id]: { text: result.text, to: result.to } }
    } catch (e) {
      options.showNotice(messageOf(e, '翻译失败'))
    } finally {
      translatingId.value = null
    }
  }

  /* ---------- 转发 ---------- */
  function forwardMessage(message: ChatMessage) {
    options.closeMenu()
    options.forward?.(message)
  }

  return {
    replyTo,
    translations,
    translatingId,
    midOf,
    copyText,
    copyTextOf,
    copyMessage,
    canRecall,
    deleteMessage,
    quotePreviewOf,
    canQuote,
    quoteMessage,
    cancelQuote,
    locateMessage,
    translationOf,
    translateMessage,
    forwardMessage,
  }
}
