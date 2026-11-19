<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  Bell,
  Camera,
  Check,
  ChevronDown,
  CircleAlert,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  UserRound,
  UsersRound,
  X,
} from 'lucide-vue-next'
import MomentCard from './MomentCard.vue'
import MomentComposer from './MomentComposer.vue'
import MomentDetailDialog from './MomentDetailDialog.vue'
import MomentLightbox from './MomentLightbox.vue'
import MomentNotices from './MomentNotices.vue'
import { momentsApi, type Moment } from '../../api/moments'
import { sameId, type Id } from '../../api/client'
import { useAuthStore } from '../../stores/auth'
import { useMomentsStore } from '../../stores/moments'
import { useToast } from '../../composables/useToast'
import { messageOf } from '../../utils/error'

/**
 * 朋友圈主页面：好友动态 / 我的动态 / 互动通知。
 *
 * <p>页面只负责编排：数据与写入全部在 store，卡片与弹窗各自独立，
 * 后续加「转发到朋友圈」「话题」等功能时不需要改动这里的主结构。</p>
 */
withDefaults(defineProps<{ mobile?: boolean }>(), { mobile: false })

const emit = defineEmits<{ (e: 'profile', userId: Id, anchor: HTMLElement): void }>()

type Tab = 'feed' | 'mine' | 'notices'

const auth = useAuthStore()
const moments = useMomentsStore()
const { message: notice, show: flash } = useToast()

const tab = ref<Tab>('feed')
const scrollArea = ref<HTMLElement | null>(null)
const composerOpen = ref(false)
const settingsOpen = ref(false)
const settingsDialog = ref<HTMLDialogElement | null>(null)
const detail = ref<Moment | null>(null)
const lightbox = ref<{ moment: Moment; index: number } | null>(null)
const refreshing = ref(false)
const savingSettings = ref(false)

const selfId = computed<Id>(() => auth.user?.userId ?? '')
const feedItems = computed(() => (tab.value === 'mine' ? moments.mine : moments.feed))
const loading = computed(() => (tab.value === 'mine' ? moments.mineLoading : moments.feedLoading))
const hasMore = computed(() => (tab.value === 'mine' ? moments.mineHasMore : moments.feedHasMore))
const dayOptions = computed(() => moments.settings?.supportedDays ?? [0, 3, 30, 180])

const tabs = computed(() => ([
  { key: 'feed' as const, label: '好友动态', icon: UsersRound, badge: 0 },
  { key: 'mine' as const, label: '我的动态', icon: UserRound, badge: 0 },
  { key: 'notices' as const, label: '互动通知', icon: Bell, badge: moments.unread },
]))

onMounted(() => {
  moments.listen()
  void moments.loadSettings()
  void moments.loadFeed(true)
})

function switchTab(next: Tab) {
  if (tab.value === next) return
  tab.value = next
  scrollArea.value?.scrollTo(0, 0)
  if (next === 'mine') void moments.loadMine(true)
  if (next === 'notices') void refreshNotices()
}

function navigateTabs(event: KeyboardEvent) {
  const items = tabs.value
  const current = items.findIndex((item) => item.key === tab.value)
  let index: number
  switch (event.key) {
    case 'ArrowLeft': index = (current + items.length - 1) % items.length; break
    case 'ArrowRight': index = (current + 1) % items.length; break
    case 'Home': index = 0; break
    case 'End': index = items.length - 1; break
    default: return
  }
  event.preventDefault()
  const next = items[index].key
  switchTab(next)
  const tablist = event.currentTarget as HTMLElement
  tablist.querySelector<HTMLButtonElement>('#moment-tab-' + next)?.focus()
}

async function refreshNotices() {
  if (moments.noticesLoading) return
  moments.error = ''
  // 先拿到列表再标记已读，避免旧数据读完后新列表仍保留未读圆点。
  await moments.loadNotices(true)
  if (!moments.error) await moments.readNotices().catch(() => {})
}

