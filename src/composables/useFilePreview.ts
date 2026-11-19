import { readonly, shallowRef } from 'vue'
import type { PreviewFile } from '../utils/filePreview'

const file = shallowRef<PreviewFile | null>(null)

export function useFilePreview() {
  function openFilePreview(value: PreviewFile) { file.value = { ...value } }
  function closeFilePreview() { file.value = null }
  return { previewFile: readonly(file), openFilePreview, closeFilePreview }
}
