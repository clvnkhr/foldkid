import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getCharacterLabGlyph } from './characterLabGlyphs'

describe('Character Lab font-independent component outlines', () => {
  it('preserves exactly the three verified right-hand outlines from 杨', () => {
    expect('𠃓'.codePointAt(0)).toBe(0x200d3)
    const glyph = getCharacterLabGlyph('𠃓')!
    expect(createHash('sha256').update(glyph.path).digest('hex'))
      .toBe('c489caad2c66297d468d7a6643c22d13272a75eac9eddd5a8b571148ce953b13')
    expect(glyph.path.match(/\bM\b/gu)).toHaveLength(3)
    expect(glyph.path.match(/\bZ\b/gu)).toHaveLength(3)
    expect(glyph.path).not.toMatch(/[^MLQCZ0-9\s-]/u)
    expect(glyph.path.length).toBeLessThan(1500)
  })

  it('reflects the source coordinate system and contains every curve control point with padding', () => {
    const glyph = getCharacterLabGlyph('𠃓')!
    expect(glyph.transform).toBe('scale(1 -1)')
    const [left, top, width, height] = glyph.viewBox.split(' ').map(Number) as [number, number, number, number]
    expect([left, top, width, height].every(Number.isFinite)).toBe(true)
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
    const coordinates = glyph.path.match(/-?\d+/gu)!.map(Number)
    for (let index = 0; index < coordinates.length; index += 2) {
      const x = coordinates[index]!
      const y = -coordinates[index + 1]!
      expect(x).toBeGreaterThanOrEqual(left + 20)
      expect(x).toBeLessThanOrEqual(left + width - 20)
      expect(y).toBeGreaterThanOrEqual(top + 20)
      expect(y).toBeLessThanOrEqual(top + height - 20)
    }
  })

  it('reuses an immutable glyph and leaves ordinary and unrecognized characters to platform fonts', () => {
    const glyph = getCharacterLabGlyph('𠃓')!
    expect(Object.isFrozen(glyph)).toBe(true)
    expect(getCharacterLabGlyph('𠃓')).toBe(glyph)
    for (const character of ['杨', '木', '昜', '𠃓𠃓', '', 'unknown', '__proto__']) {
      expect(getCharacterLabGlyph(character)).toBeUndefined()
    }
  })
})