async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  const previousTop = moments.feed[0]?.id
  try {
    if (tab.value === 'notices') {
      await refreshNotices()
      return
    }
    await moments.loadFeed(true)
    if (tab.value === 'mine') await moments.loadMine(true)
    const top = moments.feed[0]
    if (top && previousTop && !sameId(top.id, previousTop)) flash('有新的动态')
  } finally {
    refreshing.value = false
  }
}

function loadMore() {
  if (tab.value === 'mine') void moments.loadMine()
  else void moments.loadFeed()
}

async function toggleLike(moment: Moment) {
  try {
    await moments.toggleLike(moment)
  } catch (e) {
    flash(messageOf(e, '操作失败，请重试'))
  }
}

async function removeMoment(moment: Moment) {
  if (!window.confirm('删除后无法恢复，确定删除这条动态？')) return
  try {
    await moments.remove(moment.id)
    if (detail.value && sameId(detail.value.id, moment.id)) detail.value = null
    flash('已删除')
  } catch (e) {
    flash(messageOf(e, '删除失败，请重试'))
  }
}

function openDetail(moment: Moment) {
  detail.value = moment
}

function openLightbox(moment: Moment, index: number) {
  lightbox.value = { moment, index }
}

async function openNoticeMoment(momentId: Id) {
  try {
    const moment = await momentsApi.detail(momentId)
    moments.replace(moment)
    detail.value = moments.find(momentId) ?? moment
  } catch (e) {
    flash(messageOf(e, '这条动态暂时无法查看'))
  }
}

async function openSettings() {
  settingsOpen.value = true
  if (!moments.settings) await moments.loadSettings()
  await nextTick()
  settingsDialog.value?.showModal()
}

async function pickDays(days: number) {
  if (savingSettings.value) return
  savingSettings.value = true
  try {
    await moments.updateSettings(days)
    flash('可见范围已更新')
  } catch (e) {
    flash(messageOf(e, '保存失败，请重试'))
  } finally {
    savingSettings.value = false
  }
}

function closeSettings() {
  settingsDialog.value?.close()
  settingsOpen.value = false
}

function onPublished() {
  composerOpen.value = false
  tab.value = 'feed'
  scrollArea.value?.scrollTo(0, 0)
}

function commentOf(moment: Moment) {
  openDetail(moment)
}

function openDetailLightbox(index: number) {
  if (detail.value) openLightbox(detail.value, index)
}

function dayLabel(days: number): string {
  if (days === 0) return '全部'
  if (days === 3) return '最近三天'
  if (days === 30) return '最近一个月'
  if (days === 180) return '最近半年'
  return `最近 ${days} 天`
}
</script>

