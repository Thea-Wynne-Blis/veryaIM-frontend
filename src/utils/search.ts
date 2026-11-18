export function highlightParts(text: string, keyword: string): { text: string; match: boolean }[] {
  const query = keyword.trim().toLocaleLowerCase()
  if (!query) return [{ text, match: false }]
  const lower = text.toLocaleLowerCase()
  const parts: { text: string; match: boolean }[] = []
  let offset = 0
  let index = lower.indexOf(query)
  while (index !== -1) {
    if (index > offset) parts.push({ text: text.slice(offset, index), match: false })
    parts.push({ text: text.slice(index, index + query.length), match: true })
    offset = index + query.length
    index = lower.indexOf(query, offset)
  }
  if (offset < text.length) parts.push({ text: text.slice(offset), match: false })
  return parts
}
