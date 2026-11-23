import type { Conversation } from '../types/chat'

/** 成员的最小信息：成员接口与 props 传进来的结构不完全一样，这里只取需要的字段。 */
export type MentionMember = {
  userId: string | number
  nickname: string
  remark?: string | null
}

/** @ 面板里的一行：id 用于 key，label 是插入文本里显示的名字（备注优先）。 */
export type MentionCandidate = {
  id: string
  label: string
}

/**
 * 可提及的人：
 *
 * <ul>
 *   <li>群聊取成员列表，排除自己；</li>
 *   <li>单聊不需要额外请求，直接把会话对端当作唯一候选；</li>
 *   <li>成员还没加载好时返回空数组，面板显示占位文案。</li>
 * </ul>
 */
export function mentionCandidates(
  conversation: Conversation | null | undefined,
  members: readonly MentionMember[],
  selfId: string,
): MentionCandidate[] {
  const others = members
    .filter((member) => String(member.userId) !== selfId)
    .map((member) => ({
      id: String(member.userId),
      label: member.remark?.trim() || member.nickname,
    }))
  if (others.length) return others
  if (conversation?.kind === 'direct' && conversation.name) {
    return [{ id: String(conversation.peerId ?? 'peer'), label: conversation.name }]
  }
  return []
}
