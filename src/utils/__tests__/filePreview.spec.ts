import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { decodePreviewText, previewKind, readOfficePreview } from '../filePreview'

const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strToU8(value)])))

describe('文件预览', () => {
  it('识别 MIME 或扩展名，并将 HTML、SVG 作为文字展示', () => {
    expect(previewKind({ name: '说明.PDF', contentType: 'application/octet-stream' })).toBe('pdf')
    expect(previewKind({ name: '文件', contentType: 'image/jpeg' })).toBe('image')
    expect(previewKind({ name: '表格.xlsx' })).toBe('xlsx')
    expect(previewKind({ name: '网页.html' })).toBe('text')
    expect(previewKind({ name: '图标.svg', contentType: 'image/svg+xml' })).toBe('text')
    expect(previewKind({ name: '程序.exe' })).toBe('unsupported')
  })
  it('读取中文、UTF-16 和空文件', () => {
    expect(decodePreviewText(strToU8('你好，设计说明'))).toBe('你好，设计说明')
    expect(decodePreviewText(new Uint8Array([255, 254, 65, 0, 66, 0]))).toBe('AB')
    expect(decodePreviewText(new Uint8Array())).toBe('')
  })
  it('提取 Word 文字，不把内容当作 HTML 执行', async () => {
    const data = zip({ 'word/document.xml': '<w:document xmlns:w="urn:word"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>产品交付说明</w:t></w:r></w:p><w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt;</w:t></w:r></w:p></w:body></w:document>' })
    const result = await readOfficePreview(data, 'docx')
    expect(result.paragraphs).toEqual([{ text: '产品交付说明', heading: true }, { text: '<script>alert(1)</script>', heading: false }])
  })
  it('读取多个工作表、共享文字、稀疏列与公式结果', async () => {
    const data = zip({
      'xl/workbook.xml': '<workbook xmlns:r="urn:relationships"><sheets><sheet name="计划" r:id="rId1"/><sheet name="预算" r:id="rId2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>设计</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="C1"><f>2+3</f><v>5</v></c></row></sheetData></worksheet>',
      'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>完成</t></is></c></row></sheetData></worksheet>',
    })
    const result = await readOfficePreview(data, 'xlsx')
    expect(result.sheets?.[0]).toEqual({ name: '计划', rows: [['设计', '', '5']] })
    expect(result.sheets?.[1]?.rows).toEqual([['完成']])
  })
  it('按页码读取演示文稿，压缩包仅展示条目', async () => {
    const data = zip({ 'ppt/slides/slide2.xml': '<slide><p><t>第二页</t></p></slide>', 'ppt/slides/slide1.xml': '<slide><p><t>第一页</t></p></slide>', 'notes.txt': '备忘' })
    expect((await readOfficePreview(data, 'pptx')).slides).toEqual([['第一页'], ['第二页']])
    expect((await readOfficePreview(data, 'zip')).entries?.map(entry => entry.name)).toContain('notes.txt')
  })
  it('取消任务后不继续提取文件', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(readOfficePreview(zip({ 'notes.txt': '备忘' }), 'zip', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
