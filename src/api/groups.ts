import { api, type Id } from './client'

export type GroupDetail = {
  groupId: string
  name: string
  ownerId: Id
  memberIds: Id[]
  createdAt?: string
  updatedAt?: string
  roleInGroup?: GroupRole | null
}

export type GroupRole = 'OWNER' | 'ADMIN' | 'MEMBER'

/** 禁言档位：与后端 GroupMuteDuration 一一对应。 */
export type GroupMuteDuration = 'MUTE_7M' | 'MUTE_30M' | 'MUTE_FOREVER' | 'UNMUTE'

export type GroupModeration = {
  groupId: string
  announcement: string | null
  muteAll: boolean
  mutedUntil?: string | null
  mutedPermanently?: boolean
}

export type GroupMemberProfile = {
  userId: Id
  nickname: string
  avatar?: string | null
  online?: boolean
  role: GroupRole
  mutedUntil?: string | null
  mutedPermanently?: boolean
}

/** 群相关接口封装，路由对应 GroupController / GroupModerationController。 */
export const groupsApi = {
  detail: (groupId: string) => api.get<GroupDetail>(`/groups/${groupId}`),

  create: (name: string, memberIds: Id[]) =>
    api.post<GroupDetail>('/groups', { name, memberIds }),

  rename: (groupId: string, name: string) =>
    api.put<GroupDetail>(`/groups/${groupId}`, { name }),

  /** 成员昵称、角色与禁言状态，按群主、管理员、成员排序，一次取回。 */
  members: (groupId: string) =>
    api.get<GroupMemberProfile[]>(`/groups/${groupId}/members`),

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

  /** duration 传 UNMUTE 表示解除禁言，其余三档区分 7 分钟、30 分钟、永久。 */
  muteMember: (groupId: string, userId: Id, duration: GroupMuteDuration) =>
    api.post<GroupModeration>(`/groups/${groupId}/members/${userId}/mute`, {
      duration,
    }),
}
