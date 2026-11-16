<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessageCircle, Loader2, ArrowRight } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'

const router = useRouter()
const auth = useAuthStore()
const chat = useChatStore()

type Mode = 'login' | 'register'
const mode = ref<Mode>('login')
const username = ref('')
const password = ref('')
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
  if (!canSubmit.value || submitting.value) return
  error.value = ''
  submitting.value = true
  try {
    if (isRegister.value) {
      await auth.register(username.value.trim(), password.value, nickname.value.trim())
    } else {
      await auth.login(username.value.trim(), password.value)
    }
    chat.reset()
    await router.replace('/app/chat')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    submitting.value = false
  }
}

function switchMode() {
  mode.value = isRegister.value ? 'login' : 'register'
  error.value = ''
}
</script>

<template>
  <div class="auth-stage">
    <div class="aura" aria-hidden="true"><i /><i /><i /></div>
    <div class="grain" aria-hidden="true" />

    <div class="auth-card">
      <div class="auth-brand">
        <span class="auth-logo">V</span>
        <div>
          <p class="auth-title">VERYAL</p>
          <p class="auth-sub">即时通讯 · Web 与移动端同源</p>
        </div>
      </div>

      <div class="seg auth-seg" :style="{ '--idx': isRegister ? 1 : 0 }">
        <span class="seg-thumb" aria-hidden="true" />
        <button :class="{ on: !isRegister }" @click="mode = 'login'">登录</button>
        <button :class="{ on: isRegister }" @click="mode = 'register'">注册</button>
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <label class="field">
          <span class="field-label">用户名</span>
          <input
            v-model="username"
            class="field-input"
            autocomplete="username"
            placeholder="至少 3 位"
          />
        </label>

        <label v-if="isRegister" class="field">
          <span class="field-label">昵称</span>
          <input
            v-model="nickname"
            class="field-input"
            placeholder="别人看到的名字"
          />
        </label>

        <label class="field">
          <span class="field-label">密码</span>
          <input
            v-model="password"
            class="field-input"
            type="password"
            :autocomplete="isRegister ? 'new-password' : 'current-password'"
            placeholder="至少 6 位"
          />
        </label>

        <p v-if="error" class="auth-error">{{ error }}</p>

        <button class="auth-submit" :disabled="!canSubmit || submitting" type="submit">
          <Loader2 v-if="submitting" :size="15" :stroke-width="2.2" class="spin" />
          <template v-else>
            {{ isRegister ? '创建账号' : '进入 VERYAL' }}
            <ArrowRight :size="15" :stroke-width="2.2" />
          </template>
        </button>
      </form>

      <p class="auth-switch">
        {{ isRegister ? '已有账号？' : '还没有账号？' }}
        <button type="button" @click="switchMode">
          {{ isRegister ? '直接登录' : '立即注册' }}
        </button>
      </p>

      <div class="auth-foot">
        <MessageCircle :size="12" :stroke-width="2" />
        消息经服务端持久化，换设备登录不会丢失
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-stage {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  overflow: hidden;
  background: var(--page);
}

.auth-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 384px;
  padding: 28px 26px 22px;
  border-radius: var(--r-xl);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--frame-ring), var(--frame-shadow);
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: fade-up 420ms var(--ease-out);
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auth-logo {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  font-weight: 720;
  font-size: 17px;
  color: #fff;
  background: var(--accent-grad);
  box-shadow: 0 6px 16px -8px var(--accent);
}

.auth-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.3px;
}

.auth-sub {
  font-size: 11.5px;
  color: var(--ink-3);
}

.auth-seg {
  --n: 2;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-label {
  font-size: 10.5px;
  font-weight: 640;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.field-input {
  height: 38px;
  padding: 0 12px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid transparent;
  font-size: 13.5px;
  transition: border-color var(--dur-2) var(--ease-out),
    box-shadow var(--dur-2) var(--ease-out), background var(--dur-2) var(--ease-out);
}

.field-input:focus {
  background: var(--surface);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}

.auth-error {
  font-size: 11.5px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: var(--r-sm);
  padding: 7px 10px;
  animation: pop-in 200ms var(--ease-spring);
}

.auth-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  margin-top: 2px;
  border-radius: var(--r-sm);
  background: var(--accent-grad);
  color: #fff;
  font-size: 13.5px;
  font-weight: 640;
  box-shadow: 0 4px 16px -6px var(--accent),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
  transition: transform var(--dur-1) var(--ease-spring), opacity var(--dur-1);
}

.auth-submit:hover:not(:disabled) {
  transform: translateY(-1px);
}

.auth-submit:active:not(:disabled) {
  transform: scale(0.98);
}

.auth-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.auth-switch {
  text-align: center;
  font-size: 12px;
  color: var(--ink-3);
}

.auth-switch button {
  color: var(--accent);
  font-weight: 600;
}

.auth-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--ink-4);
}

.spin {
  animation: tick-spin 900ms linear infinite;
}
</style>
