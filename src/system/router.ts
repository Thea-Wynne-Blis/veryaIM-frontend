import { createRouter, createWebHistory } from 'vue-router'
import { adminAuth } from './api'
import AdminsPage from './pages/AdminsPage.vue'
import AuditPage from './pages/AuditPage.vue'
import DashboardPage from './pages/DashboardPage.vue'
import GroupsPage from './pages/GroupsPage.vue'
import LoginPage from './pages/LoginPage.vue'
import ReportsPage from './pages/ReportsPage.vue'
import SensitiveWordsPage from './pages/SensitiveWordsPage.vue'
import UsersPage from './pages/UsersPage.vue'

/**
 * 运营后台路由，挂在 `/system/` 下；与 IM 前端是两个独立入口（system.html）。
 */
export const router = createRouter({
  history: createWebHistory('/system/'),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', name: 'login', component: LoginPage },
    { path: '/dashboard', name: 'dashboard', component: DashboardPage },
    { path: '/users', name: 'users', component: UsersPage },
    { path: '/groups', name: 'groups', component: GroupsPage },
    { path: '/reports', name: 'reports', component: ReportsPage },
    { path: '/sensitive-words', name: 'sensitive-words', component: SensitiveWordsPage },
    { path: '/admins', name: 'admins', component: AdminsPage },
    { path: '/audit', name: 'audit', component: AuditPage },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

router.beforeEach((to) => {
  if (to.name === 'login') {
    return adminAuth.token() ? { path: '/dashboard' } : true
  }
  if (!adminAuth.token()) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})
