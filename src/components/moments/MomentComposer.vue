<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ImagePlus, Loader2, Lock, X } from 'lucide-vue-next'
import AppAvatar from '../AppAvatar.vue'
import { api, type Id } from '../../api/client'
import {
  VISIBILITY_LABEL,
  uploadMomentFile,
  type MomentVisibility,
  type PublishMomentPayload,
} from '../../api/moments'
import { useAuthStore } from '../../stores/auth'
import { useMomentsStore } from '../../stores/moments'
import { useToast } from '../../composables/useToast'
import { createTaskQueue } from '../../utils/async'
import { messageOf } from '../../utils/error'
import { initialsOf } from '../../utils/present'
import { userAvatarSrc } from '../../utils/avatar'

/**
 * 发布动态：正文 + 最多 9 个图片/视频 + 可见范围。
 *
 * <p>文件在选择后立即上传，发布时只提交 fileId：一方面进度可见，
 * 另一方面用户等待的只是「写一行数据库」，失败重试成本最低。</p>
 */
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'published'): void
}>()

type Friend = { friendId: Id; nickname: string; remark?: string | null }

type Draft = {
  fileId: Id | null
  kind: 'IMAGE' | 'VIDEO'
  previewUrl: string
  name: string
  width: number
  height: number
  durationSeconds?: number
  progress: number
  error: string
}

const MAX_MEDIA = 9
const MAX_CONTENT = 2000

const auth = useAuthStore()
const moments = useMomentsStore()
const { message: notice, show: flash } = useToast()

const dialog = ref<HTMLDialogElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const content = ref('')
const visibility = ref<MomentVisibility>('ALL_FRIENDS')
const drafts = reactive<Draft[]>([])
// 多选时最多 3 个同时上传：一起发只会互相抢带宽，进度反而都变慢
const enqueueUpload = createTaskQueue(3)
const friends = ref<Friend[]>([])
const audience = ref<Id[]>([])
const audienceKeyword = ref('')
const submitting = ref(false)
const error = ref('')

const uploading = computed(() => drafts.some((item) => !item.fileId && !item.error))
const canSubmit = computed(() =>
  !submitting.value
  && !uploading.value
  && !drafts.some((item) => !item.fileId)
  && (content.value.trim().length > 0 || drafts.length > 0)
  && (visibility.value !== 'PARTIAL' && visibility.value !== 'EXCLUDE' || audience.value.length > 0),
)
const filteredFriends = computed(() => {
  const keyword = audienceKeyword.value.trim().toLowerCase()
  if (!keyword) return friends.value
  return friends.value.filter((item) =>
    `${item.remark ?? ''}${item.nickname}`.toLowerCase().includes(keyword))
})

const visibilityOptions: Array<{ key: MomentVisibility; hint: string }> = [
  { key: 'ALL_FRIENDS', hint: '所有朋友都能看到' },
  { key: 'PRIVATE', hint: '只写给自己看' },
  { key: 'PARTIAL', hint: '选中的人可见' },
  { key: 'EXCLUDE', hint: '选中的人看不到' },
]

onMounted(async () => {
  dialog.value?.showModal()
  try {
    const data = await api.get<{ friends: Friend[] }>('/contacts')
    friends.value = Array.isArray(data?.friends) ? data.friends : []
  } catch {
    friends.value = []
  }
})

onBeforeUnmount(() => {
  for (const draft of drafts) URL.revokeObjectURL(draft.previewUrl)
  dialog.value?.close()
})

function close() {
  emit('close')
}

function pickFiles() {
  fileInput.value?.click()
}

async function addFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  const room = MAX_MEDIA - drafts.length
  for (const file of files.slice(0, Math.max(0, room))) {
    const kind = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE'
    if (kind === 'IMAGE' && !file.type.startsWith('image/')) {
      flash('只支持图片或视频')
      continue
    }
    const draft = reactive<Draft>({
      fileId: null,
      kind,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      width: 0,
      height: 0,
      progress: 0,
      error: '',
    })
    drafts.push(draft)
    void probe(draft)
    enqueueUpload(() => upload(draft, file))
  }
  if (files.length > room) flash(`最多 ${MAX_MEDIA} 个图片或视频`)
}

