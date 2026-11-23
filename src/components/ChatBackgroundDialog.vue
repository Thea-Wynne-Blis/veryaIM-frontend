<script setup lang="ts">
/**
 * 聊天背景选择器。
 *
 * <p>同一个组件服务两种作用域：传入 `conversationId` 改单个会话，不传就是全局背景。
 * 会话级支持「跟随全局」，清除后自动回退。</p>
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ImagePlus, Loader2, RefreshCw, X } from 'lucide-vue-next'
import { useChatBackground } from '../composables/useChatBackground'
import { useChatBackgroundStore } from '../stores/chatBackground'
import { CHAT_BACKGROUND_PRESETS } from '../utils/chatBackground'
import { messageOf } from '../utils/error'

const props = defineProps<{
  /** 为空表示编辑全局背景 */
  conversationId?: string | null
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const store = useChatBackgroundStore()
const scope = computed(() => props.conversationId ?? null)
const { choice, hasBackground, style } = useChatBackground(scope)

const busy = ref(false)
const error = ref('')
const status = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
let statusTimer: number | undefined

const title = computed(() => (scope.value ? '聊天背景' : '默认聊天背景'))
const currentPreset = computed(() => (choice.value.fileId ? null : choice.value.preset))
const hasOverride = computed(() => {
  const id = scope.value
  return id ? Boolean(store.conversations[id]) : false
})

function close() {
  if (busy.value) return
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (statusTimer !== undefined) window.clearTimeout(statusTimer)
})

function flash(text: string) {
  status.value = text
  if (statusTimer !== undefined) window.clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => (status.value = ''), 2000)
}

async function run(task: () => Promise<unknown>, done: string) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await task()
    flash(done)
  } catch (e) {
    error.value = messageOf(e, '设置聊天背景失败')
  } finally {
    busy.value = false
  }
}

function pickPreset(id: string) {
  void run(() => store.setPreset(id, scope.value), '背景已更新')
}

function followGlobal() {
  void run(() => store.clear(scope.value), '已跟随全局背景')
}

function clearGlobal() {
  void run(() => store.clear(null), '已关闭聊天背景')
}

function pickFile() {
  if (!busy.value) fileInput.value?.click()
}

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    error.value = '请选择图片文件'
    return
  }
  void run(() => store.upload(file, scope.value), '背景图已上传')
}
</script>

<template>
  <Teleport to="body">
    <div class="bg-backdrop" @click.self="close">
      <section class="bg-dialog" role="dialog" aria-modal="true" :aria-label="title">
        <header class="bg-head">
          <div>
            <h2>{{ title }}</h2>
            <p>{{ scope ? '只对这个聊天生效，优先于默认背景' : '所有聊天的默认背景' }}</p>
          </div>
          <button class="icon-btn" aria-label="关闭" :disabled="busy" @click="close">
            <X :size="17" />
          </button>
        </header>

        <div class="bg-preview" :class="{ empty: !hasBackground }" :style="style">
          <div class="bg-preview-bubbles" aria-hidden="true">
            <span class="bg-bubble in">今天的背景好看吗？</span>
            <span class="bg-bubble out">给你换一张</span>
          </div>
          <span v-if="!hasBackground" class="bg-preview-empty">当前没有背景</span>
        </div>

        <div class="bg-body">
          <div class="bg-section">
            <p class="bg-label">内置背景</p>
            <div class="bg-presets">
              <button
                v-for="preset in CHAT_BACKGROUND_PRESETS"
                :key="preset.id"
                type="button"
                class="bg-preset"
                :class="{ selected: currentPreset === preset.id }"
                :aria-pressed="currentPreset === preset.id"
                :disabled="busy"
                @click="pickPreset(preset.id)"
              >
                <span class="bg-swatch" :style="{ backgroundImage: preset.css }">
                  <Check v-if="currentPreset === preset.id" :size="15" :stroke-width="2.6" />
                </span>
                <span class="bg-preset-name">{{ preset.name }}</span>
              </button>
            </div>
          </div>

          <div class="bg-actions">
            <button type="button" class="bg-action" :disabled="busy" @click="pickFile">
              <Loader2 v-if="busy" :size="15" class="spin" />
              <ImagePlus v-else :size="15" />
              上传图片
            </button>
            <button
              v-if="scope"
              type="button"
              class="bg-action"
              :class="{ selected: !hasOverride }"
              :disabled="busy || !hasOverride"
              @click="followGlobal"
            >
              <RefreshCw :size="15" />跟随全局
            </button>
            <button
              v-else
              type="button"
              class="bg-action"
              :disabled="busy || (!choice.fileId && !choice.preset)"
              @click="clearGlobal"
            >
              <RefreshCw :size="15" />关闭背景
            </button>
            <input
              ref="fileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              @change="onFilePicked"
            />
          </div>

          <p v-if="error" class="bg-error" role="alert">{{ error }}</p>
          <p v-else-if="status" class="bg-status" role="status">{{ status }}</p>
          <p v-else class="bg-hint">支持 JPG、PNG、WebP，上传前会自动压缩到 1920px。</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.bg-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(12, 18, 32, 0.42);
  backdrop-filter: blur(6px);
  animation: bg-fade 160ms var(--ease-out);
}

