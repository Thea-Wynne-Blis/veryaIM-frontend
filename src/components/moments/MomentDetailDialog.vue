<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Heart, Loader2, MessageCircle, Send, Trash2, X } from 'lucide-vue-next'
import AppAvatar from '../AppAvatar.vue'
import MomentMediaGrid from './MomentMediaGrid.vue'
import { authorName, momentsApi, type Moment, type MomentComment } from '../../api/moments'
import type { Id } from '../../api/client'
import { useMomentsStore } from '../../stores/moments'
import { useToast } from '../../composables/useToast'
import { messageOf } from '../../utils/error'
import { initialsOf, relativeTime, toneOfPerson } from '../../utils/present'

/**
 * 动态详情：完整正文 + 全部评论 + 评论/回复输入。
 *
 * <p>列表里的评论只是最多 5 条预览，这里单独分页拉全量，
 * 新增与删除都走 store，卡片上的计数会同步变化。</p>
 */
const props = defineProps<{
  moment: Moment
  selfId: Id
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'like'): void
  (e: 'delete'): void
  (e: 'preview', index: number): void
  (e: 'profile', userId: Id, anchor: HTMLElement): void
}>()

const store = useMomentsStore()
const { message: notice, show: flash } = useToast()

const dialog = ref<HTMLDialogElement | null>(null)
const comments = ref<MomentComment[]>([])
const cursor = ref<string | null>(null)
const hasMore = ref(false)
const loading = ref(true)
const loadingMore = ref(false)
const loadError = ref('')
const draft = ref('')
const replyTo = ref<MomentComment | null>(null)
const sending = ref(false)
const deleting = ref<Id | null>(null)
const input = ref<HTMLTextAreaElement | null>(null)

const name = computed(() => authorName(props.moment.author))
const visibleComments = computed(() => comments.value)
const canDeleteMoment = computed(() => props.moment.mine)

onMounted(async () => {
  dialog.value?.showModal()
  await load(true)
})

async function load(reset: boolean) {
  if (reset) loading.value = true
  else loadingMore.value = true
  loadError.value = ''
  try {
    const page = await momentsApi.comments(props.moment.id, reset ? null : cursor.value, 20)
    comments.value = reset ? page.items : [...comments.value, ...page.items]
    cursor.value = page.nextCursor
    hasMore.value = page.hasMore
  } catch (e) {
    loadError.value = messageOf(e, '加载评论失败')
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function close() {
  dialog.value?.close()
  emit('close')
}

function toneOf(userId: Id) {
  return toneOfPerson(userId, props.selfId)
}

function openProfile(event: MouseEvent, userId: Id) {
  emit('profile', userId, event.currentTarget as HTMLElement)
}

function startReply(comment: MomentComment) {
  replyTo.value = comment
  input.value?.focus()
}

function cancelReply() {
  replyTo.value = null
}

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value) return
  sending.value = true
  try {
    const comment = await store.addComment(props.moment.id, text, replyTo.value?.id ?? null)
    comments.value = [...comments.value, comment]
    draft.value = ''
    replyTo.value = null
  } catch (e) {
    flash(messageOf(e, '评论失败，请重试'))
  } finally {
    sending.value = false
  }
}

async function removeComment(comment: MomentComment) {
  if (deleting.value != null) return
  deleting.value = comment.id
  try {
    await store.deleteComment(props.moment.id, comment)
    comments.value = comments.value.filter((item) => String(item.id) !== String(comment.id))
  } catch (e) {
    flash(messageOf(e, '删除评论失败'))
  } finally {
    deleting.value = null
  }
}

function canDelete(comment: MomentComment): boolean {
  return comment.mine || canDeleteMoment.value
}

function replyLabel(comment: MomentComment): string {
  return comment.replyToName ? `回复 ${comment.replyToName}` : ''
}
</script>