<template>
  <section class="moments" :class="{ mobile }" aria-label="朋友圈">
    <header class="mv-header">
      <div class="mv-inner">
        <div class="mv-head">
          <h1>朋友圈</h1>
          <div class="mv-actions">
            <button type="button" class="mv-tool mv-refresh" aria-label="刷新" title="刷新" :disabled="refreshing" @click="refresh">
              <Loader2 v-if="refreshing" :size="16" class="spin" />
              <RefreshCw v-else :size="16" />
            </button>
            <button type="button" class="mv-tool mv-privacy" aria-label="可见范围设置" title="可见范围设置" @click="openSettings">
              <Shield :size="16" />
              <span class="mv-privacy-label">{{ moments.settings?.visibleDays ? dayLabel(moments.settings.visibleDays) : '可见范围' }}</span>
              <ChevronDown :size="13" class="mv-privacy-label" />
            </button>
            <button type="button" class="mv-publish" @click="composerOpen = true">
              <Plus :size="17" />发布动态
            </button>
          </div>
        </div>

        <div class="mv-tabs" role="tablist" aria-label="朋友圈视图" @keydown="navigateTabs">
          <button
            v-for="item in tabs"
            :id="'moment-tab-' + item.key"
            :key="item.key"
            type="button"
            role="tab"
            :aria-selected="tab === item.key"
            :aria-controls="tab === item.key ? 'moment-panel' : undefined"
            :tabindex="tab === item.key ? 0 : -1"
            @click="switchTab(item.key)"
          >
            <component :is="item.icon" :size="16" :stroke-width="1.75" aria-hidden="true" />
            {{ item.label }}
            <span v-if="item.badge" class="mv-badge num" :aria-label="item.badge + ' 条未读'">{{ item.badge > 99 ? '99+' : item.badge }}</span>
          </button>
        </div>
      </div>
    </header>

    <div id="moment-panel" ref="scrollArea" class="mv-scroll" :class="{ 'mv-feed': tab !== 'notices' }" role="tabpanel" :aria-labelledby="'moment-tab-' + tab" tabindex="0">
      <div class="mv-inner mv-container">
        <div v-if="moments.error" class="mv-error" role="alert">
          <CircleAlert :size="17" />
          <span>{{ moments.error }}</span>
          <button type="button" @click="refresh">重新加载</button>
        </div>

        <MomentNotices
          v-if="tab === 'notices'"
          v-show="!moments.error || moments.notices.length"
          :notices="moments.notices"
          :loading="moments.noticesLoading"
          :has-more="moments.noticeHasMore"
          :unread="moments.unread"
          :self-id="selfId"
          @open="openNoticeMoment"
          @more="moments.loadNotices()"
          @read-all="moments.readNotices().catch(() => {})"
        />

        <template v-else>
          <div v-if="loading && !feedItems.length" class="mv-list" role="status" aria-label="正在加载动态">
            <div v-for="i in 2" :key="i" class="mv-skeleton" aria-hidden="true">
              <span class="mv-skeleton-avatar" />
              <span class="mv-skeleton-name" />
              <span class="mv-skeleton-line" />
              <span class="mv-skeleton-line short" />
              <span class="mv-skeleton-time" />
            </div>
          </div>
          <div v-else-if="feedItems.length" class="mv-list">
            <MomentCard
              v-for="moment in feedItems"
              :key="String(moment.id)"
              :moment="moment"
              :self-id="selfId"
              @open="openDetail(moment)"
              @like="toggleLike(moment)"
              @comment="commentOf(moment)"
              @delete="removeMoment(moment)"
              @preview="(index) => openLightbox(moment, index)"
              @profile="(userId, anchor) => emit('profile', userId, anchor)"
            />
          </div>
          <div v-else-if="!moments.error" class="mv-empty">
            <span class="mv-empty-icon"><Camera :size="24" :stroke-width="1.7" /></span>
            <h2>{{ tab === 'mine' ? '你还没有发布动态' : '暂无好友动态' }}</h2>
            <p>{{ tab === 'mine' ? '发布过的动态会显示在这里。' : '好友发布的新动态会显示在这里。' }}</p>
          </div>
          <button v-if="hasMore && feedItems.length" type="button" class="mv-more" :disabled="loading" @click="loadMore">
            <Loader2 v-if="loading" :size="14" class="spin" />加载更多
          </button>
        </template>
      </div>
    </div>

    <p v-if="notice" class="mv-notice" role="status">{{ notice }}</p>

    <MomentComposer v-if="composerOpen" @close="composerOpen = false" @published="onPublished" />

    <MomentDetailDialog
      v-if="detail"
      :moment="detail"
      :self-id="selfId"
      @close="detail = null"
      @like="toggleLike(detail)"
      @delete="removeMoment(detail)"
      @preview="openDetailLightbox"
      @profile="(userId, anchor) => emit('profile', userId, anchor)"
    />

    <MomentLightbox
      v-if="lightbox"
      :moment-id="lightbox.moment.id"
      :media="lightbox.moment.media"
      :start-index="lightbox.index"
      @close="lightbox = null"
    />

    <dialog
      v-if="settingsOpen"
      ref="settingsDialog"
      class="mv-settings"
      aria-labelledby="moment-settings-title"
      @cancel.prevent="closeSettings"
      @click.self="closeSettings"
    >
      <section>
        <header>
          <h2 id="moment-settings-title">朋友圈可见范围</h2>
          <button type="button" class="icon-btn" aria-label="关闭" @click="closeSettings"><X :size="18" /></button>
        </header>
        <p class="mv-settings-hint">设置好友可以查看多久以内的动态。</p>
        <div class="mv-settings-options">
          <button
            v-for="days in dayOptions"
            :key="days"
            type="button"
            :class="{ active: moments.settings?.visibleDays === days }"
            :aria-pressed="moments.settings?.visibleDays === days"
            :disabled="savingSettings"
            @click="pickDays(days)"
          >
            {{ dayLabel(days) }}
            <Check v-if="moments.settings?.visibleDays === days" :size="16" />
          </button>
        </div>
      </section>
    </dialog>
  </section>