/** 读取像素尺寸与视频时长：缺失也能发布，只影响版式与时长展示。 */
function probe(draft: Draft) {
  if (draft.kind === 'VIDEO') {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      draft.width = video.videoWidth
      draft.height = video.videoHeight
      if (Number.isFinite(video.duration)) draft.durationSeconds = Math.round(video.duration)
    }
    video.src = draft.previewUrl
    return
  }
  const image = new Image()
  image.onload = () => {
    draft.width = image.naturalWidth
    draft.height = image.naturalHeight
  }
  image.src = draft.previewUrl
}

async function upload(draft: Draft, file: File) {
  try {
    const row = await uploadMomentFile(file, (ratio) => { draft.progress = ratio })
    draft.fileId = row.fileId
    draft.progress = 1
  } catch (e) {
    draft.error = messageOf(e, '上传失败')
  }
}

function removeDraft(index: number) {
  const [draft] = drafts.splice(index, 1)
  if (draft) URL.revokeObjectURL(draft.previewUrl)
}

function toggleAudience(userId: Id) {
  const index = audience.value.findIndex((item) => String(item) === String(userId))
  if (index >= 0) audience.value.splice(index, 1)
  else audience.value = [...audience.value, userId]
}

function selected(userId: Id): boolean {
  return audience.value.some((item) => String(item) === String(userId))
}

function friendName(friend: Friend): string {
  return friend.remark?.trim() || friend.nickname
}

