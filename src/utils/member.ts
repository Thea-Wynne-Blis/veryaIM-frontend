/**
 * 群成员 / 单聊对端的展示模型。
 *
 * <p>放在 utils 而不是 store：`chatView` 这类纯转换函数也要用它，
 * 不能让工具层反过来依赖 store。store 侧继续从这里 re-export。</p>
 */
import type { Id } from '../api/client'

export type ChatMember = {
  userId: Id
  nickname: string
  /** 我给这个成员设的好友备注；展示名优先用它 */
  remark?: string | null
  avatar?: string | null
  online?: boolean
  role?: string
}

/** 群成员在界面上的显示名：好友备注优先，没设备注才用群昵称。 */
export function memberDisplayName(member: Pick<ChatMember, 'nickname' | 'remark'>): string {
  const remark = member.remark?.trim()
  return remark ? remark : member.nickname
}