</template>

<style scoped>
.moments {
  --mv-gutter: 28px;
  --mv-avatar-size: 42px;
  --mv-post-gap: 12px;
  --mv-muted: color-mix(in srgb, var(--ink-2) 75%, var(--ink-3));
  --mv-link: color-mix(in srgb, var(--info) 73%, var(--ink-2));
  --mv-primary: var(--accent-ink);
  --mv-primary-hover: color-mix(in srgb, var(--accent-ink) 78%, var(--accent));
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--canvas);
}

.mv-inner {
  width: 100%;
  max-width: 716px;
  margin-inline: auto;
  padding-inline: var(--mv-gutter);
}

.mv-header {
  flex: none;
  padding: 24px 0 16px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
}

.mv-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.mv-head h1 { font-size: 30px; font-weight: 680; line-height: 1.2; letter-spacing: -.045em; }
.mv-actions { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
.mv-tool,
.mv-publish {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  font-size: 13px;
  line-height: 1.3;
  white-space: nowrap;
  transition: background var(--dur-1), border-color var(--dur-1), color var(--dur-1);
}
.mv-tool { color: var(--ink-2); background: var(--surface); box-shadow: var(--shadow-xs); }
.mv-tool:hover:not(:disabled) { color: var(--ink); border-color: var(--line-strong); background: var(--surface-2); }
.mv-tool:disabled { cursor: wait; }
.mv-refresh { min-width: 38px; padding: 0; }
.mv-publish { padding-inline: 13px; border-color: transparent; font-weight: 600; color: var(--surface); background: var(--mv-primary); }
.mv-publish:hover { background: var(--mv-primary-hover); }

.mv-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px;
  width: min(100%, 408px);
  margin-top: 18px;
  padding: 3px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  background: var(--surface-3);
}
.mv-tabs > button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 34px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 550;
  white-space: nowrap;
}
.mv-tabs > button:hover { color: var(--ink); background: var(--surface-hover); }
.mv-tabs > button[aria-selected='true'] { color: var(--accent-ink); border-color: var(--line); background: var(--surface); box-shadow: var(--shadow-xs); }
.mv-tabs svg { flex-shrink: 0; }
.mv-badge {
  min-width: 18px;
  padding: 0 4px;
  border-radius: var(--r-full);
  font-size: 10px;
  line-height: 18px;
  text-align: center;
  color: var(--danger);
  background: var(--danger-soft);
}

.mv-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable both-edges; }
.mv-feed { --mv-panel-top: 2px; background: var(--surface); }
.mv-scroll:focus-visible { outline-offset: -2px; }
.mv-container { padding-block: var(--mv-panel-top, 20px) 40px; }
.mv-error {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 14px;
  margin-bottom: 14px;
  border: 1px solid color-mix(in srgb, var(--danger) 22%, var(--line));
  border-radius: var(--r-md);
  font-size: 13px;
  color: var(--ink);
  background: var(--danger-soft);
}
.mv-error svg { color: var(--danger); flex-shrink: 0; }
.mv-error span { flex: 1; overflow-wrap: anywhere; }
.mv-error button { flex-shrink: 0; text-decoration: underline; text-underline-offset: 3px; }
.mv-notice {
  position: absolute;
  z-index: 8;
  left: 50%;
  bottom: 18px;
  width: max-content;
  max-width: calc(100% - 32px);
  padding: 9px 15px;
  transform: translateX(-50%);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-md);
  color: var(--ink);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  font-size: 13px;
  pointer-events: none;
}
.mv-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 20px;
  margin: 16px auto 0;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  color: var(--ink-2);
  background: var(--surface);
  font-size: 13px;
}
.mv-more:hover:not(:disabled) { color: var(--ink); border-color: var(--line-strong); }

