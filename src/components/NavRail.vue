<script setup lang="ts">
import {
  MessageCircle,
  Users,
  Star,
  Settings,
  Camera,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { useAuthStore } from '../stores/auth'
import { initialsOf } from '../utils/present'

type ViewKey = 'chat' | 'contacts' | 'moments' | 'favorites' | 'me'

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
    <button class="rail-brand tip" data-tip="VERYAL" aria-label="VERYAL">V</button>

    <nav class="rail-nav">
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
        <component :is="item.icon" :size="19" :stroke-width="1.85" />
        <span v-if="badgeOf(item.key) > 0" class="rail-badge num">
          {{ badgeOf(item.key) > 99 ? '99+' : badgeOf(item.key) }}
        </span>
      </button>
    </nav>

    <div class="rail-spacer" />

    <button
      class="rail-item tip"
      :class="{ active: active === 'me' }"
      data-tip="我的"
      aria-label="我的"
      @click="go('me')"
    >
      <Settings :size="18" :stroke-width="1.85" />
    </button>

    <button class="rail-avatar tip" data-tip="我的账号" aria-label="我的账号" @click="go('me')">
      <AppAvatar :initials="initialsOf(auth.user?.nickname || '我')" tone="jade" size="sm" />
    </button>
  </aside>
</template>
