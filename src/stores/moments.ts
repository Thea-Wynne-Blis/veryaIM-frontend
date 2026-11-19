import { defineStore } from 'pinia'
import { sameId, type Id } from '../api/client'
import { messageOf } from '../utils/error'
import {
  momentsApi,
  type Moment,
  type MomentComment,
  type MomentNotice,
  type MomentSettings,
  type PublishMomentPayload,
} from '../api/moments'

type RealtimeMomentEvent = {
  eventType: number
  momentId: string
  actorId: string
  commentId: string | null
  at: number
}

/** 实时事件里只有 ID，没有正文；通知正文等打开列表时再拉。 */
const MOMENT_EVENT = 'veryal:moment'

/**
 * 雪花 ID 是 18 位十进制，超过 Number.MAX_SAFE_INTEGER，
 * 因此按字符串比较：先比长度，再比字典序。
 */
function newerId(current: Id, previous: Id): boolean {
  const left = String(current)
  const right = String(previous)
  return left.length === right.length ? left > right : left.length > right.length
}

/**
 * 朋友圈状态。
 *
 * <p>信息流是拉模式：好友/拉黑/可见范围变更立即生效，本 store 不做任何
 * 本地 fanout 缓存，只在收到互动通知时刷新未读数。</p>
 */
export const useMomentsStore = defineStore('moments', {
  state: () => ({
    feed: [] as Moment[],
    feedCursor: null as string | null,
    feedHasMore: false,
    feedLoading: false,
    feedLoaded: false,

    mine: [] as Moment[],
    mineCursor: null as string | null,
    mineHasMore: false,
    mineLoading: false,
    mineLoaded: false,

    notices: [] as MomentNotice[],
    noticeCursor: null as string | null,
    noticeHasMore: false,
    noticesLoading: false,
    noticesLoaded: false,

    settings: null as MomentSettings | null,
    unread: 0,
    error: '',
    /** 已订阅实时事件，避免重复注册 */
    listening: false,
  }),

  actions: {
    /* ---------- 信息流 ---------- */

    async loadFeed(reset = false) {
      if (this.feedLoading) return
      if (!reset && !this.feedHasMore && this.feedLoaded) return
      this.feedLoading = true
      if (reset) {
        this.feedLoaded = false
        this.error = ''
      }
      try {
        const page = await momentsApi.feed(reset ? null : this.feedCursor)
        this.feed = reset ? page.items : [...this.feed, ...page.items]
        this.feedCursor = page.nextCursor
        this.feedHasMore = page.hasMore
        this.feedLoaded = true
        if (reset && page.items[0]) this.markFeedRead(page.items[0].id)
      } catch (e) {
        this.error = messageOf(e, '加载朋友圈失败')
      } finally {
        this.feedLoading = false
      }
    },

    async loadMine(reset = false) {
      if (this.mineLoading) return
      if (!reset && !this.mineHasMore && this.mineLoaded) return
      this.mineLoading = true
      try {
        const page = await momentsApi.mine(reset ? null : this.mineCursor)
        this.mine = reset ? page.items : [...this.mine, ...page.items]
        this.mineCursor = page.nextCursor
        this.mineHasMore = page.hasMore
        this.mineLoaded = true
      } catch (e) {
        this.error = messageOf(e, '加载我的动态失败')
      } finally {
        this.mineLoading = false
      }
    },

    /**
     * 已读位置只向前推进：首条动态已经比已读新，才需要上报。
     * 用 fire-and-forget，失败不影响浏览。
     */
    markFeedRead(momentId: Id) {
      const lastRead = this.settings?.lastReadMomentId
      if (lastRead != null && !newerId(momentId, lastRead)) return
      if (this.settings) this.settings.lastReadMomentId = momentId
      void momentsApi.markFeedRead(momentId).catch(() => {})
    },

    /* ---------- 发布与删除 ---------- */

    async publish(payload: PublishMomentPayload): Promise<Moment> {
      const moment = await momentsApi.publish(payload)
      this.feed = [moment, ...this.feed]
      this.mine = [moment, ...this.mine]
      return moment
    },

    async remove(momentId: Id) {
      await momentsApi.remove(momentId)
      this.feed = this.feed.filter((item) => !sameId(item.id, momentId))
      this.mine = this.mine.filter((item) => !sameId(item.id, momentId))
    },

    /* ---------- 互动 ---------- */

    async toggleLike(moment: Moment) {
      const liked = !moment.liked
      const before = { liked: moment.liked, likeCount: moment.likeCount }
      // 先本地翻转，请求失败再回滚：点赞必须即时反馈。
      moment.liked = liked
      moment.likeCount = Math.max(0, moment.likeCount + (liked ? 1 : -1))
      try {
        const updated = await momentsApi.like(moment.id, liked)
        this.replace({ ...updated, comments: moment.comments })
      } catch (e) {
        moment.liked = before.liked
        moment.likeCount = before.likeCount
        throw e
      }
    },

    async addComment(momentId: Id, content: string, replyToCommentId?: Id | null) {
      const comment = await momentsApi.comment(momentId, content, replyToCommentId)
      const moment = this.find(momentId)
      if (moment) {
        moment.comments = [...moment.comments, comment]
        moment.commentCount += 1
      }
      return comment
    },

    async deleteComment(momentId: Id, comment: MomentComment) {
      await momentsApi.deleteComment(comment.id)
      const moment = this.find(momentId)
      if (!moment) return
      moment.comments = moment.comments.filter((item) => !sameId(item.id, comment.id))
      moment.commentCount = Math.max(0, moment.commentCount - 1)
    },

    /** 用服务端返回的最新状态覆盖同一条动态（保留更长的一组评论预览）。 */
    replace(updated: Moment) {
      for (const list of [this.feed, this.mine]) {
        const index = list.findIndex((item) => sameId(item.id, updated.id))
        if (index < 0) continue
        const current = list[index]!
        list[index] = {
          ...updated,
          comments: updated.comments.length >= current.comments.length
            ? updated.comments : current.comments,
        }
      }
    },

    find(momentId: Id): Moment | undefined {
      return this.feed.find((item) => sameId(item.id, momentId))
        ?? this.mine.find((item) => sameId(item.id, momentId))
    },

    /* ---------- 通知 ---------- */

    async loadNotices(reset = false) {
      if (this.noticesLoading) return
      this.noticesLoading = true
      try {
        const page = await momentsApi.notices(reset ? null : this.noticeCursor)
        this.notices = reset ? page.items : [...this.notices, ...page.items]
        this.noticeCursor = page.nextCursor
        this.noticeHasMore = page.hasMore
        this.noticesLoaded = true
      } catch (e) {
        this.error = messageOf(e, '加载互动通知失败')
      } finally {
        this.noticesLoading = false
      }
    },

    async loadUnread() {
      try {
        const value = await momentsApi.unreadNotices()
        this.unread = Number(value) || 0
      } catch {
        /* 红点是辅助信息，失败不打扰用户 */
      }
    },

    async readNotices() {
      if (this.unread === 0) return
      await momentsApi.readNotices()
      this.unread = 0
      this.notices = this.notices.map((item) => ({ ...item, read: true }))
    },

    /* ---------- 设置 ---------- */

    async loadSettings() {
      try {
        this.settings = await momentsApi.settings()
      } catch {
        this.settings = null
      }
    },

    async updateSettings(visibleDays: number) {
      this.settings = await momentsApi.updateSettings(visibleDays)
    },

    /* ---------- 实时 ---------- */

    /**
     * 订阅朋友圈互动推送。
     *
     * <p>实时模块只负责把 `moment` 帧转成窗口事件，store 在这里消费，
     * 两边互不依赖，其它页面也能复用同一个事件。</p>
     */
    listen() {
      if (this.listening) return
      this.listening = true
      window.addEventListener(MOMENT_EVENT, this.onRealtime as EventListener)
      void this.loadUnread()
    },

    stopListening() {
      if (!this.listening) return
      this.listening = false
      window.removeEventListener(MOMENT_EVENT, this.onRealtime as EventListener)
    },

    onRealtime(event: Event) {
      const payload = (event as CustomEvent<RealtimeMomentEvent>).detail
      if (!payload) return
      this.unread += 1
      if (this.noticesLoaded) {
        this.notices = this.notices.map((item) => ({ ...item }))
        void this.loadNotices(true)
      }
    },

    reset() {
      this.stopListening()
      this.$reset()
    },
  },
})
