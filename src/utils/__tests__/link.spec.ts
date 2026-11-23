import { describe, expect, it } from 'vitest'
import { findLinks, linkSegments, parseLink, singleLink } from '../link'

describe('parseLink', () => {
  it('补齐协议并拆出域名与路径', () => {
    expect(parseLink('www.example.com/docs?a=1')).toMatchObject({
      href: 'https://www.example.com/docs?a=1',
      domain: 'example.com',
      path: '/docs?a=1',
    })
  })

  it('去掉句子末尾的标点', () => {
    expect(parseLink('https://example.com/x。')).toMatchObject({ href: 'https://example.com/x' })
  })

  it('拒绝非 http(s) 与非法地址', () => {
    expect(parseLink('javascript:alert(1)')).toBeNull()
    expect(parseLink('not a link')).toBeNull()
  })
})

describe('findLinks', () => {
  it('识别协议、www 和裸域名', () => {
    expect(findLinks('a https://a.com/x b www.b.cn c c.net/1').map((item) => item.link.domain))
      .toEqual(['a.com', 'b.cn', 'c.net'])
  })

  it('不把文件名和邮箱当链接', () => {
    expect(findLinks('BUG报告.doc 发给 foo@bar.com')).toEqual([])
  })
})

describe('singleLink', () => {
  it('整条消息只有一个链接时返回它', () => {
    expect(singleLink('  https://example.com/a  ')?.domain).toBe('example.com')
  })

  it('链接夹在文字里不返回', () => {
    expect(singleLink('看 https://example.com/a')).toBeNull()
    expect(singleLink('https://a.com https://b.com')).toBeNull()
  })
})

describe('linkSegments', () => {
  it('按顺序拆出文字与链接', () => {
    const segments = linkSegments('看 https://a.com/x，然后再说')
    expect(segments.map((item) => item.type)).toEqual(['text', 'link', 'text'])
    expect(segments[1]).toMatchObject({ type: 'link', text: 'https://a.com/x' })
  })

  it('没有链接时原样返回', () => {
    expect(linkSegments('普通消息')).toEqual([{ type: 'text', text: '普通消息' }])
  })
})
