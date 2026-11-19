<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  Bell,
  ImagePlus,
  Loader2,
  RefreshCw,
  Settings2,
  Sparkles,
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
  { key: 'feed' as const, label: '好友动态', badge: 0 },
  { key: 'mine' as const, label: '我的动态', badge: 0 },
  { key: 'notices' as const, label: '互动通知', badge: moments.unread },
]))

onMounted(() => {
  moments.listen()
  void moments.loadSettings()
  void moments.loadFeed(true)
})

function switchTab(next: Tab) {
  tab.value = next
  if (next === 'mine') void moments.loadMine(true)
  if (next === 'notices') {
    // 先拿到列表再标记已读：否则标记只作用在旧数据上，未读圆点会残留。
    void moments.loadNotices(true).then(() => moments.readNotices()).catch(() => {})
  }
}

async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  const previousTop = moments.feed[0]?.id
  try {
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
    <header class="mv-head">
      <div class="mv-heading">
        <h1>朋友圈</h1>
        <p>好友的最新动态 · {{ moments.unread > 0 ? `${moments.unread} 条新互动` : '与你分享生活' }}</p>
      </div>
      <div class="mv-actions">
        <button type="button" class="icon-btn" aria-label="刷新" :disabled="refreshing" @click="refresh">
          <Loader2 v-if="refreshing" :size="18" class="spin" />
          <RefreshCw v-else :size="18" :stroke-width="1.7" />
        </button>
        <button type="button" class="icon-btn" aria-label="可见范围设置" @click="openSettings">
          <Settings2 :size="18" :stroke-width="1.7" />
        </button>
        <button type="button" class="mv-publish" @click="composerOpen = true">
          <ImagePlus :size="16" :stroke-width="1.9" />发布
        </button>
      </div>
    </header>

    <div class="mv-tabs" role="tablist" aria-label="朋友圈视图">
      <button
        v-for="item in tabs"
        :key="item.key"
        type="button"
        role="tab"
        :aria-selected="tab === item.key"
        :class="{ active: tab === item.key }"
        @click="switchTab(item.key)"
      >
        {{ item.label }}
        <span v-if="item.badge" class="mv-badge num">{{ item.badge > 99 ? '99+' : item.badge }}</span>
      </button>
      <span class="mv-visible-range">
        <Bell :size="13" />
        {{ dayLabel(moments.settings?.visibleDays ?? 0) }} · 好友可见
      </span>
    </div>

    <div class="mv-scroll">
      <div class="mv-container">
        <div v-if="moments.error" class="mv-error" role="alert">
          <span>{{ moments.error }}</span>
          <button type="button" @click="refresh">重新加载</button>
        </div>
        <p v-if="notice" class="mv-notice" role="status">{{ notice }}</p>

        <MomentNotices
          v-if="tab === 'notices'"
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
          <div v-if="loading && !feedItems.length" class="mv-list" aria-label="正在加载动态">
            <div v-for="i in 2" :key="i" class="mv-skeleton"><span /><span /><span /></div>
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
          <div v-else-if="!loading" class="mv-empty">
            <span class="mv-empty-icon"><Sparkles :size="28" :stroke-width="1.3" /></span>
            <h2>{{ tab === 'mine' ? '你还没有发过动态' : '这里还很安静' }}</h2>
            <p>{{ tab === 'mine' ? '记录一下此刻的想法，只有你能看到私密动态。' : '发一条动态，或邀请好友一起加入。' }}</p>
            <button type="button" class="mv-empty-action" @click="composerOpen = true">发布第一条动态</button>
          </div>
          <button v-if="hasMore && feedItems.length" type="button" class="mv-more" :disabled="loading" @click="loadMore">
            <Loader2 v-if="loading" :size="14" class="spin" />加载更多
          </button>
        </template>
      </div>
    </div>

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
        <p class="mv-settings-hint">超过所选时间的动态，好友将看不到；你自己随时可以翻看。</p>
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
          </button>
        </div>
      </section>
    </dialog>
  </section>
</template>

<style scoped>
.moments { display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; background: var(--canvas); overflow: hidden; }
.mv-head { display: flex; align-items: center; gap: 16px; padding: 26px 32px 18px; background: var(--surface); }
.mv-heading { flex: 1; min-width: 0; }
.mv-heading h1 { font-size: 24px; font-weight: 650; letter-spacing: -.6px; }
.mv-heading p { margin-top: 5px; font-size: 12px; color: var(--ink-3); }
.mv-actions { display: flex; align-items: center; gap: 6px; }
.mv-actions .icon-btn { width: 38px; height: 38px; color: var(--ink-3); }
.mv-publish { display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 0 16px; margin-left: 4px; border-radius: var(--r-xs); font-size: 13px; font-weight: 550; color: #fff; background: var(--accent); }
.mv-publish:hover { background: var(--accent-hover); }

.mv-tabs { display: flex; align-items: center; gap: 22px; padding: 0 32px; border-bottom: 1px solid var(--line); background: var(--surface); }
.mv-tabs > button { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 12px 0 13px; border-bottom: 2px solid transparent; font-size: 13px; color: var(--ink-3); }
.mv-tabs > button.active { color: var(--accent); border-color: var(--accent); font-weight: 600; }
.mv-badge { min-width: 17px; height: 17px; padding: 0 5px; border-radius: var(--r-full); font-size: 10px; line-height: 17px; text-align: center; color: #fff; background: var(--unread); }
.mv-visible-range { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; font-size: 11px; color: var(--ink-4); }

.mv-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.mv-container { max-width: 720px; margin: 0 auto; padding: 20px 24px 48px; }
.mv-list { display: flex; flex-direction: column; gap: 14px; }
.mv-error { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; margin-bottom: 14px; border-radius: var(--r-xs); font-size: 12px; color: var(--danger); background: var(--danger-soft); }
.mv-error button { text-decoration: underline; }
.mv-notice { padding: 10px 12px; margin-bottom: 14px; border-radius: var(--r-xs); font-size: 12px; color: var(--accent-ink); background: var(--accent-soft); }
.mv-more { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; min-height: 40px; margin-top: 14px; border-radius: var(--r-sm); font-size: 12px; color: var(--accent); background: var(--surface); border: 1px solid var(--line); }
.mv-more:hover { border-color: var(--accent); }

.mv-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 72px 16px; text-align: center; }
.mv-empty-icon { display: grid; place-items: center; width: 64px; height: 64px; margin-bottom: 6px; border-radius: 20px; color: var(--accent); background: var(--accent-soft); }
.mv-empty h2 { font-size: 17px; font-weight: 600; }
.mv-empty p { max-width: 320px; font-size: 13px; line-height: 1.7; color: var(--ink-3); }
.mv-empty-action { padding: 9px 16px; margin-top: 4px; border-radius: var(--r-xs); font-size: 13px; color: var(--accent); background: var(--accent-soft); }
.mv-empty-action:hover { background: var(--accent-soft-2); }

.mv-skeleton { display: flex; flex-direction: column; gap: 14px; padding: 20px; height: 180px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); }
.mv-skeleton span { height: 12px; border-radius: 4px; background: var(--surface-3); }
.mv-skeleton span:first-child { width: 32%; height: 16px; }
.mv-skeleton span:last-child { width: 72%; }

.mv-settings { width: min(420px, calc(100vw - 40px)); max-width: none; padding: 0; margin: auto; border: 1px solid var(--line-strong); border-radius: var(--r-md); color: var(--ink); background: var(--surface); box-shadow: var(--shadow-lg); }
.mv-settings::backdrop { background: #101b2445; backdrop-filter: blur(2px); }
.mv-settings > section { padding: 18px 20px 20px; }
.mv-settings header { display: flex; align-items: center; gap: 12px; }
.mv-settings header h2 { flex: 1; font-size: 15px; font-weight: 600; }
.mv-settings-hint { margin-top: 10px; font-size: 12px; line-height: 1.7; color: var(--ink-3); }
.mv-settings-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
.mv-settings-options button { min-height: 38px; border: 1px solid var(--line); border-radius: var(--r-xs); font-size: 13px; color: var(--ink-2); background: var(--surface-2); }
.mv-settings-options button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.mv-settings-options button.active { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-soft); font-weight: 550; }

.spin { animation: tick-spin 900ms linear infinite; }

@media (max-width: 768px) {
  .mv-head { padding: 12px 16px 10px; gap: 8px; }
  .mv-heading h1 { font-size: 20px; }
  .mv-heading p { font-size: 11px; margin-top: 2px; }
  .mv-actions .icon-btn { width: 44px; height: 44px; }
  .mv-actions .icon-btn[aria-label='刷新'] { display: none; }
  .mv-publish { min-height: 40px; padding: 0 12px; }
  .mv-tabs { gap: 18px; padding: 0 16px; overflow-x: auto; scrollbar-width: none; }
  .mv-tabs > button { min-height: 48px; padding: 0; font-size: 14px; }
  .mv-visible-range { display: none; }
  .mv-container { padding: 14px 12px 32px; }
  .mv-list { gap: 10px; }
  .mv-settings { width: 100vw; margin: auto auto 0; border-radius: var(--r-md) var(--r-md) 0 0; }
  .mv-settings-options button { min-height: 44px; font-size: 14px; }
}
</style>
