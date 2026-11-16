import { createRouter, createWebHistory } from 'vue-router'
import WorkspacePage from '../pages/WorkspacePage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/app/chat' },
    { path: '/app/chat', component: WorkspacePage },
    { path: '/app/chat/c/:conversationId', component: WorkspacePage },
    { path: '/app/contacts', component: WorkspacePage },
    { path: '/app/files', component: WorkspacePage },
    { path: '/app/me', component: WorkspacePage },
    { path: '/manage/:section?', component: WorkspacePage },
    { path: '/:pathMatch(.*)*', redirect: '/app/chat' },
  ],
})

export default router
