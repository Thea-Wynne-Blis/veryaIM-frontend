/**
 * 接口数据 → 聊天界面视图模型。
 *
 * <p>WorkspacePage 之前把这些转换写成页面里的十几个小函数（sortCards、toConversation、
 * attachmentOf、authorOf、replyOf …），既占了页面一半篇幅，又完全测不了。
 * 这里统一收成纯函数：输入接口 DTO 与必要上下文，输出渲染用的 Conversation / ChatMessage。</p>
 */
import { parseJson, sameId, type ConversationCard, type Id, type MessageView } from '../api/client'
import type { Attachment, ChatMessage, Conversation } from '../types/chat'
import { clockTime, conversationPreview, humanBytes, initialsOf, listTime, toneOf, toneOfConversation } from './present'
import { decodeMessageContent } from './message'
import { memberDisplayName, type ChatMember } from './member'

/** 会话列表渲染所需的用户上下文。 */
export type ConversationViewOptions = {
  /** 当前用户 ID：群聊预览里判断「我」 */
  myId: Id | null | undefined
  pinnedIds: string[]
  mutedIds: string[]
  /** 单聊对端在线状态来自成员缓存，按会话取 */
  membersOf: (conversationId: string) => ChatMember[] | undefined
}

function cardTime(card: ConversationCard): number {
  return new Date(card.lastMessageAt ?? card.updatedAt).getTime() || 0
}

/** 置顶优先，其余按最后消息时间倒序（没有消息时回落更新时间）。 */
export function sortConversationCards(
  cards: ConversationCard[],
  pinnedIds: string[],
): ConversationCard[] {
  return [...cards].sort((a, b) => {
    const pinnedA = pinnedIds.includes(a.conversationId) ? 1 : 0
    const pinnedB = pinnedIds.includes(b.conversationId) ? 1 : 0
    if (pinnedA !== pinnedB) return pinnedB - pinnedA
    return cardTime(b) - cardTime(a)
  })
}

export function presenceOf(card: ConversationCard, options: ConversationViewOptions): Conversation['presence'] {
  if (card.type !== 'PRIVATE') return 'offline'
  const peer = options.membersOf(card.conversationId)?.find(
    (member) => !sameId(member.userId, options.myId),
  )
  return peer?.online ? 'online' : 'offline'
}

/** 会话卡片 → 列表/详情用的会话模型。 */
export function toConversation(
  card: ConversationCard,
  options: ConversationViewOptions,
): Conversation {
  const group = card.type === 'GROUP'
  return {
    id: card.conversationId,
    name: card.title,
    initials: initialsOf(card.title),
    kind: group ? 'group' : 'direct',
    tone: toneOfConversation(card),
    presence: presenceOf(card, options),
    unread: card.unreadCount,
    time: listTime(card.lastMessageAt ?? card.updatedAt),
    preview: conversationPreview(
      group ? 'group' : 'direct',
      card.lastMessageType === 'SYSTEM' ? '' : card.lastMessagePreview,
      card.lastMessageSenderName,
      sameId(card.lastMessageSenderId ?? '', options.myId ?? ''),
    ),
    members: card.memberCount,
    context: group ? `群聊 · ${card.memberCount} 位成员` : '单聊',
    pinned: options.pinnedIds.includes(card.conversationId),
    muted: options.mutedIds.includes(card.conversationId),
    peerId: card.type === 'PRIVATE' && card.peerUserId ? String(card.peerUserId) : undefined,
  }
}

/** 会话列表：排序 + 转换一次完成。 */
export function buildConversations(
  cards: ConversationCard[],
  options: ConversationViewOptions,
): Conversation[] {
  return sortConversationCards(cards, options.pinnedIds).map((card) => toConversation(card, options))
}

/* ---------- 消息 ---------- */

/** 消息类型 → 附件种类；非附件消息返回 undefined。 */
export function attachmentKindOf(type: string): Attachment['kind'] | undefined {
  if (type === 'IMAGE') return 'image'
  if (type === 'VIDEO') return 'video'
  if (type === 'AUDIO') return 'audio'
  if (type === 'FILE') return 'file'
  return undefined
}

