<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Heart, MessageCircle, MoreHorizontal, Trash2, EyeOff } from 'lucide-vue-next'
import AppAvatar from '../AppAvatar.vue'
import MomentMediaGrid from './MomentMediaGrid.vue'
import { VISIBILITY_LABEL, authorName, type Moment, type MomentComment } from '../../api/moments'
import type { Id } from '../../api/client'
import { initialsOf, relativeTime, toneOfPerson } from '../../utils/present'

/**
 * 信息流里的一条动态。
 *
 * <p>只负责展示与发出意图，点赞/评论/删除的状态变更全部交给 store，
 * 卡片本身不持有任何副本，避免列表与详情页各自维护一份数据。</p>
 */
const props = defineProps<{
  moment: Moment
  selfId: Id
}>()

const emit = defineEmits<{
  (e: 'open'): void
  (e: 'like'): void
  (e: 'comment', replyTo?: MomentComment | null): void
  (e: 'delete'): void
  (e: 'preview', index: number): void
  (e: 'profile', userId: Id, anchor: HTMLElement): void
}>()

const menuOpen = ref(false)
const actions = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const failedAvatar = ref('')

const name = computed(() => authorName(props.moment.author))
const avatarUrl = computed(() => {
  const url = props.moment.author.avatar?.trim()
  return url && /^(https?:\/\/|\/(?!\/))/i.test(url) ? url : ''
})
const contentLink = computed(() => {
  const text = props.moment.content?.trim()
  if (!text || !/^https?:\/\/\S+$/i.test(text)) return ''
  try {
    return new URL(text).href
  } catch {
    return ''
  }
})
const likedText = computed(() => props.moment.likers.map(authorName).join('、'))
const previewComments = computed(() => props.moment.comments.slice(0, 5))
const moreComments = computed(() => Math.max(0, props.moment.commentCount - previewComments.value.length))
const likeLabel = computed(() => props.moment.liked ? '取消赞' : '赞')

watch(menuOpen, (open, _, onCleanup) => {
  if (!open) return
  function closeOutside(event: PointerEvent) {
    if (event.target instanceof Node && !actions.value?.contains(event.target)) menuOpen.value = false
  }
  document.addEventListener('pointerdown', closeOutside, true)
  onCleanup(() => document.removeEventListener('pointerdown', closeOutside, true))
})

function toneOf(userId: Id) {
  return toneOfPerson(userId, props.selfId)
}

function openProfile(event: MouseEvent, userId: Id) {
  emit('profile', userId, event.currentTarget as HTMLElement)
}

function commentName(comment: MomentComment) {
  return authorName(comment.author)
}

function closeOnBlur(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && !actions.value?.contains(event.relatedTarget)) menuOpen.value = false
}

function closeMenu() {
  menuOpen.value = false
  trigger.value?.focus()
}
</script>

