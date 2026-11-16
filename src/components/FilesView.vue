<script setup lang="ts">
import { computed } from 'vue'
import { FileText, Download, FolderOpen } from 'lucide-vue-next'
import { useChatStore } from '../stores/chat'
import { listTime } from '../utils/present'

const chat = useChatStore()

type Row = { key: string; conversationId: string; title: string; name: string; time: string }

/** 从已加载的消息里提取文件类消息，按会话分组 */
const files = computed<Row[]>(() => {
  const rows: Row[] = []
  for (const card of chat.cards) {
    const list = chat.messages[card.conversationId] ?? []
    for (const m of list) {
      if (m.type !== 'FILE') continue
      let name = m.content
      try {
        const parsed = JSON.parse(m.content) as { fileName?: string }
        if (parsed.fileName) name = parsed.fileName
      } catch {
        /* content 可能直接是文件名或 fileId */
      }
      rows.push({
        key: `${card.conversationId}-${m.messageId}`,
        conversationId: card.conversationId,
        title: card.title,
        name: name || `文件 ${m.messageId}`,
        time: listTime(m.createdAt),
      })
    }
  }
  return rows
})

async function download(row: Row) {
  const card = chat.cards.find((c) => c.conversationId === row.conversationId)
  if (!card) return
  const list = chat.messages[row.conversationId] ?? []
  const msg = list.find((m) => `${card.conversationId}-${m.messageId}` === row.key)
  if (!msg) return
  // content 里可能是 fileId 或 JSON
  let fileId = msg.content
  try {
    const parsed = JSON.parse(msg.content) as { fileId?: string }
    if (parsed.fileId) fileId = parsed.fileId
  } catch {
    /* 直接用原文 */
  }
  try {
    const res = await fetch(`/api/v1/files/${encodeURIComponent(fileId)}/url`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('veryal.token') ?? ''}` },
    })
    const body = await res.json()
    const url = body?.data?.url ?? body?.data
    if (typeof url === 'string' && url) window.open(url, '_blank')
  } catch {
    /* 静默 */
  }
}
</script>

<template>
  <div class="files">
    <header class="files-head">
      <div>
        <p class="eyebrow">文件</p>
        <h1 class="files-title">当前会话中的文件</h1>
      </div>
      <span class="files-count num">{{ files.length }}</span>
    </header>

    <div class="files-body">
      <div v-if="files.length" class="files-card">
        <button v-for="f in files" :key="f.key" class="file-row" @click="download(f)">
          <span class="file-icon"><FileText :size="16" :stroke-width="1.9" /></span>
          <span class="file-main">
            <span class="file-name">{{ f.name }}</span>
            <span class="file-sub">{{ f.title }} · {{ f.time }}</span>
          </span>
          <Download :size="14" :stroke-width="1.9" style="color: var(--ink-3)" />
        </button>
      </div>

      <div v-else class="empty">
        <div class="empty-mark"><FolderOpen :size="22" :stroke-width="1.6" /></div>
        <h3 class="empty-title">还没有文件</h3>
        <p class="empty-text">
          在聊天里发送文件后会出现在这里。当前只统计已经打开过的会话，翻看更多会话后会自动补齐。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.files { height: 100%; display: flex; flex-direction: column; background: var(--canvas); overflow: hidden; }
.files-head { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 14px; border-bottom: 1px solid var(--line); background: var(--surface); }
.files-title { font-size: 17px; font-weight: 680; letter-spacing: -0.3px; margin-top: 2px; }
.files-count { font-size: 11px; font-weight: 680; padding: 3px 9px; border-radius: var(--r-full); background: var(--accent-soft); color: var(--accent-ink); }
.files-body { flex: 1; overflow-y: auto; padding: 18px 24px 28px; }
.files-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; }
.file-row { display: flex; align-items: center; gap: 11px; width: 100%; padding: 11px 12px; text-align: left; transition: background var(--dur-1) var(--ease-out); }
.file-row:hover { background: var(--surface-hover); }
.file-row + .file-row { border-top: 1px solid var(--line); }
.file-icon { width: 32px; height: 32px; border-radius: var(--r-xs); display: grid; place-items: center; background: var(--surface-3); color: var(--accent); box-shadow: inset 0 0 0 1px var(--line); flex-shrink: 0; }
.file-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.file-name { font-size: 13px; font-weight: 560; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-sub { font-size: 10.5px; color: var(--ink-3); }
</style>