/** 附件消息的 content 是 JSON 快照；解析失败时退化成只有种类的占位。 */
export function attachmentOf(item: MessageView): Attachment | undefined {
  if (item.recalled) return undefined
  const kind = attachmentKindOf(item.type)
  if (!kind) return undefined
  const content = decodeMessageContent(item.content, item.contentEncoding)
  try {
    const data = parseJson<{
      fileId?: Id
      fileName?: string
      name?: string
      sizeBytes?: number
      width?: number
      height?: number
      contentType?: string
      coverFileId?: Id
      thumbnailFileId?: Id
      durationSeconds?: number
    }>(content)
    const fileId = data.fileId ? String(data.fileId) : undefined
    const name = data.fileName || data.name || `文件 ${fileId || ''}`.trim()
    const poster = data.coverFileId ?? data.thumbnailFileId
    return {
      name,
      size: humanBytes(Number(data.sizeBytes ?? 0)),
      kind,
      fileId,
      width: Number(data.width) || undefined,
      height: Number(data.height) || undefined,
      posterId: poster ? String(poster) : undefined,
      duration: Number(data.durationSeconds) || undefined,
      contentType: data.contentType,
      animated: kind === 'image' && (data.contentType ?? '').toLowerCase() === 'image/gif',
    }
  } catch {
    return {
      name: kind === 'image' ? '图片' : kind === 'video' ? '视频' : kind === 'audio' ? '语音' : '文件',
      size: '',
      kind,
    }
  }
}

/** 发送者显示名：自己 → 我，群聊 → 好友备注/群昵称，单聊 → 会话标题。 */
export function authorNameOf(
  item: MessageView,
  card: ConversationCard | null,
  members: ChatMember[],
  myId: Id | null | undefined,
): string {
  if (sameId(item.senderId, myId)) return '我'
  if (card?.type === 'GROUP') {
    const member = members.find((entry) => sameId(entry.userId, item.senderId))
    return member ? memberDisplayName(member) : `成员 ${item.senderId}`
  }
  return card?.title ?? '对方'
}

/** 引用块显示被引用消息的发送者：单聊里只有「我 / 对方」。 */
export function senderNameOf(
  id: Id | null | undefined,
  card: ConversationCard | null,
  members: ChatMember[],
  myId: Id | null | undefined,
): string {
  if (sameId(id, myId)) return '我'
  if (card?.type === 'GROUP') {
    const member = members.find((entry) => sameId(entry.userId, id))
    return member ? memberDisplayName(member) : `成员 ${id}`
  }
  return card?.title ?? '对方'
}

export function replyOf(
  item: MessageView,
  card: ConversationCard | null,
  members: ChatMember[],
  myId: Id | null | undefined,
): ChatMessage['replyTo'] {
  if (!item.replyToId || !item.replyPreview) return null
  return {
    messageId: String(item.replyToId),
    author: senderNameOf(item.replySenderId, card, members, myId),
    preview: item.replyPreview,
  }
}

export type MessageViewOptions = {
  myId: Id | null | undefined
  /** 当前会话卡片：单聊用标题、群聊用于找成员备注 */
  conversation: ConversationCard | null
  members: ChatMember[]
  /** 对方已读到的序号（自己发的消息据此显示已读） */
  peerReadSeq: (conversationId: string) => number
}

/** 消息 DTO 列表 → 气泡渲染模型。 */
export function buildChatMessages(
  items: MessageView[],
  options: MessageViewOptions,
): ChatMessage[] {
  const { myId, conversation, members, peerReadSeq } = options
  return items.map((item) => {
    const mine = sameId(item.senderId, myId)
    const author = authorNameOf(item, conversation, members, myId)
    const peerSeq = peerReadSeq(item.conversationId)
    const attachment = attachmentOf(item)
    const content = decodeMessageContent(item.content, item.contentEncoding)
    return {
      id: String(item.messageId),
      author,
      initials: mine ? '我' : initialsOf(author),
      tone: mine ? 'jade' : toneOf(item.senderId),
      side: mine ? 'out' : 'in',
      time: clockTime(item.createdAt),
      text: item.recalled ? '消息已撤回' : content,
      attachment,
      image: attachment?.kind === 'image',
      read: mine && !!peerSeq && item.seq <= peerSeq,
      recalled: !!item.recalled,
      messageId: String(item.messageId),
      clientMsgId: item.clientMsgId ?? null,
      senderId: String(item.senderId),
      type: item.type,
      raw: content,
      seq: item.seq,
      mine,
      createdAt: item.createdAt,
      pending: item.pending,
      replyTo: replyOf(item, conversation, members, myId),
    }
  })
}
