import { describe, expect, it } from 'vitest'
import type { ConversationCard, MessageView } from '../../api/client'
import {
  attachmentOf,
  authorNameOf,
  buildChatMessages,
  buildConversations,
  replyOf,
  sortConversationCards,
  toConversation,
} from '../chatView'
import type { ChatMember } from '../member'

function card(overrides: Partial<ConversationCard> = {}): ConversationCard {
  return {
    conversationId: 'p_1_2',
    type: 'PRIVATE',
    title: 'rosy大王',
    peerUserId: '2',
    memberCount: 2,
    lastReadSeq: 0,
    lastSeq: 5,
    unreadCount: 0,
    lastMessageType: 'TEXT',
    lastMessagePreview: '在吗',
    lastMessageAt: '2026-05-20T10:00:00.000Z',
    updatedAt: '2026-05-20T10:00:00.000Z',
    lastMessageSenderId: '2',
    lastMessageSenderName: 'rosy大王',
    pinned: false,
    muted: false,
    hidden: false,
    ...overrides,
  }
}

function view(overrides: Partial<MessageView> = {}): MessageView {
  return {
    messageId: '101',
    conversationId: 'p_1_2',
    senderId: '2',
    seq: 1,
    type: 'TEXT',
    content: '你好',
    createdAt: '2026-05-20T10:00:00.000Z',
    ...overrides,
  }
}

const nobody: ChatMember[] = []

function options(overrides: Partial<Parameters<typeof toConversation>[1]> = {}) {
  return {
    myId: '1',
    pinnedIds: [],
    mutedIds: [],
    membersOf: () => nobody,
    ...overrides,
  }
}

describe('sortConversationCards', () => {
  it('置顶优先，其余按最后消息时间倒序', () => {
    const old = card({ conversationId: 'a', lastMessageAt: '2026-05-01T00:00:00.000Z' })
    const fresh = card({ conversationId: 'b', lastMessageAt: '2026-05-20T00:00:00.000Z' })
    const pinnedOld = card({ conversationId: 'c', lastMessageAt: '2026-04-01T00:00:00.000Z' })
    const sorted = sortConversationCards([old, fresh, pinnedOld], ['c'])
    expect(sorted.map((item) => item.conversationId)).toEqual(['c', 'b', 'a'])
  })

  it('没有最后消息时回落更新时间', () => {
    const noMessage = card({
      conversationId: 'a',
      lastMessageAt: null,
      updatedAt: '2026-05-25T00:00:00.000Z',
    })
    const withMessage = card({ conversationId: 'b', lastMessageAt: '2026-05-20T00:00:00.000Z' })
    expect(sortConversationCards([withMessage, noMessage], []).map((item) => item.conversationId))
      .toEqual(['a', 'b'])
  })

  it('不修改传入数组', () => {
    const list = [card({ conversationId: 'a' }), card({ conversationId: 'b' })]
    sortConversationCards(list, [])
    expect(list.map((item) => item.conversationId)).toEqual(['a', 'b'])
  })
})

describe('toConversation', () => {
  it('群聊预览带上发送者，自己发的显示「我」', () => {
    const group = card({ type: 'GROUP', conversationId: 'g_9', memberCount: 4 })
    const someone = toConversation(group, options())
    expect(someone.kind).toBe('group')
    expect(someone.preview).toBe('rosy大王：在吗')
    expect(someone.context).toBe('群聊 · 4 位成员')

    const mine = toConversation(
      card({ type: 'GROUP', lastMessageSenderId: '1', lastMessageSenderName: null }),
      options(),
    )
    expect(mine.preview).toBe('我：在吗')
  })

  it('系统消息不显示预览，单聊预览不带姓名', () => {
    expect(toConversation(card({ lastMessageType: 'SYSTEM' }), options()).preview).toBe('')
    expect(toConversation(card(), options()).preview).toBe('在吗')
  })

  it('单聊在线状态取成员缓存里的对端', () => {
    const members: ChatMember[] = [
      { userId: '1', nickname: '我', online: true },
      { userId: '2', nickname: 'rosy大王', online: true },
    ]
    const online = toConversation(card(), options({ membersOf: () => members }))
    expect(online.presence).toBe('online')
    expect(online.peerId).toBe('2')

    const offline = toConversation(card(), options({ membersOf: () => [] }))
    expect(offline.presence).toBe('offline')

    const group = toConversation(card({ type: 'GROUP' }), options({ membersOf: () => members }))
    expect(group.presence).toBe('offline')
    expect(group.peerId).toBeUndefined()
  })

  it('置顶与免打扰按本地设置', () => {
    const item = toConversation(card(), options({ pinnedIds: ['p_1_2'], mutedIds: ['p_1_2'] }))
    expect(item.pinned).toBe(true)
    expect(item.muted).toBe(true)
  })
})

describe('buildConversations', () => {
  it('排序与转换一次完成', () => {
    const older = card({ conversationId: 'a', title: '旧会话', lastMessageAt: '2026-05-01T00:00:00.000Z' })
    const newer = card({ conversationId: 'b', title: '新会话', lastMessageAt: '2026-05-20T00:00:00.000Z' })
    const built = buildConversations([older, newer], options())
    expect(built.map((item) => item.name)).toEqual(['新会话', '旧会话'])
  })
})

