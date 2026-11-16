<script setup lang="ts">
import {
  MessageCircle,
  Users,
  FolderOpen,
  Settings,
  Bell,
  Moon,
  Sun,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'

defineProps<{ unread: number; theme: 'light' | 'dark' }>()
const emit = defineEmits<{
  (e: 'navigate', view: 'chat' | 'contacts' | 'files' | 'me'): void
  (e: 'toggle-theme'): void
}>()

const nav = [
  { key: 'chat', icon: MessageCircle, label: '消息' },
  { key: 'contacts', icon: Users, label: '通讯录' },
  { key: 'files', icon: FolderOpen, label: '文件' },
] as const

const active = defineModel<string>('active', { default: 'chat' })
</script>

<template>
  <aside class="rail">
    <div class="rail-brand" title="VERYAL">V</div>

    <nav class="rail-nav">
      <button
        v-for="item in nav"
        :key="item.key"
        class="rail-item"
        :class="{ active: active === item.key }"
        :aria-label="item.label"
        :aria-current="active === item.key ? 'page' : undefined"
        @click="
          active = item.key;
          emit('navigate', item.key)
        "
      >
        <component :is="item.icon" :size="19" :stroke-width="1.9" />
        <span v-if="item.key === 'chat' && unread > 0" class="rail-badge">
          {{ unread > 99 ? '99+' : unread }}
        </span>
      </button>
    </nav>

    <div class="rail-spacer" />

    <button
      class="rail-item"
      :aria-label="theme === 'dark' ? '切换到浅色' : '切换到深色'"
      @click="emit('toggle-theme')"
    >
      <component
        :is="theme === 'dark' ? Sun : Moon"
        :size="18"
        :stroke-width="1.9"
      />
    </button>
    <button class="rail-item" aria-label="通知">
      <Bell :size="18" :stroke-width="1.9" />
    </button>
    <button
      class="rail-item"
      :class="{ active: active === 'me' }"
      aria-label="我的"
      @click="
        active = 'me';
        emit('navigate', 'me')
      "
    >
      <Settings :size="18" :stroke-width="1.9" />
    </button>

    <button class="rail-avatar" aria-label="账号">
      <AppAvatar initials="我" tone="jade" size="sm" />
    </button>
  </aside>
</template>
