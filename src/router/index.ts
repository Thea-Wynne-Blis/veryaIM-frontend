import { createRouter, createWebHistory } from 'vue-router'
import WorkspacePage from '../pages/WorkspacePage.vue'
import LoginPage from '../pages/LoginPage.vue'
import { getToken } from '../api/client'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/app/chat' },
    { path: '/login', name: 'login', component: LoginPage },
    { path: '/app/chat', name: 'chat', component: WorkspacePage },
    {
      path: '/app/chat/c/:conversationId',
      name: 'conversation',
      component: WorkspacePage,
    },
    { path: '/app/contacts', name: 'contacts', component: WorkspacePage },
    { path: '/app/moments', name: 'moments', component: WorkspacePage },
    { path: '/app/favorites', name: 'favorites', component: WorkspacePage },
    { path: '/app/notes', name: 'notes', component: WorkspacePage },
    { path: '/app/me', name: 'me', component: WorkspacePage },
    { path: '/:pathMatch(.*)*', redirect: '/app/chat' },
  ],
})

router.beforeEach((to) => {
  const authed = !!getToken()
  if (to.name === 'login') {
    return authed ? { path: '/app/chat' } : true
  }
  if (!authed) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
