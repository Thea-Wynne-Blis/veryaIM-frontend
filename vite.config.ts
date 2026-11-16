import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// npm run dev 时把 /api/v1 代理到后端，避免前端请求 404。
// 后端地址可用 VITE_API_PROXY 覆盖，例如 VITE_API_PROXY=http://82.157.47.151:8899
const apiTarget = process.env.VITE_API_PROXY || 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
