<script setup lang="ts">
import {
  MessageCircle,
  Users,
  FolderOpen,
  Star,
  Settings,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { useAuthStore } from '../stores/auth'
import { initialsOf } from '../utils/present'

defineProps<{ unread: number }>()
const emit = defineEmits<{
  (e: 'navigate', view: 'chat' | 'contacts' | 'files' | 'favorites' | 'me'): void
}>()

const auth = useAuthStore()

const nav = [
  { key: 'chat', icon: MessageCircle, label: '消息' },
  { key: 'contacts', icon: Users, label: '通讯录' },
  { key: 'files', icon: FolderOpen, label: '文件' },
  { key: 'favorites', icon: Star, label: '收藏' },
] as const

const active = defineModel<string>('active', { default: 'chat' })

function go(view: 'chat' | 'contacts' | 'files' | 'favorites' | 'me') {
  active.value = view
  emit('navigate', view)
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
        <span v-if="item.key === 'chat' && unread > 0" class="rail-badge num">
          {{ unread > 99 ? '99+' : unread }}
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
