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
        @click="
          active = item.key;
          emit('navigate', item.key)
        "
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
      :data-tip="theme === 'dark' ? '浅色模式' : '深色模式'"
      :aria-label="theme === 'dark' ? '切换到浅色' : '切换到深色'"
      @click="emit('toggle-theme')"
    >
      <component
        :is="theme === 'dark' ? Sun : Moon"
        :size="18"
        :stroke-width="1.85"
      />
    </button>
    <button class="rail-item tip" data-tip="通知" aria-label="通知">
      <Bell :size="18" :stroke-width="1.85" />
    </button>
    <button
      class="rail-item tip"
      :class="{ active: active === 'me' }"
      data-tip="设置"
      aria-label="设置"
      @click="
        active = 'me';
        emit('navigate', 'me')
      "
    >
      <Settings :size="18" :stroke-width="1.85" />
    </button>

    <button class="rail-avatar tip" data-tip="我的账号" aria-label="账号">
      <AppAvatar initials="我" tone="jade" size="sm" />
    </button>
  </aside>
</template>
