<script setup lang="ts">
import { X, Pin, Users, FileText, Download, BellOff } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { groupMembers, sharedFiles, type Conversation } from '../data/workspace'

defineProps<{ conversation: Conversation }>()
const emit = defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <aside class="detail-pane" aria-label="会话详情">
    <header class="detail-head">
      <h2 class="detail-title">会话详情</h2>
      <button class="icon-btn sm" aria-label="关闭详情" @click="emit('close')">
        <X :size="16" :stroke-width="2" />
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

      <div class="card">
        <p class="card-label">
          <Pin :size="12" :stroke-width="2.2" />
          群公告
        </p>
        <p class="card-text">
          本周五前完成交互走查，重点覆盖窄屏状态与深色模式。有问题直接在这里回我。
        </p>
      </div>

      <div v-if="conversation.kind === 'group'" class="card">
        <p class="card-label">
          <Users :size="12" :stroke-width="2.2" />
          成员 · {{ groupMembers.length }}
        </p>
        <div class="member-grid">
          <div v-for="member in groupMembers" :key="member.name" class="member">
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
          <FileText :size="12" :stroke-width="2.2" />
          共享文件
        </p>
        <button v-for="file in sharedFiles" :key="file.name" class="file-row">
          <span class="file-row-icon">
            <FileText :size="15" :stroke-width="1.9" />
          </span>
          <span class="file-row-main">
            <span class="file-row-name">{{ file.name }}</span>
            <span class="file-row-size">{{ file.size }}</span>
          </span>
          <Download :size="14" :stroke-width="1.9" style="color: var(--ink-3)" />
        </button>
      </div>

      <button class="chip" style="justify-content: center; height: 34px">
        <BellOff :size="13" :stroke-width="2" style="margin-right: 5px" />
        消息免打扰
      </button>
    </div>
  </aside>
</template>