<template>
  <article class="moment">
    <button type="button" class="m-avatar" :aria-label="'查看 ' + name + ' 的资料'" @click="openProfile($event, moment.author.userId)">
      <AppAvatar :initials="initialsOf(name)" :tone="toneOf(moment.author.userId)" size="md" rounded />
      <img v-if="avatarUrl && failedAvatar !== avatarUrl" :key="avatarUrl" :src="avatarUrl" alt="" loading="lazy" referrerpolicy="no-referrer" @error="failedAvatar = avatarUrl" />
    </button>
    <div class="moment-body">
      <button type="button" class="m-name" @click="openProfile($event, moment.author.userId)">{{ name }}</button>

      <p v-if="moment.hidden" class="m-hidden"><EyeOff :size="14" />该动态已被运营隐藏，仅你自己可见</p>

      <a v-if="contentLink" class="m-content m-link" :href="contentLink" target="_blank" rel="noopener noreferrer">{{ moment.content.trim() }}</a>
      <button v-else-if="moment.content" type="button" class="m-content" @click="emit('open')">
        {{ moment.content }}
      </button>

      <MomentMediaGrid
        v-if="moment.media.length"
        class="m-media"
        :moment-id="moment.id"
        :media="moment.media"
        @open="(index) => emit('preview', index)"
      />

      <footer class="m-foot">
        <div class="m-sub">
          <time :datetime="moment.createdAt">{{ relativeTime(moment.createdAt) }}</time>
          <span v-if="moment.mine || moment.visibility !== 'ALL_FRIENDS'" class="m-visibility">
            {{ VISIBILITY_LABEL[moment.visibility] }}
          </span>
        </div>
        <div ref="actions" class="m-more" @focusout="closeOnBlur" @keydown.esc.stop.prevent="closeMenu">
          <button ref="trigger" type="button" class="m-trigger" :class="{ liked: moment.liked }" aria-label="动态操作" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
            <MoreHorizontal :size="17" :stroke-width="2.2" />
          </button>
          <div v-if="menuOpen" class="m-menu" role="group" aria-label="动态操作">
            <button
              type="button"
              :class="{ active: moment.liked }"
              :aria-pressed="moment.liked"
              :aria-label="likeLabel + (moment.likeCount > 0 ? '，共 ' + moment.likeCount + ' 人' : '')"
              @click="closeMenu(); emit('like')"
            >
              <Heart :size="15" :fill="moment.liked ? 'currentColor' : 'none'" />{{ likeLabel }}
            </button>
            <button
              type="button"
              :aria-label="moment.commentCount > 0 ? `${moment.commentCount} 条评论` : '评论'"
              @click="closeMenu(); emit('comment', null)"
            >
              <MessageCircle :size="15" />评论
            </button>
            <button v-if="moment.mine" type="button" class="m-menu-danger" @click="closeMenu(); emit('delete')">
              <Trash2 :size="15" />删除
            </button>
          </div>
        </div>
      </footer>

      <div v-if="moment.likeCount || moment.likers.length || previewComments.length || moreComments" class="m-thread">
        <p v-if="moment.likeCount || moment.likers.length" class="m-likes">
          <Heart :size="13" fill="currentColor" :stroke-width="0" />
          <span v-if="likedText" class="m-likes-text">{{ likedText }}</span>
          <span v-if="moment.likeCount > moment.likers.length" class="m-likes-more">{{ likedText ? '等 ' : '' }}{{ moment.likeCount }} 人</span>
        </p>
        <ul v-if="previewComments.length" class="m-comments">
          <li v-for="comment in previewComments" :key="String(comment.id)">
            <button type="button" class="m-comment-name" @click="openProfile($event, comment.author.userId)">{{ commentName(comment) }}</button>
            <template v-if="comment.replyToName"> 回复 <span class="m-comment-name">{{ comment.replyToName }}</span></template>
            <span class="m-comment-text">：{{ comment.content }}</span>
          </li>
        </ul>
        <button v-if="moreComments > 0" type="button" class="m-more-comments" @click="emit('open')">
          查看全部 {{ moment.commentCount }} 条评论
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.moment {
  display: grid;
  grid-template-columns: var(--mv-avatar-size) minmax(0, 1fr);
  align-items: start;
  gap: var(--mv-post-gap);
  min-width: 0;
  padding-block: 22px 18px;
  /* 屏外卡片跳过布局与绘制；高度记住上次的实测值，滚动条不会跳动 */
  content-visibility: auto;
  contain-intrinsic-size: auto 260px;
}
.moment + .moment { border-top: 1px solid var(--line); }

