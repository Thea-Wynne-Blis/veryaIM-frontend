import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initMotion } from './composables/useMotion'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'

initMotion()
createApp(App).use(createPinia()).use(router).mount('#app')