<template>
  <dialog ref="dialog" class="detail-dialog" aria-labelledby="moment-detail-title" @cancel.prevent="close" @click.self="close">
    <section class="detail">
      <header class="detail-head">
        <h2 id="moment-detail-title">动态详情</h2>
        <button type="button" class="icon-btn" aria-label="关闭" @click="close"><X :size="20" /></button>
      </header>

      <div class="detail-scroll">
        <article class="detail-moment">
          <header class="detail-author">
            <button type="button" class="detail-avatar" @click="openProfile($event, moment.author.userId)">
              <AppAvatar :initials="initialsOf(name)" :tone="toneOf(moment.author.userId)" size="md" />
            </button>
            <div>
              <button type="button" class="detail-name" @click="openProfile($event, moment.author.userId)">{{ name }}</button>
              <time :datetime="moment.createdAt">{{ relativeTime(moment.createdAt) }}</time>
            </div>
            <button v-if="canDeleteMoment" type="button" class="detail-delete" @click="emit('delete')"><Trash2 :size="15" />删除</button>
          </header>
          <p v-if="moment.content" class="detail-content">{{ moment.content }}</p>
          <MomentMediaGrid
            v-if="moment.media.length"
            :moment-id="moment.id"
            :media="moment.media"
            @open="(index) => emit('preview', index)"
          />
          <div class="detail-actions">
            <button type="button" class="detail-action" :class="{ active: moment.liked }" :aria-pressed="moment.liked" @click="emit('like')">
              <Heart :size="16" :stroke-width="1.9" :fill="moment.liked ? 'currentColor' : 'none'" />
              {{ moment.likeCount > 0 ? `${moment.likeCount} 人赞` : '赞' }}
            </button>
            <span class="detail-action static"><MessageCircle :size="16" :stroke-width="1.9" />{{ moment.commentCount }} 条评论</span>
          </div>
          <p v-if="moment.likers.length" class="detail-likers">{{ moment.likers.map(authorName).join('、') }}<span v-if="moment.likeCount > moment.likers.length"> 等 {{ moment.likeCount }} 人</span> 赞过</p>
        </article>

        <section class="detail-comments" aria-label="评论">
          <p v-if="loading" class="detail-hint"><Loader2 :size="15" class="spin" />正在加载评论…</p>
          <div v-else-if="loadError" class="detail-error" role="alert">
            <span>{{ loadError }}</span>
            <button type="button" @click="load(true)">重试</button>
          </div>
          <p v-else-if="!visibleComments.length" class="detail-hint">还没有评论，来说点什么。</p>
          <ul v-else class="detail-list">
            <li v-for="comment in visibleComments" :key="String(comment.id)" class="detail-comment">
              <button type="button" class="detail-avatar sm" @click="openProfile($event, comment.author.userId)">
                <AppAvatar :initials="initialsOf(authorName(comment.author))" :tone="toneOf(comment.author.userId)" size="sm" />
              </button>
              <div class="detail-comment-body">
                <p class="detail-comment-head">
                  <button type="button" class="detail-name" @click="openProfile($event, comment.author.userId)">{{ authorName(comment.author) }}</button>
                  <time :datetime="comment.createdAt">{{ relativeTime(comment.createdAt) }}</time>
                </p>
                <p class="detail-comment-text">
                  <span v-if="replyLabel(comment)" class="detail-reply">{{ replyLabel(comment) }}：</span>{{ comment.content }}
                </p>
                <p class="detail-comment-ops">
                  <button type="button" @click="startReply(comment)">回复</button>
                  <button
                    v-if="canDelete(comment)"
                    type="button"
                    class="danger"
                    :disabled="deleting != null"
                    @click="removeComment(comment)"
                  >
                    <Loader2 v-if="deleting != null && String(deleting) === String(comment.id)" :size="12" class="spin" />删除
                  </button>
                </p>
              </div>
            </li>
          </ul>
          <button v-if="hasMore" type="button" class="detail-more" :disabled="loadingMore" @click="load(false)">
            <Loader2 v-if="loadingMore" :size="14" class="spin" />加载更多评论
          </button>
        </section>
      </div>

      <footer class="detail-compose">
        <p v-if="replyTo" class="detail-reply-bar">
          回复 {{ authorName(replyTo.author) }}
          <button type="button" class="icon-btn" aria-label="取消回复" @click="cancelReply"><X :size="14" /></button>
        </p>
        <div class="detail-input-row">
          <textarea
            ref="input"
            v-model="draft"
            rows="1"
            maxlength="500"
            :placeholder="replyTo ? `回复 ${authorName(replyTo.author)}` : '写评论…'"
            @keydown.enter.exact.prevent="send"
          />
          <button type="button" class="detail-send" :disabled="!draft.trim() || sending" aria-label="发送评论" @click="send">
            <Loader2 v-if="sending" :size="16" class="spin" />
            <Send v-else :size="16" />
          </button>
        </div>
        <p v-if="notice" class="detail-notice" role="status">{{ notice }}</p>
      </footer>
    </section>
  </dialog>
</template>

