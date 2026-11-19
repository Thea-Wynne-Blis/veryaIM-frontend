<script setup lang="ts">
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import FilePreviewDialog from './components/FilePreviewDialog.vue'
import { useFilePreview } from './composables/useFilePreview'
const { previewFile, closeFilePreview } = useFilePreview()
const route = useRoute()
watch(() => route.name, name => { if (name === 'login') closeFilePreview() })
</script>

<template>
  <RouterView />
  <FilePreviewDialog v-if="previewFile" :key="String(previewFile.fileId)" :file="previewFile" @close="closeFilePreview" />
</template>
