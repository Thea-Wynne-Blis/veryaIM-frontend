import type { LinePrefixKind } from '../utils/markdownEdit'

/** 笔记工具栏发出的命令，NotesView 负责落到正文上。 */
export type NotesCommand =
  | { kind: 'heading'; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { kind: 'wrap'; mark: 'bold' | 'italic' | 'strike' | 'code' }
  | { kind: 'prefix'; prefix: LinePrefixKind }
  | { kind: 'codeBlock'; language: string }
  | { kind: 'fenceLanguage'; language: string }
  | { kind: 'table' }
  | { kind: 'link' }
  | { kind: 'image' }
  | { kind: 'rule' }

export type NotesHelpTab = 'syntax' | 'outline' | 'shortcuts'
