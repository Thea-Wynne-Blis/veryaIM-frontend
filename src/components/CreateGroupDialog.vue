<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { messageOf } from '../utils/error'
import { X, Search, Loader2, Users, Check, MessageSquarePlus } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { api } from '../api/client'
import { groupsApi } from '../api/groups'
import { initialsOf, toneOf } from '../utils/present'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', groupId: string): void
}>()

type Friend = { userId: string; nickname: string; remark?: string | null }

const friends = ref<Friend[]>([])
const name = ref('')
const keyword = ref('')
const selected = ref<Set<string>>(new Set())
const loading = ref(false)
const busy = ref(false)
const error = ref('')

const visible = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return friends.value
  return friends.value.filter((f) =>
    [f.nickname, f.remark].filter(Boolean).some((v) =>
      String(v).toLowerCase().includes(kw),
    ),
  )
})

const canCreate = computed(() => name.value.trim().length > 0 && !busy.value)

function toggle(userId: string) {
  const next = new Set(selected.value)
  if (next.has(userId)) next.delete(userId)
  else next.add(userId)
  selected.value = next
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get<{ friends: Friend[] }>('/contacts')
    friends.value = (data.friends ?? []).map((f) => ({
      ...f,
      userId: ((f as unknown as { userId?: string; friendId?: string }).userId ??
        (f as unknown as { friendId?: string }).friendId ?? '') as string,
    }))
  } catch (e) {
    error.value = messageOf(e, '加载好友失败')
  } finally {
    loading.value = false
  }
}

async function create() {
  if (!canCreate.value) return
  busy.value = true
  error.value = ''
  try {
    const group = await groupsApi.create(name.value.trim(), [...selected.value])
    emit('created', group.groupId)
    reset()
  } catch (e) {
    error.value = messageOf(e, '创建群聊失败')
  } finally {
    busy.value = false
  }
}

function reset() {
  name.value = ''
  keyword.value = ''
  selected.value = new Set()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      reset()
      load()
    }
  },
)
</script>

<template>
  <Transition name="fade">
    <div v-if="props.open" class="mask" @click.self="emit('close')">
      <div class="dialog" role="dialog" aria-label="创建群聊">
        <header class="dialog-head">
          <div>
            <p class="eyebrow">创建群聊</p>
            <h2 class="dialog-title">选择成员</h2>
          </div>
          <button class="icon-btn sm" aria-label="关闭" @click="emit('close')">
            <X :size="15" :stroke-width="2" />
          </button>
        </header>

        <label class="field" style="margin: 0 14px">
          <span class="field-label">群名称</span>
          <input
            v-model="name"
            class="field-input"
            placeholder="给群起个名字"
            maxlength="128"
          />
        </label>

        <label class="search" style="margin: 0 14px">
          <Search class="search-icon" :size="15" :stroke-width="2" />
          <input v-model="keyword" type="search" placeholder="搜索好友" />
          <Loader2 v-if="loading" :size="13" class="spin" style="color: var(--ink-3)" />
        </label>

        <p v-if="selected.size" class="picked-hint">
          已选 {{ selected.size }} 人
        </p>

        <div class="dialog-body">
          <p v-if="error" class="dialog-error">{{ error }}</p>

          <button
            v-for="f in visible"
            :key="f.userId"
            class="pick-row"
            :class="{ on: selected.has(f.userId) }"
            @click="toggle(f.userId)"
          >
            <AppAvatar :initials="initialsOf(f.remark || f.nickname)" :tone="toneOf(f.userId)" size="md" />
            <span class="pick-main">
              <span class="pick-name">{{ f.remark || f.nickname }}</span>
              <span class="pick-sub">ID {{ f.userId }}</span>
            </span>
            <span class="tick-box" :class="{ on: selected.has(f.userId) }">
              <Check v-if="selected.has(f.userId)" :size="12" :stroke-width="2.6" />
            </span>
          </button>

          <div v-if="!visible.length && !loading" class="dialog-empty">
            <Users :size="20" :stroke-width="1.6" style="color: var(--ink-4)" />
            <p>{{ friends.length ? '没有匹配的好友' : '还没有好友，先去通讯录添加' }}</p>
          </div>
        </div>

        <footer class="dialog-foot">
          <button class="ghost" @click="emit('close')">取消</button>
          <button class="primary" :disabled="!canCreate" @click="create">
            <Loader2 v-if="busy" :size="13" class="spin" />
            <MessageSquarePlus v-else :size="13" :stroke-width="2" />
            创建群聊
          </button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.mask {
  position: fixed; inset: 0; z-index: 60;
  display: grid; place-items: center; padding: 24px;
  background: color-mix(in srgb, var(--ink) 26%, transparent);
  backdrop-filter: blur(6px);
}
.dialog {
  width: 100%; max-width: 440px; max-height: min(600px, 84vh);
  display: flex; flex-direction: column; gap: 10px;
  padding: 16px 0 12px;
  border-radius: var(--r-lg);
  background: var(--surface); border: 1px solid var(--line);
  box-shadow: var(--frame-ring), var(--shadow-lg);
  animation: pop-in 200ms var(--ease-spring);
}
.dialog-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 0 14px; }
.dialog-title { font-size: 16px; font-weight: 660; letter-spacing: -0.3px; margin-top: 2px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 10.5px; font-weight: 640; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
.field-input { height: 34px; padding: 0 11px; border-radius: var(--r-sm); background: var(--surface-3); border: 1px solid transparent; font-size: 13px; }
.field-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); background: var(--surface); }
.picked-hint { padding: 0 14px; font-size: 11px; color: var(--accent-ink); }
.dialog-body { flex: 1; overflow-y: auto; padding: 2px 8px 4px; }
.dialog-error { margin: 4px 6px 8px; padding: 7px 10px; border-radius: var(--r-sm); background: var(--danger-soft); color: var(--danger); font-size: 11.5px; }
.pick-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px; border-radius: var(--r-md); text-align: left; transition: background var(--dur-1) var(--ease-out); }
.pick-row:hover { background: var(--surface-hover); }
.pick-row.on { background: var(--accent-soft); }
.pick-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pick-name { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pick-sub { font-size: 10.5px; color: var(--ink-3); }
.tick-box { width: 20px; height: 20px; border-radius: 6px; border: 1px solid var(--line-strong); display: grid; place-items: center; color: #fff; flex-shrink: 0; transition: all var(--dur-1) var(--ease-out); }
.tick-box.on { background: var(--accent); border-color: var(--accent); }
.dialog-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 30px 16px; font-size: 12px; color: var(--ink-3); }
.dialog-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 4px 14px 0; border-top: 1px solid var(--line); }
.ghost, .primary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 16px; border-radius: var(--r-sm); font-size: 12.5px; font-weight: 620; }
.ghost { border: 1px solid var(--line); color: var(--ink-2); background: var(--surface-2); }
.primary { background: var(--accent-grad); color: #fff; box-shadow: 0 3px 12px -5px var(--accent); }
.primary:disabled { opacity: 0.45; box-shadow: none; cursor: not-allowed; }
.spin { animation: tick-spin 900ms linear infinite; }
.fade-enter-active, .fade-leave-active { transition: opacity 160ms var(--ease-out); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
