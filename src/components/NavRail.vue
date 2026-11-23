<script setup lang="ts">
import {
  MessageCircle,
  Users,
  Star,
  MessagesSquare,
  Camera,
  NotebookPen,
  Github,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { useAuthStore } from '../stores/auth'
import { initialsOf } from '../utils/present'
import { userAvatarSrc } from '../utils/avatar'

type ViewKey = 'chat' | 'contacts' | 'moments' | 'favorites' | 'notes' | 'me'

const props = withDefaults(defineProps<{ unread: number; momentUnread?: number }>(), {
  momentUnread: 0,
})
const emit = defineEmits<{
  (e: 'navigate', view: ViewKey): void
}>()

const auth = useAuthStore()

const nav = [
  { key: 'chat', icon: MessageCircle, label: '消息' },
  { key: 'contacts', icon: Users, label: '通讯录' },
  { key: 'moments', icon: Camera, label: '朋友圈' },
  { key: 'notes', icon: NotebookPen, label: '笔记' },
  { key: 'favorites', icon: Star, label: '收藏' },
] as const

const active = defineModel<string>('active', { default: 'chat' })

function go(view: ViewKey) {
  active.value = view
  emit('navigate', view)
}

/** 聊天未读与朋友圈互动未读共用同一个角标位置。 */
function badgeOf(key: string): number {
  if (key === 'chat') return props.unread ?? 0
  if (key === 'moments') return props.momentUnread ?? 0
  return 0
}
</script>

<template>
  <aside class="rail">
    <button class="rail-brand tip" data-tip="VERYAL" aria-label="VERYAL 消息首页" @click="go('chat')">
      <span class="brand-mark"><MessagesSquare :size="19" :stroke-width="2" aria-hidden="true" /></span>
      <span class="rail-copy rail-wordmark">VERYAL</span>
    </button>

    <nav class="rail-nav" aria-label="主导航">
      <button
        v-for="item in nav"
        :key="item.key"
        class="rail-item tip"
        :class="{ active: active === item.key }"
        :data-tip="item.label"
        :aria-label="item.label"
        :aria-current="active === item.key ? 'page' : undefined"
        @click="go(item.key)"
      >
        <component :is="item.icon" :size="18" :stroke-width="1.85" aria-hidden="true" />
        <span class="rail-copy">{{ item.label }}</span>
        <span v-if="badgeOf(item.key) > 0" class="rail-badge num">
          {{ badgeOf(item.key) > 99 ? '99+' : badgeOf(item.key) }}
        </span>
      </button>
    </nav>

    <div class="rail-spacer" />

    <!-- 仓库入口：点一下直接去 GitHub -->
    <a
      class="rail-github tip"
      data-tip="GitHub 仓库"
      aria-label="打开项目 GitHub 仓库"
      href="https://github.com/Thea-Wynne-Blis/veryaIM"
      target="_blank"
      rel="noopener noreferrer"
    >
      <Github :size="18" :stroke-width="1.85" aria-hidden="true" />
    </a>

    <button
      class="rail-avatar tip"
      :class="{ active: active === 'me' }"
      :data-tip="auth.user?.nickname || '我的'"
      aria-label="我的"
      :aria-current="active === 'me' ? 'page' : undefined"
      @click="go('me')"
    >
      <AppAvatar
        :initials="initialsOf(auth.user?.nickname || '我')"
        :src="auth.user?.avatar || userAvatarSrc(auth.user?.userId)"
        tone="jade"
        size="sm"
      />
      <span class="rail-copy">我的</span>
    </button>
  </aside>
</template>
