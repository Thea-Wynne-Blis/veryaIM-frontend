<script setup lang="ts">
import { computed } from 'vue'
import { highlightParts } from '../utils/search'
const props = defineProps<{ text: string; keyword: string }>()
const parts = computed(() => highlightParts(props.text, props.keyword))
</script>

<template>
  <span><template v-for="(part, index) in parts" :key="index"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
</template>

<style scoped>
mark { background: var(--accent-soft); color: var(--accent-ink); border-radius: 2px; }
</style>
