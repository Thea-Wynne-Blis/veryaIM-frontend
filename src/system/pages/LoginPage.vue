<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminAuth, AdminApiError, api, type Id } from '../api'

type LoginPayload = {
  token: string
  refreshToken: string
  scope: string
  role: string
  adminId: Id
  username: string
  displayName: string
}

const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const mfaCode = ref('')
const needMfa = ref(false)
const busy = ref(false)
const error = ref('')

async function submit(): Promise<void> {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    const payload = await api.post<LoginPayload>('/platform/auth/login', {
      username: username.value.trim(),
      password: password.value,
      mfaCode: mfaCode.value.trim() || undefined,
    })
    adminAuth.save(payload)
    const redirect = route.query.redirect
    await router.replace(typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/dashboard')
  } catch (e) {
    const err = e as AdminApiError
    if (err.code === 40105) {
      needMfa.value = true
      error.value = '该账号已开启两步验证，请输入 6 位动态码'
    } else if (err.code === 40106) {
      needMfa.value = true
      error.value = '动态码不正确，请重试'
    } else {
      error.value = err.message || '登录失败'
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login-wrap">
    <form class="login-card" @submit.prevent="submit">
      <h2>VERYAL 运营后台</h2>
      <p>平台管理员专用入口，与 IM 账号体系完全隔离</p>

      <div class="field">
        <span>管理员账号</span>
        <input v-model="username" type="text" autocomplete="username" placeholder="platform_admin" />
      </div>
      <div class="field">
        <span>密码</span>
        <input v-model="password" type="password" autocomplete="current-password" placeholder="••••••••" />
      </div>
      <div v-if="needMfa" class="field">
        <span>动态码</span>
        <input v-model="mfaCode" type="text" inputmode="numeric" maxlength="6" placeholder="6 位数字" />
      </div>

      <div v-if="error" class="error-bar" style="margin: 4px 0 12px">{{ error }}</div>

      <button class="btn btn-primary" type="submit" :disabled="busy">
        {{ busy ? '登录中…' : '登录' }}
      </button>
    </form>
  </div>
</template>
