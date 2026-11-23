<script setup lang="ts">
import { computed, ref } from 'vue'
import { messageOf } from '../utils/error'
import { useRoute, useRouter } from 'vue-router'
import { MessagesSquare, Loader2, ArrowRight, Eye, EyeOff, Moon, Sun } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { useTheme } from '../composables/useTheme'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const chat = useChatStore()
const { theme, toggleTheme } = useTheme()

/** 只接受站内路径，避免 ?redirect=https://evil 变成开放跳转。 */
function redirectTarget(): string {
  const raw = route.query.redirect
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return value
  return '/app/chat'
}

type Mode = 'login' | 'register'
const mode = ref<Mode>('login')
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const nickname = ref('')
const error = ref('')
const submitting = ref(false)

const isRegister = computed(() => mode.value === 'register')
const canSubmit = computed(
  () =>
    username.value.trim().length >= 3 &&
    password.value.length >= 6 &&
    (!isRegister.value || nickname.value.trim().length > 0),
)

async function submit() {
  if (submitting.value) return
  if (!canSubmit.value) {
    error.value = '请检查用户名、密码和昵称是否符合要求。'
    return
  }
  error.value = ''
  submitting.value = true
  try {
    if (isRegister.value) {
      await auth.register(username.value.trim(), password.value, nickname.value.trim())
    } else {
      await auth.login(username.value.trim(), password.value)
    }
    chat.reset()
    await router.replace(redirectTarget())
  } catch (e) {
    error.value = messageOf(e, isRegister.value ? '注册失败' : '登录失败')
  } finally {
    submitting.value = false
  }
}

function setMode(value: Mode) {
  mode.value = value
  showPassword.value = false
  error.value = ''
}
</script>

<template>
  <main class="auth-stage">
    <header class="auth-top">
      <div class="auth-brand">
        <span class="brand-mark"><MessagesSquare :size="19" :stroke-width="2" aria-hidden="true" /></span>
        <span>VERYAL</span>
      </div>
      <button
        type="button"
        class="auth-theme icon-btn"
        :aria-label="theme === 'light' ? '切换深色主题' : '切换浅色主题'"
        @click="toggleTheme"
      >
        <Moon v-if="theme === 'light'" :size="18" aria-hidden="true" />
        <Sun v-else :size="18" aria-hidden="true" />
      </button>
    </header>

    <div class="auth-content">
      <section class="auth-card" aria-labelledby="auth-heading">
        <div class="auth-heading">
          <h1 id="auth-heading">{{ isRegister ? '创建账号' : '欢迎回来' }}</h1>
          <p>{{ isRegister ? '设置账号资料，开始使用 VERYAL。' : '登录后继续你的对话。' }}</p>
        </div>

        <div class="seg auth-seg" :style="{ '--idx': isRegister ? 1 : 0 }" role="group" aria-label="登录或注册">
          <span class="seg-thumb" aria-hidden="true" />
          <button type="button" :class="{ on: !isRegister }" :aria-pressed="!isRegister" :disabled="submitting" @click="setMode('login')">登录</button>
          <button type="button" :class="{ on: isRegister }" :aria-pressed="isRegister" :disabled="submitting" @click="setMode('register')">注册</button>
        </div>

        <form class="auth-form" :aria-busy="submitting" @submit.prevent="submit">
          <label class="field">
            <span class="field-label">用户名</span>
            <input
              v-model="username"
              class="field-input"
              autocomplete="username"
              autocapitalize="none"
              :spellcheck="false"
              minlength="3"
              required
              placeholder="至少 3 位"
            />
          </label>

          <label v-if="isRegister" class="field">
            <span class="field-label">昵称</span>
            <input
              v-model="nickname"
              class="field-input"
              autocomplete="nickname"
              required
              placeholder="别人看到的名字"
            />
          </label>

          <div class="field">
            <label class="field-label" for="auth-password">密码</label>
            <div class="password-field">
              <input
                id="auth-password"
                v-model="password"
                class="field-input"
                :type="showPassword ? 'text' : 'password'"
                :autocomplete="isRegister ? 'new-password' : 'current-password'"
                minlength="6"
                required
                placeholder="至少 6 位"
              />
              <button
                type="button"
                class="password-toggle icon-btn"
                aria-label="显示密码"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" :size="17" aria-hidden="true" />
                <Eye v-else :size="17" aria-hidden="true" />
              </button>
            </div>
          </div>

          <p v-if="error" class="auth-error" role="alert">{{ error }}</p>

          <button class="auth-submit" :disabled="submitting" type="submit">
            <template v-if="submitting">
              <Loader2 :size="16" :stroke-width="2" class="spin" aria-hidden="true" />
              <span>{{ isRegister ? '正在创建账号' : '正在登录' }}</span>
            </template>
            <template v-else>
              {{ isRegister ? '创建账号' : '进入 VERYAL' }}
              <ArrowRight :size="16" :stroke-width="2" aria-hidden="true" />
            </template>
          </button>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.auth-stage {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: auto;
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
    env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
  background:
    radial-gradient(ellipse at 28% -6%, var(--accent-soft) 0%, transparent 52%),
    var(--canvas);
}

.auth-top {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 23px var(--view-gutter);
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  font-size: 15px;
  font-weight: 760;
  letter-spacing: 0.065em;
}

.auth-theme {
  width: 44px;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: var(--r-full);
  background: var(--surface);
}

.auth-content {
  display: grid;
  flex: 1 0 auto;
  place-items: center;
  padding: 10px 20px 68px;
}

.auth-card {
  display: flex;
  flex-direction: column;
  gap: 23px;
  width: min(100%, 430px);
  padding: 33px;
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  animation: fade-up 280ms var(--ease-out) both;
}

.auth-heading h1 {
  font-size: clamp(28px, 4vw, 34px);
  font-weight: 720;
  line-height: 1.2;
  letter-spacing: -0.035em;
}

.auth-heading p {
  margin-top: 8px;
  color: var(--ink-3);
}

.auth-seg {
  height: 47px;
}

.auth-seg button {
  font-size: 14px;
}

.auth-form,
.field {
  display: flex;
  flex-direction: column;
}

.auth-form {
  gap: 16px;
}

.field {
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 640;
}

.field-input {
  width: 100%;
  height: 48px;
  padding: 0 13px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  font-size: 16px;
  transition: border-color var(--dur-1), box-shadow var(--dur-1);
}

.field-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
  outline: none;
}

.password-field {
  position: relative;
}

.password-field .field-input {
  padding-right: 49px;
}

.password-toggle {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 44px;
  height: 44px;
}

.auth-error {
  padding: 9px 11px;
  border-radius: var(--r-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13px;
}

.auth-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  margin-top: 3px;
  border-radius: var(--r-sm);
  background: var(--primary);
  color: var(--primary-foreground);
  font-weight: 640;
  transition: background var(--dur-1), transform var(--dur-1);
}

.auth-submit:hover:not(:disabled) {
  background: var(--primary-hover);
}

.auth-submit:active:not(:disabled) {
  transform: translateY(1px);
}

.auth-submit:disabled {
  color: var(--ink-3);
  background: var(--surface-3);
  cursor: not-allowed;
}

.spin {
  animation: tick-spin 900ms linear infinite;
}

@media (max-width: 600px) {
  .auth-top {
    padding-block: 14px;
  }

  .auth-content {
    flex-grow: 0;
    padding: clamp(22px, 8vh, 64px) 16px 28px;
  }

  .auth-card {
    padding: 23px 20px;
  }
}

@media (max-height: 560px) {
  .auth-content {
    padding-block: 12px 24px;
  }
}
</style>