.m-avatar { position: relative; display: block; width: var(--mv-avatar-size); height: var(--mv-avatar-size); border-radius: var(--r-xs); }
.m-avatar .avatar,
.m-avatar img { width: 100%; height: 100%; border-radius: inherit; }
.m-avatar img { position: absolute; inset: 0; object-fit: cover; }
.moment-body { min-width: 0; }
.m-name { display: block; max-width: 100%; font-size: 14px; font-weight: 650; color: var(--mv-link); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-name:hover { text-decoration: underline; text-underline-offset: 3px; }

.m-hidden { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: 12px; color: var(--warn); }
.m-hidden svg { flex-shrink: 0; }

.m-content { display: block; width: 100%; margin-top: 3px; text-align: left; font-size: 15px; line-height: 1.55; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.m-link { color: var(--mv-link); }
.m-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.m-media {
  --mm-max-width: 368px;
  --mm-pair-width: 244px;
  --mm-pair-ratio: 1;
  --mm-single-width: 268px;
  --mm-single-height: 264px;
  --mm-gap: 4px;
  --mm-radius: 4px;
  --mm-top: 8px;
}

.m-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 7px; }
.m-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 8px; font-size: 12px; color: var(--mv-muted); }
.m-visibility { padding: 1px 5px; border: 1px solid var(--line); border-radius: var(--r-xs); font-size: 11px; color: var(--ink-2); }

.m-more { position: relative; flex-shrink: 0; }
.m-trigger { position: relative; isolation: isolate; display: grid; place-items: center; width: 40px; height: 32px; border-radius: var(--r-xs); color: var(--mv-link); }
.m-trigger::before { content: ''; position: absolute; z-index: -1; inset: 4px 2px; border-radius: var(--r-xs); background: var(--surface-3); }
.m-trigger:hover::before,
.m-trigger[aria-expanded='true']::before { background: var(--accent-soft); }
.m-trigger.liked { color: var(--danger); }
.m-menu { position: absolute; z-index: 6; inset-inline-end: calc(100% + 4px); top: 50%; transform: translateY(-50%); display: flex; align-items: center; width: max-content; padding: 3px; border: 1px solid var(--line-strong); border-radius: var(--r-sm); background: var(--surface); box-shadow: var(--shadow-pop); }
.m-menu button { display: flex; align-items: center; gap: 4px; min-height: 34px; padding: 0 8px; border-radius: var(--r-xs); font-size: 13px; }
.m-menu button:hover { background: var(--surface-3); }
.m-menu button.active,
.m-menu .m-menu-danger { color: var(--danger); }

.m-thread { margin-top: 5px; padding: 7px 9px; border-radius: var(--r-xs); background: var(--surface-3); }
.m-likes { display: flex; align-items: baseline; gap: 6px; font-size: 12px; font-weight: 550; color: var(--mv-link); }
.m-likes > svg { flex-shrink: 0; color: var(--danger); transform: translateY(1px); }
.m-likes-text { overflow-wrap: anywhere; }
.m-likes-more { flex-shrink: 0; color: var(--mv-muted); font-size: 11px; }
.m-comments { display: grid; gap: 3px; }
.m-likes + .m-comments { margin-top: 5px; padding-top: 5px; border-top: 1px solid var(--line); }
.m-comments li { font-size: 13px; line-height: 1.65; color: var(--ink-2); overflow-wrap: anywhere; }
.m-comment-name { max-width: 100%; font-size: 13px; font-weight: 600; color: var(--mv-link); }
button.m-comment-name:hover { text-decoration: underline; }
.m-comment-text { color: var(--ink); white-space: pre-wrap; }
.m-more-comments { padding-block: 3px; font-size: 12px; color: var(--mv-link); }
.m-comments + .m-more-comments { margin-top: 4px; }
.m-more-comments:hover { text-decoration: underline; }

@media (max-width: 768px) {
  .moment { padding-block: 17px 13px; }
  .m-media { --mm-single-width: 244px; --mm-single-height: 244px; }
  .m-trigger { width: 44px; height: 44px; }
  .m-trigger::before { inset: 9px 4px; }
  .m-menu button { min-height: 44px; }
  .m-foot { margin-top: 3px; }
  .m-thread { margin-top: 0; }
}
</style>