async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  error.value = ''
  const payload: PublishMomentPayload = {
    content: content.value.trim(),
    visibility: visibility.value,
    media: drafts.flatMap((draft) => draft.fileId == null ? [] : [{
      fileId: draft.fileId,
      kind: draft.kind,
      width: draft.width,
      height: draft.height,
      durationSeconds: draft.durationSeconds ?? null,
    }]),
  }
  if (visibility.value === 'PARTIAL' || visibility.value === 'EXCLUDE') {
    payload.audienceUserIds = audience.value
  }
  try {
    await moments.publish(payload)
    emit('published')
  } catch (e) {
    error.value = messageOf(e, '发布失败，请重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="composer-dialog" aria-labelledby="composer-title" @cancel.prevent="close" @click.self="close">
    <section class="composer">
      <header class="composer-head">
        <h2 id="composer-title">发布动态</h2>
        <button type="button" class="icon-btn" aria-label="关闭" @click="close"><X :size="20" /></button>
      </header>

      <div class="composer-body">
        <div class="composer-author">
          <AppAvatar
            :initials="initialsOf(auth.user?.nickname || '我')"
            :src="auth.user?.avatar || userAvatarSrc(auth.user?.userId)"
            tone="jade"
            size="md"
          />
          <div>
            <p>{{ auth.user?.nickname || '我' }}</p>
            <span>{{ VISIBILITY_LABEL[visibility] }}</span>
          </div>
        </div>

        <label class="composer-text">
          <span class="sr-only">动态正文</span>
          <textarea
            v-model="content"
            rows="4"
            :maxlength="MAX_CONTENT"
            placeholder="这一刻的想法…"
            @keydown.meta.enter="submit"
            @keydown.ctrl.enter="submit"
          />
          <span class="composer-count num">{{ content.length }}/{{ MAX_CONTENT }}</span>
        </label>

        <div v-if="drafts.length" class="composer-media">
          <div v-for="(draft, index) in drafts" :key="draft.previewUrl" class="composer-thumb">
            <video v-if="draft.kind === 'VIDEO'" :src="draft.previewUrl" muted playsinline />
            <img v-else :src="draft.previewUrl" alt="" />
            <span v-if="!draft.fileId && !draft.error" class="composer-progress">
              <Loader2 :size="16" class="spin" />
              <span class="num">{{ Math.round(draft.progress * 100) }}%</span>
            </span>
            <span v-else-if="draft.error" class="composer-progress error">{{ draft.error }}</span>
            <button type="button" class="composer-remove" aria-label="移除" @click="removeDraft(index)"><X :size="13" /></button>
          </div>
          <button v-if="drafts.length < MAX_MEDIA" type="button" class="composer-add" @click="pickFiles">
            <ImagePlus :size="20" :stroke-width="1.6" />
            <span>{{ drafts.length }}/{{ MAX_MEDIA }}</span>
          </button>
        </div>
        <button v-else type="button" class="composer-add wide" @click="pickFiles">
          <ImagePlus :size="20" :stroke-width="1.6" />
          <span>添加图片或视频</span>
        </button>
        <input ref="fileInput" type="file" accept="image/*,video/*" multiple hidden @change="addFiles" />

        <fieldset class="composer-visibility">
          <legend>谁可以看</legend>
          <div class="composer-options">
            <button
              v-for="option in visibilityOptions"
              :key="option.key"
              type="button"
              class="composer-option"
              :class="{ active: visibility === option.key }"
              :aria-pressed="visibility === option.key"
              @click="visibility = option.key"
            >
              <strong>{{ VISIBILITY_LABEL[option.key] }}</strong>
              <span>{{ option.hint }}</span>
            </button>
          </div>
          <div v-if="visibility === 'PARTIAL' || visibility === 'EXCLUDE'" class="composer-audience">
            <p class="composer-audience-hint">
              <Lock :size="13" />
              {{ visibility === 'PARTIAL' ? '选中的人可以看到这条动态' : '选中的人看不到这条动态' }}
              <span>{{ audience.length }} 人</span>
            </p>
            <input v-model="audienceKeyword" type="search" placeholder="搜索好友" maxlength="32" />
            <ul>
              <li v-for="friend in filteredFriends" :key="String(friend.friendId)">
                <label>
                  <input type="checkbox" :checked="selected(friend.friendId)" @change="toggleAudience(friend.friendId)" />
                  <span>{{ friendName(friend) }}</span>
                </label>
              </li>
              <li v-if="!filteredFriends.length" class="composer-audience-empty">没有匹配的好友</li>
            </ul>
          </div>
        </fieldset>

        <p v-if="error" class="composer-error" role="alert">{{ error }}</p>
        <p v-if="notice" class="composer-notice" role="status">{{ notice }}</p>
      </div>

      <footer class="composer-foot">
        <span class="composer-tip">Ctrl / ⌘ + Enter 快速发布</span>
        <button type="button" class="composer-submit" :disabled="!canSubmit" @click="submit">
          <Loader2 v-if="submitting" :size="16" class="spin" />
          {{ submitting ? '发布中…' : '发布' }}
        </button>
      </footer>
    </section>
  </dialog>
</template>

<style scoped>
.composer-dialog { width: min(600px, calc(100vw - 32px)); max-width: none; max-height: none; padding: 0; margin: auto; border: 1px solid var(--line-strong); border-radius: var(--r-lg); color: var(--ink); background: var(--surface); box-shadow: var(--shadow-lg); }
.composer-dialog::backdrop { background: #101b245c; backdrop-filter: blur(3px); }
.composer { display: flex; flex-direction: column; max-height: calc(100dvh - 48px); }
.composer-head { display: flex; align-items: center; gap: 12px; padding: 13px 20px; border-bottom: 1px solid var(--line); }
.composer-head h2 { flex: 1; font-size: 17px; font-weight: 650; }

.composer-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 20px; }
.composer-author { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.composer-author p { font-size: 14px; font-weight: 650; }
.composer-author > div { min-width: 0; overflow-wrap: anywhere; }
.composer-author > div > span { font-size: 12px; color: var(--mv-muted); }

.composer-text { display: block; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface-2); }
.composer-text:focus-within { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-ring); }
.composer-text textarea { display: block; width: 100%; min-height: 108px; padding: 11px 13px; resize: vertical; font-size: 15px; line-height: 1.65; color: var(--ink); }
.composer-text textarea:focus-visible { outline: none; }
.composer-count { display: block; padding: 0 13px 8px; text-align: right; font-size: 11px; color: var(--mv-muted); }

.composer-media { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
.composer-thumb { position: relative; aspect-ratio: 1; overflow: hidden; border-radius: var(--r-sm); background: var(--surface-3); }
.composer-thumb img,
.composer-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
.composer-progress { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; color: #fff; background: rgba(10, 14, 16, 0.45); }
.composer-progress.error { padding: 8px; text-align: center; color: #fff; background: rgba(207, 64, 64, 0.82); }
.composer-remove { position: absolute; top: 5px; right: 5px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; color: #fff; background: rgba(10, 14, 16, 0.55); }
.composer-add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; aspect-ratio: 1; border: 1px dashed var(--line-strong); border-radius: var(--r-md); color: var(--ink-2); background: var(--surface-2); font-size: 11px; }
.composer-add:hover { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-soft); }
.composer-add.wide { flex-direction: row; gap: 8px; aspect-ratio: auto; width: 100%; min-height: 56px; margin-top: 14px; font-size: 13px; }

.composer-visibility { min-width: 0; margin: 18px 0 0; padding: 0; border: 0; }
.composer-visibility legend { margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--ink-2); }
.composer-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.composer-option { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; text-align: left; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface-2); }
.composer-option strong { font-size: 13px; font-weight: 550; color: var(--ink); }
.composer-option span { font-size: 12px; color: var(--mv-muted); }
.composer-option:hover { border-color: var(--line-strong); }
.composer-option.active { border-color: var(--accent); background: var(--accent-soft); }
.composer-option.active strong { color: var(--accent-ink); }

.composer-audience { margin-top: 12px; padding: 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface-2); }
.composer-audience-hint { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 12px; color: var(--ink-2); }
.composer-audience-hint > span { margin-left: auto; color: var(--ink-3); }
.composer-audience input[type='search'] { width: 100%; min-height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--r-xs); background: var(--surface); font-size: 13px; }
.composer-audience ul { max-height: 180px; margin: 8px 0 0; padding: 0; overflow-y: auto; list-style: none; }
.composer-audience label { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 0 4px; border-radius: var(--r-xs); font-size: 13px; }
.composer-audience label:hover { background: var(--surface-hover); }
.composer-audience-empty { padding: 10px 4px; font-size: 12px; color: var(--ink-3); }

