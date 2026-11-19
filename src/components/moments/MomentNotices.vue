<script setup lang="ts">
import { Bell, CheckCheck, ChevronRight, Heart, Loader2, MessageCircle, Reply } from 'lucide-vue-next'
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
    <header v-if="notices.length || unread" class="notices-head">
      <h2>{{ unread > 0 ? `${unread} 条未读` : '互动记录' }}</h2>
      <button v-if="unread > 0" type="button" class="notices-read" @click="emit('read-all')">
        <CheckCheck :size="16" />全部已读
      </button>
    </header>

    <p v-if="loading && !notices.length" class="notices-hint" role="status"><Loader2 :size="16" class="spin" />正在加载通知…</p>
    <div v-else-if="!notices.length" class="notices-empty">
      <span class="notices-empty-icon"><Bell :size="24" :stroke-width="1.7" /></span>
      <h2>暂无互动通知</h2>
      <p>收到的点赞、评论和回复会显示在这里。</p>
    </div>

    <ul v-else class="notices-list">
      <li v-for="notice in notices" :key="String(notice.id)">
        <button type="button" class="notice" :class="{ unread: !notice.read }" @click="emit('open', notice.momentId)">
          <span class="notice-avatar">
            <AppAvatar :initials="initialsOf(authorName(notice.actor))" :tone="toneOf(notice)" size="sm" />
            <span class="notice-icon" :class="'type-' + notice.type.toLowerCase()" aria-hidden="true">
              <component :is="iconOf(notice.type)" :size="11" :stroke-width="2.2" />
            </span>
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
          <ChevronRight :size="15" class="notice-chevron" aria-hidden="true" />
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
.notices-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 2px 10px; }
.notices-head h2 { font-size: 14px; font-weight: 650; }
.notices-read { display: inline-flex; align-items: center; gap: 5px; min-height: 34px; padding: 0 8px; border-radius: var(--r-sm); font-size: 13px; color: var(--accent-ink); }
.notices-read:hover { background: var(--accent-soft); }
.notices-hint,
.notices-empty,
.notices-list { border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--shadow-xs); }
.notices-hint { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 40px 0; font-size: 13px; color: var(--mv-muted); }
.notices-empty { display: grid; justify-items: center; gap: 6px; padding: 56px 16px; text-align: center; }
.notices-empty-icon { display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: 7px; border-radius: var(--r-md); color: var(--accent-ink); background: var(--accent-soft); }
.notices-empty h2 { font-size: 16px; font-weight: 650; }
.notices-empty p { font-size: 13px; color: var(--mv-muted); }
.notices-list li + li { border-top: 1px solid var(--line); }
.notices-list li:first-child .notice { border-radius: var(--r-lg) var(--r-lg) 0 0; }
.notices-list li:last-child .notice { border-radius: 0 0 var(--r-lg) var(--r-lg); }
.notices-list li:only-child .notice { border-radius: var(--r-lg); }
.notice { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 66px; padding: 12px 15px; text-align: left; transition: background var(--dur-1); }
.notice.unread { background: color-mix(in srgb, var(--accent-soft) 42%, var(--surface)); }
.notice:hover { background: var(--surface-hover); }
.notice:focus-visible { outline-offset: -2px; }
.notice-avatar { position: relative; flex-shrink: 0; }
.notice-icon { position: absolute; right: -4px; bottom: -3px; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; color: var(--accent-ink); background: var(--accent-soft); border: 2px solid var(--surface); }
.notice-icon.type-like { color: var(--danger); background: var(--danger-soft); }
.notice-icon.type-reply { color: var(--info); background: var(--surface-3); }
.notice-body { flex: 1; min-width: 0; }
.notice-line { display: block; font-size: 13px; overflow-wrap: anywhere; }
.notice-line strong { font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
.notice-action { margin-inline-start: 4px; color: var(--ink-2); }
.notice-preview { display: block; margin-top: 3px; font-size: 12px; color: var(--mv-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notice-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
.notice-side time { font-size: 11px; color: var(--mv-muted); white-space: nowrap; }
.notice-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--unread); }
.notice-chevron { flex-shrink: 0; color: var(--mv-muted); }
.notices-more { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; margin: 16px auto 0; padding: 0 20px; border: 1px solid var(--line); border-radius: var(--r-sm); font-size: 13px; color: var(--ink-2); background: var(--surface); }
.notices-more:hover:not(:disabled) { color: var(--ink); border-color: var(--line-strong); }
.spin { animation: tick-spin 900ms linear infinite; }

@media (max-width: 768px) {
  .notices-empty { padding-block: 42px; }
  .notice { gap: 10px; padding-inline: 12px; }
  .notice-chevron { display: none; }
}
</style>
