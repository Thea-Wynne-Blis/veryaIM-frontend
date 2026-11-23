<script setup lang="ts">
import { ArrowUpRight, Link2 } from 'lucide-vue-next'
import type { LinkParts } from '../utils/link'

withDefaults(defineProps<{
  link: LinkParts
  compact?: boolean
}>(), { compact: false })
</script>

<template>
  <a
    class="link-card"
    :class="{ compact }"
    :href="link.href"
    target="_blank"
    rel="noopener noreferrer"
    :title="link.href"
  >
    <span class="link-card-icon">
      <Link2 :size="compact ? 15 : 17" :stroke-width="1.9" />
    </span>
    <span class="link-card-main">
      <span class="link-card-domain">{{ link.domain }}</span>
      <span class="link-card-path">{{ link.path || link.href }}</span>
    </span>
    <ArrowUpRight class="link-card-go" :size="compact ? 13 : 15" :stroke-width="1.9" />
  </a>
</template>

<style scoped>
.link-card {
  display: flex;
  align-items: center;
  gap: 9px;
  width: min(360px, 100%);
  max-width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--ink);
  text-align: left;
  text-decoration: none;
  transition:
    border-color var(--dur-1) var(--ease-out),
    background var(--dur-1) var(--ease-out);
}

.link-card:hover {
  border-color: var(--accent);
  background: var(--surface-2);
}

.link-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.link-card-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.link-card-domain {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 620;
  line-height: 1.45;
}

.link-card-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--ink-3);
  line-height: 1.45;
}

.link-card-go {
  flex-shrink: 0;
  color: var(--ink-4);
}

.link-card:hover .link-card-go {
  color: var(--accent);
}

.link-card.compact {
  gap: 8px;
  padding: 7px 9px;
}

.link-card.compact .link-card-icon {
  width: 26px;
  height: 26px;
}

.link-card.compact .link-card-domain {
  font-size: 13px;
}

.link-card.compact .link-card-path {
  font-size: 11px;
}
</style>