describe('attachmentOf', () => {
  it('解析图片快照的尺寸、封面与动图标记', () => {
    const item = view({
      type: 'IMAGE',
      content: JSON.stringify({
        fileId: '900',
        fileName: 'cat.gif',
        sizeBytes: 2048,
        width: 320,
        height: 240,
        contentType: 'image/gif',
        thumbnailFileId: '901',
      }),
    })
    expect(attachmentOf(item)).toEqual({
      name: 'cat.gif',
      size: '2.0 KB',
      kind: 'image',
      fileId: '900',
      width: 320,
      height: 240,
      posterId: '901',
      duration: undefined,
      contentType: 'image/gif',
      animated: true,
    })
  })

  it('撤回或非附件消息没有附件', () => {
    expect(attachmentOf(view())).toBeUndefined()
    expect(attachmentOf(view({ type: 'FILE', recalled: true }))).toBeUndefined()
  })

  it('内容解析失败时退化成占位名称', () => {
    const item = attachmentOf(view({ type: 'VIDEO', content: 'not-json' }))
    expect(item).toMatchObject({ kind: 'video', name: '视频', size: '' })
  })
})

describe('发送者显示名', () => {
  const members: ChatMember[] = [
    { userId: '2', nickname: '群昵称', remark: ' 卡萝 ' },
    { userId: '3', nickname: '艾琳' },
  ]

  it('群聊优先好友备注，退回落群昵称', () => {
    const group = card({ type: 'GROUP' })
    expect(authorNameOf(view({ senderId: '2' }), group, members, '1')).toBe('卡萝')
    expect(authorNameOf(view({ senderId: '3' }), group, members, '1')).toBe('艾琳')
    expect(authorNameOf(view({ senderId: '9' }), group, members, '1')).toBe('成员 9')
  })

  it('自己显示「我」，单聊显示会话标题', () => {
    expect(authorNameOf(view({ senderId: '1' }), card(), members, '1')).toBe('我')
    expect(authorNameOf(view({ senderId: '2' }), card(), members, '1')).toBe('rosy大王')
    expect(authorNameOf(view({ senderId: '2' }), null, members, '1')).toBe('对方')
  })
})

describe('replyOf', () => {
  it('只有引用了消息且带文本快照时才显示引用块', () => {
    const group = card({ type: 'GROUP' })
    const members: ChatMember[] = [{ userId: '3', nickname: '艾琳', remark: '卡萝' }]
    expect(replyOf(view(), group, members, '1')).toBeNull()

    const quote = replyOf(
      view({ replyToId: '88', replySenderId: '3', replyPreview: '原始内容' }),
      group,
      members,
      '1',
    )
    expect(quote).toEqual({ messageId: '88', author: '卡萝', preview: '原始内容' })
  })
})

describe('buildChatMessages', () => {
  it('自己发的消息标记为 out 并按对方已读序号判断已读', () => {
    const [message] = buildChatMessages([view({ senderId: '1', seq: 3 })], {
      myId: '1',
      conversation: card(),
      members: nobody,
      peerReadSeq: () => 3,
    })
    expect(message).toMatchObject({
      id: '101',
      side: 'out',
      mine: true,
      author: '我',
      initials: '我',
      read: true,
      raw: '你好',
      text: '你好',
    })
  })

  it('未读水位低于消息序号时不算已读；入站消息不显示已读', () => {
    const [mine] = buildChatMessages([view({ senderId: '1', seq: 4 })], {
      myId: '1',
      conversation: card(),
      members: nobody,
      peerReadSeq: () => 3,
    })
    expect(mine.read).toBe(false)

    const [theirs] = buildChatMessages([view({ senderId: '2', seq: 1 })], {
      myId: '1',
      conversation: card(),
      members: nobody,
      peerReadSeq: () => 99,
    })
    expect(theirs.read).toBe(false)
    expect(theirs.side).toBe('in')
  })

  it('撤回消息用占位文案且去掉附件', () => {
    const [message] = buildChatMessages(
      [view({ type: 'IMAGE', content: '{"fileId":"9"}', recalled: true, seq: 1 })],
      { myId: '1', conversation: card(), members: nobody, peerReadSeq: () => 0 },
    )
    expect(message.text).toBe('消息已撤回')
    expect(message.recalled).toBe(true)
    expect(message.attachment).toBeUndefined()
    expect(message.image).toBe(false)
  })

  it('图片消息带附件并标记 image', () => {
    const [message] = buildChatMessages(
      [view({ type: 'IMAGE', content: '{"fileId":"9","fileName":"a.png","sizeBytes":1024}' })],
      { myId: '1', conversation: card(), members: nobody, peerReadSeq: () => 0 },
    )
    expect(message.image).toBe(true)
    expect(message.attachment).toMatchObject({ fileId: '9', name: 'a.png', kind: 'image' })
  })
})
