<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Flag,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  UsersRound,
} from 'lucide-vue-next'
import { adminAuth, api, onUnauthorized } from './api'

const route = useRoute()
const router = useRouter()

const isLogin = computed(() => route.name === 'login')
const profile = computed(() => adminAuth.profile())

const nav = [
  { name: 'dashboard', label: '概览', icon: LayoutDashboard },
  { name: 'users', label: '用户', icon: Users },
  { name: 'groups', label: '群组', icon: UsersRound },
  { name: 'reports', label: '举报', icon: Flag },
  { name: 'sensitive-words', label: '敏感词', icon: Sparkles },
  { name: 'admins', label: '管理员', icon: ShieldCheck },
  { name: 'audit', label: '审计日志', icon: ScrollText },
]

const title = computed(() => nav.find((item) => item.name === route.name)?.label ?? '运营后台')

onUnauthorized(() => {
  void router.replace({ name: 'login' })
})

async function logout(): Promise<void> {
  const refreshToken = adminAuth.refreshToken()
  try {
    if (refreshToken) await api.post('/platform/auth/logout', { refreshToken })
  } catch {
    /* 令牌已失效也继续清理本地状态 */
  }
  adminAuth.clear()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <router-view v-if="isLogin" />

  <div v-else class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">V</span>
        <span>VERYAL 运营</span>
      </div>
      <router-link
        v-for="item in nav"
        :key="item.name"
        class="nav-item"
        :class="{ active: route.name === item.name }"
        :to="{ name: item.name }"
      >
        <component :is="item.icon" :size="16" />
        <span>{{ item.label }}</span>
      </router-link>
      <div class="nav-spacer" />
      <div class="nav-foot">
        scope=PLATFORM<br />
        与 IM 用户体系隔离
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <h1>{{ title }}</h1>
        <div class="spacer" />
        <div class="who">
          <span>{{ profile?.displayName || profile?.username || '管理员' }}</span>
          <span class="badge blue">{{ profile?.role || 'PLATFORM_ADMIN' }}</span>
        </div>
        <button class="btn btn-sm" @click="logout">退出</button>
      </header>
      <div class="content">
        <router-view />
      </div>
    </main>
  </div>
</template>
