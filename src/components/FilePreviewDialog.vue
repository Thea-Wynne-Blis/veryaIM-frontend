<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, Loader2, X, FileText } from 'lucide-vue-next'
import { downloadFile } from '../api/client'
import { humanBytes } from '../utils/present'
import type { PreviewFile } from '../utils/filePreview'
import FilePreviewContent from './FilePreviewContent.vue'

const props = defineProps<{ file: PreviewFile }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const dialog = ref<HTMLDialogElement | null>(null)
const downloading = ref(false)
const error = ref('')
async function download() {
  if (downloading.value) return
  downloading.value = true; error.value = ''
  try { await downloadFile(props.file.fileId, props.file.name) }
  catch (e) { error.value = e instanceof Error ? e.message : '下载失败，请重试' }
  finally { downloading.value = false }
}
onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
  <dialog ref="dialog" class="file-preview-dialog" aria-label="文件预览" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <div class="preview-window"><header><FileText :size="22" class="preview-header-icon" /><div><h2>{{ file.name }}</h2><p>文件预览<template v-if="file.sizeBytes != null"> · {{ humanBytes(file.sizeBytes) }}</template></p></div><button class="icon-btn" aria-label="关闭文件预览" @click="emit('close')"><X :size="20" /></button></header>
      <div class="preview-body"><FilePreviewContent :file="file" /></div>
      <footer><p v-if="error" role="alert">{{ error }}</p><span v-else>在线查看内容</span><button :disabled="downloading" @click="download"><Loader2 v-if="downloading" :size="16" class="spin" /><Download v-else :size="16" />{{ downloading ? '正在下载…' : '下载文件' }}</button></footer>
    </div>
  </dialog>
</template>

<style scoped>
.file-preview-dialog { width: min(960px, calc(100vw - 56px)); height: min(800px, calc(100dvh - 64px)); max-width: none; max-height: none; margin: auto; padding: 0; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface); color: var(--ink); box-shadow: var(--shadow-lg); }
.file-preview-dialog::backdrop { background: #101b2460; backdrop-filter: blur(3px); }
.preview-window { display: flex; flex-direction: column; height: 100%; min-height: 0; }
header { display: flex; align-items: center; gap: 12px; padding: 16px 22px; border-bottom: 1px solid var(--line); }
.preview-header-icon { flex-shrink: 0; color: var(--accent); }
header > div { flex: 1; min-width: 0; }
h2 { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
header p { margin-top: 4px; color: var(--ink-3); font-size: 11px; }
header .icon-btn { width: 40px; height: 40px; flex-shrink: 0; }
.preview-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 22px; border-top: 1px solid var(--line); }
footer > span { font-size: 12px; color: var(--ink-3); }
footer p { font-size: 12px; color: var(--danger); }
footer button { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 14px; min-height: 38px; border: 1px solid var(--line); border-radius: 6px; font-size: 12px; flex-shrink: 0; }
.spin { animation: tick-spin 900ms linear infinite; }
@media (max-width: 768px) { .file-preview-dialog { width: 100vw; height: var(--mobile-viewport-height, 100dvh); border: 0; border-radius: 0; } header { padding: calc(env(safe-area-inset-top, 0px) + 8px) 16px 8px; } header .icon-btn { width: 44px; height: 44px; } footer { padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px); } footer button { min-height: 44px; font-size: 13px; } }
</style>