.composer-error { margin-top: 14px; padding: 10px 12px; border-radius: var(--r-xs); font-size: 12px; color: var(--danger); background: var(--danger-soft); }
.composer-notice { margin-top: 14px; padding: 10px 12px; border-radius: var(--r-xs); font-size: 12px; color: var(--accent-ink); background: var(--accent-soft); }

.composer-foot { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-top: 1px solid var(--line); background: var(--surface-2); }
.composer-tip { flex: 1; font-size: 11px; color: var(--mv-muted); }
.composer-submit { display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 0 22px; border-radius: var(--r-sm); font-size: 13px; font-weight: 600; color: var(--surface); background: var(--mv-primary); }
.composer-submit:hover:not(:disabled) { background: var(--mv-primary-hover); }
.composer-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.spin { animation: tick-spin 900ms linear infinite; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }

@media (max-width: 768px) {
  .composer-dialog { width: 100vw; height: var(--mobile-viewport-height, 100dvh); max-height: none; border: 0; border-radius: 0; }
  .composer { height: 100%; max-height: none; }
  .composer-head { padding: calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px; }
  .composer-body { padding: 16px; }
  .composer-text textarea { font-size: 16px; }
  .composer-foot { padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px); }
  .composer-tip { display: none; }
  .composer-submit { flex: 1; justify-content: center; min-height: 44px; }
}
</style>
