import type { Id } from '../api/client'

export type PreviewFile = { fileId: Id; name: string; contentType?: string | null; sizeBytes?: number | null }
export type PreviewKind = 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'docx' | 'xlsx' | 'pptx' | 'zip' | 'unsupported'

export function previewKind(file: Pick<PreviewFile, 'name' | 'contentType'>): PreviewKind {
  const type = (file.contentType ?? '').split(';')[0]!.toLowerCase()
  const ext = file.name.split('.').at(-1)?.toLowerCase() ?? ''
  if (ext === 'svg' || type.includes('svg')) return 'text'
  if (type.startsWith('image/') || /^(png|jpe?g|gif|webp|avif|bmp|ico)$/.test(ext)) return 'image'
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (type.startsWith('video/') || /^(mp4|webm|mov|m4v|ogv)$/.test(ext)) return 'video'
  if (type.startsWith('audio/') || /^(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(ext)) return 'audio'
  if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx' || ext === 'zip') return ext
  if (type.startsWith('text/') || /^(txt|md|json|csv|tsv|log|xml|html?|css|js|ts|tsx|jsx|vue|java|py|sql|ya?ml|ini|toml|sh)$/.test(ext)) return 'text'
  return 'unsupported'
}

export function decodePreviewText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return new TextDecoder('gb18030').decode(bytes) }
}

export type OfficePreview = {
  paragraphs?: { text: string; heading: boolean }[]
  sheets?: { name: string; rows: string[][] }[]
  slides?: string[][]
  entries?: { name: string; size: number }[]
  limited?: boolean
}

function xml(bytes: Uint8Array | undefined): Document {
  if (!bytes) throw new Error('文档内容不完整，无法生成预览')
  const source = new TextDecoder().decode(bytes)
  if (/<!DOCTYPE/i.test(source)) throw new Error('此文档暂不支持内容预览')
  const doc = new DOMParser().parseFromString(source, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('文档内容无法解析，请下载后查看')
  return doc
}
function nodes(parent: Document | Element, name: string): Element[] { return Array.from(parent.getElementsByTagNameNS('*', name)) }
function textOf(parent: Element): string { return nodes(parent, 't').map(node => node.textContent ?? '').join('') }

export async function readOfficePreview(bytes: Uint8Array, kind: 'docx' | 'xlsx' | 'pptx' | 'zip', signal?: AbortSignal): Promise<OfficePreview> {
  const { unzip } = await import('fflate')
  signal?.throwIfAborted()
  const entries: { name: string; size: number }[] = []
  let expanded = 0
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    let terminate: (() => void) | undefined
    const abort = () => { terminate?.(); reject(new DOMException('预览已关闭', 'AbortError')) }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      terminate = unzip(bytes, { filter: entry => {
        entries.push({ name: entry.name, size: entry.originalSize })
        if (entries.length > 4000) throw new Error('文档内容较多，请下载后查看完整内容')
        const needed = kind !== 'zip' && /^(word\/document\.xml|xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)|ppt\/slides\/slide\d+\.xml)$/.test(entry.name)
        if (!needed) return false
        expanded += entry.originalSize
        if (expanded > 24 * 1024 * 1024) throw new Error('文档内容较多，请下载后查看完整内容')
        return true
      } }, (error, result) => {
        signal?.removeEventListener('abort', abort)
        if (signal?.aborted) { abort(); return }
        if (error) reject(error)
        else resolve(result)
      })
    } catch (error) { signal?.removeEventListener('abort', abort); reject(error) }
  })
  signal?.throwIfAborted()
  if (kind === 'zip') return { entries: entries.filter(entry => !entry.name.endsWith('/')).slice(0, 300), limited: entries.length > 300 }
  if (kind === 'docx') {
    const paragraphs = nodes(xml(files['word/document.xml']), 'p').map(p => ({
      text: textOf(p), heading: /heading|title|标题/i.test(nodes(p, 'pStyle')[0]?.getAttribute('w:val') ?? ''),
    })).filter(p => p.text.trim())
    return { paragraphs: paragraphs.slice(0, 2000), limited: paragraphs.length > 2000 }
  }
  if (kind === 'pptx') {
    const names = Object.keys(files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    if (!names.length) throw new Error('未找到可预览的幻灯片内容')
    return { slides: names.slice(0, 50).map(name => nodes(xml(files[name]), 'p').map(textOf).filter(Boolean)), limited: names.length > 50 }
  }
  const shared = files['xl/sharedStrings.xml'] ? nodes(xml(files['xl/sharedStrings.xml']), 'si').map(textOf) : []
  const workbook = xml(files['xl/workbook.xml'])
  const relationships = files['xl/_rels/workbook.xml.rels'] ? nodes(xml(files['xl/_rels/workbook.xml.rels']), 'Relationship') : []
  const sheets = nodes(workbook, 'sheet')
  let limited = sheets.length > 8
  return { sheets: sheets.slice(0, 8).map((sheet, index) => {
    const id = sheet.getAttribute('r:id')
    const destination = relationships.find(rel => rel.getAttribute('Id') === id)?.getAttribute('Target')
    const name = destination ? (destination.startsWith('/') ? destination.slice(1) : `xl/${destination.replace(/^\.\//, '')}`) : `xl/worksheets/sheet${index + 1}.xml`
    const rows = nodes(xml(files[name]), 'row')
    if (rows.length > 200) limited = true
    return { name: sheet.getAttribute('name') ?? `工作表 ${index + 1}`, rows: rows.slice(0, 200).map(row => {
      const values: string[] = []
      for (const cell of nodes(row, 'c')) {
        const column = (cell.getAttribute('r') ?? '').replace(/\d/g, '')
        const position = column ? [...column].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1 : values.length
        if (position >= 40) { limited = true; continue }
        const value = nodes(cell, 'v')[0]?.textContent ?? ''
        const type = cell.getAttribute('t')
        values[position] = type === 's' ? shared[Number(value)] ?? '' : type === 'inlineStr' ? textOf(cell)
          : type === 'b' ? value === '1' ? 'TRUE' : 'FALSE' : value || (nodes(cell, 'f')[0]?.textContent ? `=${nodes(cell, 'f')[0]!.textContent}` : '')
      }
      return Array.from({ length: values.length }, (_, i) => values[i] ?? '')
    }) }
  }), get limited() { return limited } }
}
