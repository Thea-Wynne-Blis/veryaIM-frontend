<script setup lang="ts">
import { computed, ref } from 'vue'
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

const name = computed(() => authorName(props.moment.author))
const likedText = computed(() => props.moment.likers.map(authorName).join('、'))
const previewComments = computed(() => props.moment.comments.slice(0, 5))
const moreComments = computed(() => Math.max(0, props.moment.commentCount - previewComments.value.length))

function toneOf(userId: Id) {
  return toneOfPerson(userId, props.selfId)
}

function openProfile(event: MouseEvent, userId: Id) {
  emit('profile', userId, event.currentTarget as HTMLElement)
}

function commentName(comment: MomentComment) {
  return authorName(comment.author)
}

function onDelete() {
  menuOpen.value = false
  emit('delete')
}

function closeMenu() {
  menuOpen.value = false
}
</script>

<template>
  <article class="moment" :class="{ hidden: moment.hidden }">
    <header class="m-head">
      <button type="button" class="m-avatar" @click="openProfile($event, moment.author.userId)">
        <AppAvatar :initials="initialsOf(name)" :tone="toneOf(moment.author.userId)" size="md" />
      </button>
      <div class="m-meta">
        <button type="button" class="m-name" @click="openProfile($event, moment.author.userId)">{{ name }}</button>
        <p class="m-sub">
          <time :datetime="moment.createdAt">{{ relativeTime(moment.createdAt) }}</time>
          <span v-if="moment.mine || moment.visibility !== 'ALL_FRIENDS'" class="m-visibility">
            · {{ VISIBILITY_LABEL[moment.visibility] }}
          </span>
        </p>
      </div>
      <div v-if="moment.mine" class="m-more">
        <button type="button" class="icon-btn" aria-label="动态操作" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
          <MoreHorizontal :size="18" />
        </button>
        <div v-if="menuOpen" class="m-menu" @mouseleave="closeMenu">
          <button type="button" class="m-menu-danger" @click="onDelete"><Trash2 :size="15" />删除</button>
        </div>
      </div>
    </header>

    <p v-if="moment.hidden" class="m-hidden"><EyeOff :size="14" />该动态已被运营隐藏，仅你自己可见</p>

    <button v-if="moment.content" type="button" class="m-content" @click="emit('open')">
      {{ moment.content }}
    </button>

    <MomentMediaGrid
      v-if="moment.media.length"
      :moment-id="moment.id"
      :media="moment.media"
      @open="(index) => emit('preview', index)"
    />

    <div class="m-actions">
      <button
        type="button"
        class="m-action"
        :class="{ active: moment.liked }"
        :aria-pressed="moment.liked"
        :aria-label="moment.likeCount > 0 ? `${moment.liked ? '取消赞' : '赞'}，共 ${moment.likeCount} 人` : '赞'"
        @click="emit('like')"
      >
        <Heart :size="16" :stroke-width="1.9" :fill="moment.liked ? 'currentColor' : 'none'" />
        <span>{{ moment.likeCount > 0 ? moment.likeCount : '赞' }}</span>
      </button>
      <button
        type="button"
        class="m-action"
        :aria-label="moment.commentCount > 0 ? `${moment.commentCount} 条评论` : '评论'"
        @click="emit('comment', null)"
      >
        <MessageCircle :size="16" :stroke-width="1.9" />
        <span>{{ moment.commentCount > 0 ? moment.commentCount : '评论' }}</span>
      </button>
    </div>

    <div v-if="moment.likers.length || moment.comments.length" class="m-thread">
      <p v-if="moment.likers.length" class="m-likes">
        <Heart :size="13" fill="currentColor" :stroke-width="0" />
        <span class="m-likes-text">{{ likedText }}</span>
        <span v-if="moment.likeCount > moment.likers.length" class="m-likes-more">等 {{ moment.likeCount }} 人</span>
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
  </article>
</template>

<style scoped>
.moment {
  padding: 18px 20px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  transition: border-color var(--dur-2) var(--ease-out);
}
.moment:hover { border-color: var(--line-strong); }
.moment.hidden { border-style: dashed; }

.m-head { display: flex; align-items: flex-start; gap: 12px; }
.m-avatar { flex-shrink: 0; border-radius: var(--r-full); }
.m-meta { flex: 1; min-width: 0; }
.m-name { display: block; max-width: 100%; font-size: 14px; font-weight: 600; color: var(--accent-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-name:hover { text-decoration: underline; }
.m-sub { margin-top: 3px; font-size: 11px; color: var(--ink-3); }
.m-visibility { color: var(--ink-4); }

.m-more { position: relative; }
.m-menu { position: absolute; top: 34px; right: 0; z-index: 6; min-width: 128px; padding: 5px; background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--r-sm); box-shadow: var(--shadow-pop); }
.m-menu-danger { display: flex; align-items: center; gap: 7px; width: 100%; padding: 8px 10px; border-radius: var(--r-xs); font-size: 13px; color: var(--danger); }
.m-menu-danger:hover { background: var(--danger-soft); }

.m-hidden { display: flex; align-items: center; gap: 6px; margin-top: 12px; padding: 8px 10px; border-radius: var(--r-xs); font-size: 12px; color: var(--warn); background: var(--surface-3); }

.m-content { display: block; width: 100%; margin-top: 12px; text-align: left; font-size: 15px; line-height: 1.6; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }

.m-actions { display: flex; gap: 6px; margin-top: 12px; }
.m-action { display: inline-flex; align-items: center; gap: 5px; min-height: 30px; padding: 0 10px; border-radius: var(--r-xs); font-size: 12px; color: var(--ink-3); transition: color var(--dur-1), background var(--dur-1); }
.m-action:hover { color: var(--ink); background: var(--surface-hover); }
.m-action.active { color: var(--danger); }

.m-thread { margin-top: 10px; padding: 10px 12px; border-radius: var(--r-sm); background: var(--surface-2); }
.m-likes { display: flex; align-items: baseline; gap: 6px; font-size: 12px; color: var(--accent-ink); }
.m-likes > svg { flex-shrink: 0; color: var(--danger); transform: translateY(1px); }
.m-likes-text { overflow-wrap: anywhere; }
.m-likes-more { color: var(--ink-3); font-size: 11px; }
.m-comments { margin: 6px 0 0; padding: 0; list-style: none; }
.m-likes + .m-comments { padding-top: 6px; border-top: 1px solid var(--line); }
.m-comments li { font-size: 13px; line-height: 1.65; color: var(--ink-2); overflow-wrap: anywhere; }
.m-comment-name { font-size: 13px; color: var(--accent-ink); }
.m-comment-name:hover { text-decoration: underline; }
.m-comment-text { color: var(--ink); }
.m-more-comments { margin-top: 6px; font-size: 12px; color: var(--accent); }
.m-more-comments:hover { text-decoration: underline; }
</style>
