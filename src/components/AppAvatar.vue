<script setup lang="ts">
withDefaults(
  defineProps<{
    initials: string
    tone?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    presence?: 'online' | 'away' | 'offline'
    rounded?: boolean
  }>(),
  { tone: 'jade', size: 'md', presence: 'offline' },
)
</script>

<template>
  <span class="avatar" :class="[size, `tone-${tone}`, { rounded }]">
    <span class="avatar-core">{{ initials }}</span>
    <span v-if="presence !== 'offline'" class="presence" :class="presence" />
  </span>
</template>
