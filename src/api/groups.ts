import { api, type Id } from './client'

export type GroupDetail = {
  groupId: string
  name: string
  ownerId: Id
  memberIds: Id[]
  createdAt?: string
  updatedAt?: string
  roleInGroup?: 'OWNER' | 'ADMIN' | 'MEMBER' | null
}

export type GroupModeration = {
  groupId: string
  announcement: string | null
  muteAll: boolean
  mutedUntil?: string | null
}

export type GroupMemberProfile = {
  userId: Id
  nickname: string
  online?: boolean
  role?: string
  muted?: boolean
}

/** 群相关接口封装，路径与后端 GroupController / GroupModerationController 对齐 */
export const groupsApi = {
  detail: (groupId: string) => api.get<GroupDetail>(`/groups/${groupId}`),

  create: (name: string, memberIds: Id[]) =>
    api.post<GroupDetail>('/groups', { name, memberIds }),

  rename: (groupId: string, name: string) =>
    api.put<GroupDetail>(`/groups/${groupId}`, { name }),

  addMembers: (groupId: string, userIds: Id[]) =>
    api.post<GroupDetail>(`/groups/${groupId}/members`, { userIds }),

  kick: (groupId: string, userId: Id) =>
    api.delete<GroupDetail>(`/groups/${groupId}/members/${userId}`),

  changeRole: (groupId: string, userId: Id, role: 'ADMIN' | 'MEMBER') =>
    api.put<GroupDetail>(`/groups/${groupId}/members/${userId}/role`, { role }),

  transfer: (groupId: string, newOwnerId: Id) =>
    api.post<GroupDetail>(`/groups/${groupId}/transfer`, { newOwnerId }),

  leave: (groupId: string) => api.post<void>(`/groups/${groupId}/leave`),

  disband: (groupId: string) => api.delete<void>(`/groups/${groupId}`),

  moderation: (groupId: string) =>
    api.get<GroupModeration>(`/groups/${groupId}/moderation`),

  setAnnouncement: (groupId: string, announcement: string) =>
    api.put<GroupModeration>(`/groups/${groupId}/announcement`, { announcement }),

  setMuteAll: (groupId: string, muteAll: boolean) =>
    api.post<GroupModeration>(`/groups/${groupId}/mute`, { muteAll }),

  muteMember: (groupId: string, userId: Id, minutes: number) =>
    api.post<GroupModeration>(`/groups/${groupId}/members/${userId}/mute`, {
      minutes,
    }),
}