<style scoped>
.detail-dialog { width: min(660px, calc(100vw - 32px)); max-width: none; height: min(740px, calc(100dvh - 48px)); padding: 0; margin: auto; border: 1px solid var(--line-strong); border-radius: var(--r-lg); color: var(--ink); background: var(--surface); box-shadow: var(--shadow-lg); }
.detail-dialog::backdrop { background: #101b245c; backdrop-filter: blur(3px); }
.detail { display: flex; flex-direction: column; height: 100%; }
.detail-head { display: flex; align-items: center; gap: 12px; padding: 13px 20px; border-bottom: 1px solid var(--line); }
.detail-head h2 { flex: 1; font-size: 17px; font-weight: 650; }

.detail-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.detail-moment { padding: 18px 20px; border-bottom: 1px solid var(--line); }
.detail-author { display: flex; align-items: center; gap: 10px; }
.detail-avatar { flex-shrink: 0; border-radius: var(--r-full); }
.detail-avatar.sm { width: 30px; height: 30px; }
.detail-author > div { flex: 1; min-width: 0; }
.detail-name { max-width: 100%; font-size: 14px; font-weight: 650; color: var(--ink); overflow-wrap: anywhere; }
.detail-name:hover { text-decoration: underline; }
.detail-author time { display: block; margin-top: 2px; font-size: 12px; color: var(--mv-muted); }
.detail-delete { display: inline-flex; align-items: center; gap: 5px; padding: 6px 8px; border-radius: var(--r-xs); font-size: 12px; color: var(--ink-3); }
.detail-delete:hover { color: var(--danger); background: var(--danger-soft); }
.detail-content { margin-top: 12px; font-size: 15px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
.detail-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.detail-action { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 10px; border-radius: var(--r-sm); font-size: 13px; color: var(--mv-muted); }
.detail-action:hover:not(.static) { color: var(--ink); background: var(--surface-hover); }
.detail-action.active { color: var(--danger); background: var(--danger-soft); }
.detail-action.static { cursor: default; }
.detail-likers { margin-top: 10px; font-size: 12px; color: var(--accent-ink); overflow-wrap: anywhere; }
.detail-likers > span { color: var(--ink-3); }

.detail-comments { padding: 14px 20px 18px; }
.detail-hint { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 26px 0; font-size: 12px; color: var(--ink-3); }
.detail-error { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: var(--r-xs); font-size: 12px; color: var(--danger); background: var(--danger-soft); }
.detail-error button { text-decoration: underline; }
.detail-list { margin: 0; padding: 0; list-style: none; }
.detail-comment { display: flex; gap: 10px; padding: 10px 0; }
.detail-comment + .detail-comment { border-top: 1px solid var(--line); }
.detail-comment-body { flex: 1; min-width: 0; }
.detail-comment-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.detail-comment-head time { font-size: 11px; color: var(--mv-muted); white-space: nowrap; }
.detail-comment-text { margin-top: 3px; font-size: 13px; line-height: 1.65; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-reply { color: var(--accent-ink); }
.detail-comment-ops { display: flex; gap: 12px; margin-top: 4px; font-size: 11px; color: var(--ink-3); }
.detail-comment-ops button { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
.detail-comment-ops button:hover { color: var(--accent); }
.detail-comment-ops button.danger:hover { color: var(--danger); }
.detail-more { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; min-height: 36px; margin-top: 8px; border-radius: var(--r-xs); font-size: 12px; color: var(--accent); background: var(--surface-2); }

.detail-compose { padding: 12px 20px; border-top: 1px solid var(--line); background: var(--surface-2); }
.detail-reply-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; padding: 4px 8px; border-radius: var(--r-xs); font-size: 11px; color: var(--ink-2); background: var(--surface-3); }
.detail-reply-bar .icon-btn { width: 22px; height: 22px; margin-left: auto; }
.detail-input-row { display: flex; align-items: flex-end; gap: 8px; }
.detail-input-row textarea { flex: 1; min-width: 0; min-height: 42px; max-height: 120px; padding: 9px 12px; resize: none; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); font-size: 14px; line-height: 1.5; }
.detail-input-row textarea:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
.detail-send { display: grid; place-items: center; width: 42px; height: 42px; flex-shrink: 0; border-radius: var(--r-md); color: var(--surface); background: var(--mv-primary); }
.detail-send:hover:not(:disabled) { background: var(--mv-primary-hover); }
.detail-send:disabled { opacity: 0.45; cursor: not-allowed; }
.detail-notice { margin-top: 8px; font-size: 11px; color: var(--accent-ink); }
.spin { animation: tick-spin 900ms linear infinite; }

@media (max-width: 768px) {
  .detail-dialog { width: 100vw; height: var(--mobile-viewport-height, 100dvh); max-height: none; border: 0; border-radius: 0; }
  .detail-head { padding: calc(env(safe-area-inset-top, 0px) + 8px) 14px 8px; }
  .detail-moment { padding: 16px 14px; }
  .detail-comments { padding: 12px 14px 16px; }
  .detail-compose { padding: 10px 12px calc(env(safe-area-inset-bottom, 0px) + 10px); }
  .detail-input-row textarea { font-size: 16px; }
  .detail-action { min-height: 44px; }
  .detail-send { width: 44px; height: 44px; }
}
</style>
