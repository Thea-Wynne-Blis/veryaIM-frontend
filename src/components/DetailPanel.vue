<script setup lang="ts">
import { computed } from 'vue'
import { X, Pin, Users, FileText, Download, BellOff } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { trackSpotlight } from '../composables/usePointerFx'
import { groupMembers, sharedFiles, type Conversation } from '../data/workspace'

const props = defineProps<{ conversation: Conversation }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const memberCount = computed(() =>
  props.conversation.kind === 'group'
    ? props.conversation.members ?? groupMembers.length
    : 2,
)

const fileCount = computed(() => sharedFiles.length)
const onlineCount = computed(() =>
  Math.max(1, Math.round(memberCount.value * 0.5)),
)
</script>

<template>
  <aside class="detail-pane" aria-label="会话详情">
    <header class="detail-head">
      <h2 class="detail-title">会话详情</h2>
      <button class="icon-btn sm" aria-label="关闭详情" @click="emit('close')">
        <X :size="15" :stroke-width="2" />
      </button>
    </header>

    <div class="detail-scroll">
      <div class="detail-hero">
        <AppAvatar
          :initials="conversation.initials"
          :tone="conversation.tone"
          :rounded="conversation.kind === 'group'"
          size="xl"
        />
        <div>
          <p class="detail-name">{{ conversation.name }}</p>
          <p class="detail-caption">{{ conversation.context }}</p>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-cell">
          <p class="stat-value">{{ memberCount }}</p>
          <p class="stat-label">成员</p>
        </div>
        <div class="stat-cell">
          <p class="stat-value" style="color: var(--accent)">{{ onlineCount }}</p>
          <p class="stat-label">在线</p>
        </div>
        <div class="stat-cell">
          <p class="stat-value">{{ fileCount }}</p>
          <p class="stat-label">文件</p>
        </div>
      </div>

      <div class="card spot glare" @pointermove="trackSpotlight">
        <p class="card-label">
          <Pin :size="11" :stroke-width="2.4" />
          群公告
        </p>
        <p class="card-text">
          本周五前完成交互走查，重点覆盖窄屏状态与深色模式。有问题直接在这里回我。
        </p>
      </div>

      <div
        v-if="conversation.kind === 'group'"
        class="card spot"
        @pointermove="trackSpotlight"
      >
        <p class="card-label">
          <Users :size="11" :stroke-width="2.4" />
          成员 · {{ groupMembers.length }}
        </p>
        <div class="member-grid">
          <div
            v-for="member in groupMembers"
            :key="member.name"
            class="member tip"
            :data-tip="`${member.name} · ${member.role}`"
          >
            <AppAvatar
              :initials="member.initials"
              :tone="member.tone"
              size="sm"
              :presence="member.role === '群主' ? 'online' : 'offline'"
            />
            <span class="member-name">{{ member.name }}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <p class="card-label">
          <FileText :size="11" :stroke-width="2.4" />
          共享文件
        </p>
        <button
          v-for="file in sharedFiles"
          :key="file.name"
          class="file-row glare"
        >
          <span class="file-row-icon">
            <FileText :size="14" :stroke-width="1.9" />
          </span>
          <span class="file-row-main">
            <span class="file-row-name">{{ file.name }}</span>
            <span class="file-row-size">{{ file.size }}</span>
          </span>
          <Download :size="13" :stroke-width="1.9" style="color: var(--ink-3)" />
        </button>
      </div>

      <button class="mute-btn">
        <BellOff :size="13" :stroke-width="2" />
        消息免打扰
      </button>
    </div>
  </aside>
</template>

<style scoped>
.member.tip::after {
  left: 50%;
  top: -6px;
  transform: translate(-50%, -100%) scale(0.96);
}

.member.tip:hover::after {
  transform: translate(-50%, -100%) scale(1);
}

.mute-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 33px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 550;
  color: var(--ink-2);
  transition: background var(--dur-1) var(--ease-out),
    color var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out);
}

.mute-btn:hover {
  background: var(--surface-hover);
  border-color: var(--line-strong);
  color: var(--ink);
}
</style>