.mv-empty { display: grid; justify-items: center; gap: 6px; padding: 56px 16px; text-align: center; }
.mv-empty-icon { display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: 7px; border-radius: var(--r-md); color: var(--accent-ink); background: var(--accent-soft); }
.mv-empty h2 { font-size: 16px; font-weight: 650; }
.mv-empty p { font-size: 13px; color: var(--mv-muted); }

.mv-skeleton { display: grid; grid-template-columns: var(--mv-avatar-size) minmax(0, 1fr); align-items: start; gap: 9px var(--mv-post-gap); padding-block: 22px 18px; }
.mv-skeleton + .mv-skeleton { border-top: 1px solid var(--line); }
.mv-skeleton span { display: block; border-radius: var(--r-full); background: var(--surface-3); }
.mv-skeleton .mv-skeleton-avatar { grid-row: span 4; width: var(--mv-avatar-size); height: var(--mv-avatar-size); border-radius: var(--r-xs); }
.mv-skeleton-name { width: 96px; height: 12px; }
.mv-skeleton-line { width: 76%; height: 12px; }
.mv-skeleton-line.short { width: 52%; }
.mv-skeleton-time { width: 60px; height: 9px; margin-top: 4px; }

.mv-settings { width: min(420px, calc(100vw - 32px)); max-width: none; padding: 0; margin: auto; border: 1px solid var(--line-strong); border-radius: var(--r-lg); color: var(--ink); background: var(--surface); box-shadow: var(--shadow-lg); }
.mv-settings::backdrop { background: #101b245c; backdrop-filter: blur(3px); }
.mv-settings > section { padding: 20px; }
.mv-settings header { display: flex; align-items: center; gap: 12px; }
.mv-settings header h2 { flex: 1; font-size: 17px; font-weight: 650; }
.mv-settings-hint { margin-top: 3px; font-size: 13px; color: var(--mv-muted); }
.mv-settings-options { margin-top: 16px; border: 1px solid var(--line); border-radius: var(--r-md); }
.mv-settings-options button { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; padding: 0 13px; text-align: left; font-size: 13px; color: var(--ink-2); }
.mv-settings-options button:first-child { border-radius: var(--r-md) var(--r-md) 0 0; }
.mv-settings-options button:last-child { border-radius: 0 0 var(--r-md) var(--r-md); }
.mv-settings-options button:only-child { border-radius: var(--r-md); }
.mv-settings-options button + button { border-top: 1px solid var(--line); }
.mv-settings-options button:hover:not(:disabled) { background: var(--surface-hover); }
.mv-settings-options button.active { color: var(--accent-ink); background: var(--accent-soft); font-weight: 600; }

.spin { animation: tick-spin 900ms linear infinite; }

.moments.mobile { --mv-gutter: 14px; --mv-avatar-size: 38px; --mv-post-gap: 9px; }
.mobile .mv-header { padding-block: 12px; }
.mobile .mv-head { gap: 8px; }
.mobile .mv-head h1 { font-size: 25px; }
.mobile .mv-actions { gap: 5px; }
.mobile .mv-tool,
.mobile .mv-publish { min-height: 44px; }
.mobile .mv-tool { width: 44px; padding: 0; }
.mobile .mv-publish { padding-inline: 10px; }
.mobile .mv-privacy-label { display: none; }
.mobile .mv-tabs { width: 100%; margin-top: 12px; }
.mobile .mv-tabs > button { gap: 5px; min-height: 40px; padding-inline: 4px; }
.mobile .mv-scroll { scrollbar-gutter: auto; }
.mobile .mv-container { padding-block: var(--mv-panel-top, 12px) 28px; }
.mobile .mv-skeleton { padding-block: 17px 13px; }
.mobile .mv-empty { padding-block: 42px; }
.mobile .mv-settings { width: 100vw; margin: auto auto 0; border-radius: var(--r-lg) var(--r-lg) 0 0; }
.mobile .mv-settings > section { padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)); }

@media (max-width: 370px) {
  .mobile .mv-tabs > button > svg { display: none; }
}
</style>
