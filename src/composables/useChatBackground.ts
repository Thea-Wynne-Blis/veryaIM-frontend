import { computed, ref, watch, type Ref } from 'vue'
import { fileObjectUrl } from '../api/files'
import { useChatBackgroundStore } from '../stores/chatBackground'
import { chatBackgroundLayer } from '../utils/chatBackground'

/**
 * 给聊天消息区套上背景。
 *
 * <p>图片必须带令牌读取，所以先换成 object URL（有 LRU 缓存）；
 * 最终合成两层 background-image：主题遮罩 + 背景图，保证文字始终可读。</p>
 */
export function useChatBackground(conversationId: Ref<string | null | undefined>) {
  const store = useChatBackgroundStore()
  const imageUrl = ref<string | null>(null)
  /** 防止切换会话时旧图晚到，覆盖新会话的背景。 */
  let version = 0

  const choice = computed(() => store.choiceFor(conversationId.value ?? null))
  const hasBackground = computed(() => Boolean(choice.value.fileId || choice.value.preset))

  const style = computed((): Record<string, string> => {
    const layer = chatBackgroundLayer(choice.value, imageUrl.value)
    if (!layer) return {}
    return { backgroundImage: `var(--chat-bg-veil), ${layer}` }
  })

  watch(
    () => choice.value.fileId,
    async (fileId) => {
      const mine = ++version
      if (!fileId) {
        imageUrl.value = null
        return
      }
      try {
        const url = await fileObjectUrl(fileId)
        if (mine === version) imageUrl.value = url
      } catch {
        if (mine === version) imageUrl.value = null
      }
    },
    { immediate: true },
  )

  // 多个聊天组件同时挂载时，store 内部会去重，只真正请求一次。
  void store.load().catch(() => {})

  return { choice, hasBackground, style }
}
