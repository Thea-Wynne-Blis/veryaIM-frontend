<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    initials: string
    tone?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    presence?: 'online' | 'away' | 'offline'
    rounded?: boolean
    /** 头像图片地址；为空或加载失败时回退到文字头像。 */
    src?: string | null
  }>(),
  { tone: 'jade', size: 'md', presence: 'offline', src: null },
)

/** 记录加载失败的地址：换头像（src 变化）后自动重试。 */
const failed = ref<string | null>(null)
watch(
  () => props.src,
  () => {
    failed.value = null
  },
)
</script>

<template>
  <span class="avatar" :class="[size, `tone-${tone}`, { rounded }]">
    <img
      v-if="src && failed !== src"
      class="avatar-img"
      :src="src"
      alt=""
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="failed = src"
    />
    <span v-else class="avatar-core">{{ initials }}</span>
    <span v-if="presence !== 'offline'" class="presence" :class="presence" />
  </span>
</template>
