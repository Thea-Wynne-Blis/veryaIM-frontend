import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// npm run dev 时把 /api/v1 代理到后端，避免前端请求 404。
// 后端地址可用 VITE_API_PROXY 覆盖，例如 VITE_API_PROXY=http://82.157.47.151:8899
const apiTarget = process.env.VITE_API_PROXY || 'http://127.0.0.1:8080'
// 实时通道走 Netty WebSocket Gateway（默认 9098），生产由 nginx 反代 /ws。
const wsTarget = process.env.VITE_WS_PROXY || 'ws://127.0.0.1:9098'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: wsTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      // 两个独立入口：IM 客户端（index.html）与运营后台（system.html）。
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        system: fileURLToPath(new URL('./system.html', import.meta.url)),
      },
    },
  },
})
