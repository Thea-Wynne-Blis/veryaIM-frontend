<script setup lang="ts">
import { Heart, Loader2, MessageCircle, Reply } from 'lucide-vue-next'
import AppAvatar from '../AppAvatar.vue'
import { authorName, type MomentNotice } from '../../api/moments'
import type { Id } from '../../api/client'
import { initialsOf, relativeTime, toneOfPerson } from '../../utils/present'

/**
 * 互动通知列表：谁赞了、谁评论了、谁回复了。
 *
 * <p>通知只带摘要与 ID，点进去打开动态详情，避免通知里再冗余一份正文。</p>
 */
defineProps<{
  notices: MomentNotice[]
  loading: boolean
  hasMore: boolean
  unread: number
  selfId: Id
}>()

const emit = defineEmits<{
  (e: 'open', momentId: Id): void
  (e: 'more'): void
  (e: 'read-all'): void
}>()

const ICONS = { LIKE: Heart, COMMENT: MessageCircle, REPLY: Reply } as const

function iconOf(type: MomentNotice['type']) {
  return ICONS[type] ?? MessageCircle
}

function textOf(notice: MomentNotice): string {
  if (notice.type === 'LIKE') return '赞了你的动态'
  if (notice.type === 'REPLY') return '回复了你'
  return '评论了你的动态'
}

function toneOf(notice: MomentNotice): string {
  return toneOfPerson(notice.actor.userId)
}
</script>

<template>
  <div class="notices">
    <header class="notices-head">
      <p>{{ unread > 0 ? `${unread} 条未读` : '互动通知' }}</p>
      <button v-if="unread > 0" type="button" class="notices-read" @click="emit('read-all')">全部已读</button>
    </header>

    <p v-if="loading && !notices.length" class="notices-hint"><Loader2 :size="16" class="spin" />正在加载通知…</p>
    <p v-else-if="!notices.length" class="notices-hint">还没有互动，发一条动态试试。</p>

    <ul v-else class="notices-list">
      <li v-for="notice in notices" :key="String(notice.id)">
        <button type="button" class="notice" :class="{ unread: !notice.read }" @click="emit('open', notice.momentId)">
          <span class="notice-avatar">
            <AppAvatar :initials="initialsOf(authorName(notice.actor))" :tone="toneOf(notice)" size="sm" />
            <span class="notice-icon"><component :is="iconOf(notice.type)" :size="11" :stroke-width="2.2" /></span>
          </span>
          <span class="notice-body">
            <span class="notice-line">
              <strong>{{ authorName(notice.actor) }}</strong>
              <span class="notice-action">{{ textOf(notice) }}</span>
            </span>
            <span v-if="notice.momentPreview" class="notice-preview">{{ notice.momentPreview }}</span>
          </span>
          <span class="notice-side">
            <time :datetime="notice.createdAt">{{ relativeTime(notice.createdAt) }}</time>
            <span v-if="!notice.read" class="notice-dot" aria-label="未读" />
          </span>
        </button>
      </li>
    </ul>

    <button v-if="hasMore" type="button" class="notices-more" :disabled="loading" @click="emit('more')">
      <Loader2 v-if="loading" :size="14" class="spin" />加载更多
    </button>
    <slot />
  </div>
</template>

<style scoped>
.notices { display: flex; flex-direction: column; }
.notices-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 2px 12px; font-size: 12px; color: var(--ink-3); }
.notices-read { font-size: 12px; color: var(--accent); }
.notices-read:hover { text-decoration: underline; }
.notices-hint { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 40px 0; font-size: 13px; color: var(--ink-3); }
.notices-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.notice { display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 12px 14px; text-align: left; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface); transition: border-color var(--dur-2); }
.notice:hover { border-color: var(--line-strong); }
.notice.unread { border-color: var(--accent-soft-2); background: var(--accent-soft); }
.notice-avatar { position: relative; flex-shrink: 0; }
.notice-icon { position: absolute; right: -3px; bottom: -3px; display: grid; place-items: center; width: 17px; height: 17px; border-radius: 50%; color: #fff; background: var(--accent); border: 2px solid var(--surface); }
.notice-body { flex: 1; min-width: 0; }
.notice-line { display: flex; align-items: baseline; gap: 5px; font-size: 13px; }
.notice-line strong { font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
.notice-action { color: var(--ink-2); }
.notice-preview { display: block; margin-top: 4px; font-size: 12px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notice-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
.notice-side time { font-size: 11px; color: var(--ink-4); white-space: nowrap; }
.notice-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--unread); }
.notices-more { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; margin-top: 10px; border-radius: var(--r-xs); font-size: 12px; color: var(--accent); background: var(--surface-2); }
.spin { animation: tick-spin 900ms linear infinite; }
</style>
