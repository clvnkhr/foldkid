import { describe, expect, it } from 'vitest'
import { CHARACTER_LAB_FIXED_STEP as dt, CHARACTER_LAB_MAX_SPEED, constrainCharacterLabBody, stepCharacterLabPhysics, type CharacterLabBody } from './characterLabPhysics'

const body = (patch: Partial<CharacterLabBody> = {}): CharacterLabBody => ({ id: 0, character: '木', x: 100, y: 80, vx: 0, vy: 0, r: 32, angle: 0, spin: 2, held: false, readyAt: 0, ...patch })

describe('Character Lab fixed-step physics', () => {
  it('falls, rotates, bounces, and eventually settles without accumulating energy', () => {
    const piece = body({ vx: 180, spin: 5 })
    for (let tick = 0; tick < 30; tick++) stepCharacterLabPhysics([piece], 500, 420, dt)
    expect(piece.y).toBeGreaterThan(130)
    expect(piece.angle).toBeGreaterThan(.5)
    let bounced = false
    for (let tick = 0; tick < 220; tick++) { stepCharacterLabPhysics([piece], 500, 420, dt); if (piece.vy < 0) bounced = true }
    expect(bounced).toBe(true)
    for (let tick = 0; tick < 1400; tick++) stepCharacterLabPhysics([piece], 500, 420, dt)
    expect(piece.y).toBeCloseTo(388, 6)
    expect(piece.vy).toBe(0)
    expect(piece.vx).toBe(0)
    expect(piece.spin).toBe(0)
  })

  it('resolves an exact overlap deterministically into finite separated bodies', () => {
    const a = body({ id: 1, x: 250, y: 200, spin: 0 })
    const b = body({ id: 2, x: 250, y: 200, spin: 0 })
    stepCharacterLabPhysics([a, b], 500, 420, dt)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(64, 6)
    expect([a.x, a.y, b.x, b.y, a.vx, a.vy, b.vx, b.vy].every(Number.isFinite)).toBe(true)
  })

  it('allows a held body to push a loose one and imparts angular motion on a glancing collision', () => {
    const held = body({ id: 1, x: 220, y: 200, vx: 400, vy: 80, held: true, spin: 0 })
    const loose = body({ id: 2, x: 270, y: 225, spin: 0 })
    const contacts: number[][] = []
    stepCharacterLabPhysics([held, loose], 500, 420, dt, (a, b) => contacts.push([a.id, b.id]))
    expect(held.x).toBe(220)
    expect(held.y).toBe(200)
    expect(loose.x).toBeGreaterThan(270)
    expect(loose.vx).toBeGreaterThan(0)
    expect(Math.abs(loose.spin)).toBeGreaterThan(.05)
    expect(contacts).toEqual([[1, 2]])
  })

  it('detects opposing maximum-speed pieces without tunneling through each other', () => {
    const a = body({ id: 1, x: 200, y: 200, vx: CHARACTER_LAB_MAX_SPEED, spin: 0 })
    const b = body({ id: 2, x: 300, y: 200, vx: -CHARACTER_LAB_MAX_SPEED, spin: 0 })
    let contacted = false
    for (let tick = 0; tick < 8; tick++) stepCharacterLabPhysics([a, b], 600, 500, dt, () => { contacted = true })
    expect(contacted).toBe(true)
    expect(a.x).toBeLessThan(b.x)
    expect(a.vx).toBeLessThan(0)
    expect(b.vx).toBeGreaterThan(0)
  })

  it('keeps a crowded pile bounded and finite for a sustained simulation', () => {
    const pieces = Array.from({ length: 36 }, (_, id) => body({ id, x: 50 + id % 6 * 70, y: 40 + Math.floor(id / 6) * 35, spin: id % 5 - 2 }))
    for (let tick = 0; tick < 900; tick++) stepCharacterLabPhysics(pieces, 480, 620, dt)
    for (const piece of pieces) {
      expect([piece.x, piece.y, piece.vx, piece.vy, piece.angle, piece.spin].every(Number.isFinite)).toBe(true)
      expect(piece.x).toBeGreaterThanOrEqual(32)
      expect(piece.x).toBeLessThanOrEqual(448)
      expect(piece.y).toBeGreaterThanOrEqual(32)
      expect(piece.y).toBeLessThanOrEqual(588)
      expect(Math.hypot(piece.vx, piece.vy)).toBeLessThanOrEqual(CHARACTER_LAB_MAX_SPEED + .001)
    }
  })

  it('clamps into tiny boards and ignores invalid dimensions or frame intervals', () => {
    const piece = body({ x: -10, y: 1000 })
    constrainCharacterLabBody(piece, 20, 30)
    expect([piece.x, piece.y]).toEqual([10, 15])
    const before = { ...piece }
    for (const [width, height, elapsed] of [[0, 300, dt], [NaN, 300, dt], [300, -1, dt], [300, 300, Infinity], [300, 300, .2], [300, 300, 0]]) stepCharacterLabPhysics([piece], width!, height!, elapsed!)
    expect(piece).toEqual(before)
  })
})