.bg-dialog {
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  max-height: min(86vh, 720px);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: bg-rise 200ms var(--ease-out);
}

.bg-head {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
}

.bg-head h2 {
  font-size: 16px;
  font-weight: 660;
  color: var(--ink);
}

.bg-head p {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--ink-3);
}

.bg-preview {
  position: relative;
  flex-shrink: 0;
  height: 164px;
  margin: 0 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background-color: var(--surface-3);
  background-position: center;
  background-size: cover;
  overflow: hidden;
}

.bg-preview.empty {
  border-style: dashed;
  background-image: none;
}

.bg-preview-bubbles {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(320px, 82%);
  opacity: 0;
  transition: opacity var(--dur-2) var(--ease-out);
}

.bg-preview:not(.empty) .bg-preview-bubbles {
  opacity: 1;
}

.bg-bubble {
  max-width: 78%;
  padding: 7px 11px;
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.1);
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink);
}

.bg-bubble.out {
  align-self: flex-end;
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.bg-preview-empty {
  position: absolute;
  inset: auto;
  font-size: 12px;
  color: var(--ink-3);
}

.bg-body {
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px 16px;
}

.bg-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bg-label {
  font-size: 12px;
  font-weight: 620;
  color: var(--ink-2);
}

.bg-presets {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.bg-preset {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 5px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  transition: border-color var(--dur-1), background var(--dur-1);
}

.bg-preset:hover:not(:disabled) {
  background: var(--surface-hover);
}

.bg-preset.selected {
  border-color: var(--accent-2);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.bg-swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  background-size: cover;
  color: var(--accent);
}

.bg-swatch svg {
  filter: drop-shadow(0 1px 2px rgba(255, 255, 255, 0.85));
}

.bg-preset-name {
  font-size: 11px;
}

.bg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.bg-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--ink-2);
  font-size: 12.5px;
  transition: background var(--dur-1), border-color var(--dur-1);
}

.bg-action:hover:not(:disabled) {
  background: var(--surface-hover);
}

.bg-action.selected {
  border-color: var(--accent-2);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.bg-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.bg-hint,
.bg-error,
.bg-status {
  margin-top: 10px;
  font-size: 11.5px;
  line-height: 1.5;
}

.bg-hint {
  color: var(--ink-4);
}

.bg-error {
  color: var(--danger);
}

.bg-status {
  color: var(--accent);
}

.spin {
  animation: tick-spin 900ms linear infinite;
}

@keyframes bg-fade {
  from { opacity: 0; }
}

@keyframes bg-rise {
  from { opacity: 0; transform: translateY(10px) scale(0.99); }
}

@media (max-width: 768px) {
  .bg-backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .bg-dialog {
    width: 100%;
    max-height: 88dvh;
    border-radius: var(--r-xl) var(--r-xl) 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .bg-preview {
    height: 138px;
    margin-inline: 12px;
  }

  .bg-head {
    padding-inline: 16px;
  }

  .bg-body {
    padding-inline: 16px;
  }

  .bg-presets {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .bg-action {
    flex: 1;
    justify-content: center;
    min-height: 44px;
  }
}
</style>
