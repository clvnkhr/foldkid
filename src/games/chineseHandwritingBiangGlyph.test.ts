import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { html } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { BIANG_GLYPH_PATH, BIANG_GLYPH_VIEWBOX, renderBiangGlyph } from './chineseHandwritingBiangGlyph'

const update = (model: null, _message: never) => [model, []] as const
const view = () => renderBiangGlyph(html<never>())

describe('font-independent filled Biang glyph', () => {
  it('keeps the verified simplified vector outline intact rather than drawing miniature guide tubes', () => {
    expect(BIANG_GLYPH_VIEWBOX).toBe('106 -106 512 512')
    expect(createHash('sha256').update(BIANG_GLYPH_PATH).digest('hex')).toBe('596d9fe4249272910cbca0635bb5b9a0ff70c02799479272e976e0da0ea94a72')
    expect(BIANG_GLYPH_PATH).not.toMatch(/[^MmLlHhVvCcSsQqTtAaZzEe0-9+.,\s-]/u)
    expect(BIANG_GLYPH_PATH.length).toBeLessThan(7500)
  })

  it('renders one crisp current-color outline without images, font text, or remote resources', () => {
    Scene.scene({ update, view }, Scene.with(null),
      Scene.expect(Scene.selector('svg')).toHaveAttr('viewBox', BIANG_GLYPH_VIEWBOX),
      Scene.expect(Scene.selector('svg')).toHaveAttr('class', 'chinese-handwriting-biang-glyph'),
      Scene.expect(Scene.selector('svg')).toHaveAttr('aria-hidden', 'true'),
      Scene.expect(Scene.selector('svg')).toHaveAttr('focusable', 'false'),
      Scene.expectAll(Scene.all.selector('path')).toHaveCount(1),
      Scene.expect(Scene.selector('path')).toHaveAttr('d', BIANG_GLYPH_PATH),
      Scene.expect(Scene.selector('path')).toHaveAttr('fill', 'currentColor'),
      Scene.expect(Scene.selector('path')).toHaveAttr('stroke', 'none'),
      ...['text', 'img', 'image', 'use', 'foreignObject', '[href]', '[src]'].map(selector => Scene.expectAll(Scene.all.selector(selector)).toBeEmpty()),
      Scene.Command.expectNone(),
    )
  })

  it('ships authorship, source hashes, adaptation notes, and the original outline license', () => {
    const source = readFileSync('public/chinese-handwriting/BiangGlyph.SOURCES.md', 'utf8')
    for (const value of ['LiliCharlie', 'Cangjie6', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/',
      '37b44803a0081256148e4c8c27f7e618c4f6abf01dee40ce55fbf16bb06b514c', 'metadata', 'currentColor']) expect(source).toContain(value)
    expect(readFileSync('public/chinese-handwriting/CC-BY-SA-4.0.txt', 'utf8')).toContain('Attribution-ShareAlike 4.0 International')
  })
})
