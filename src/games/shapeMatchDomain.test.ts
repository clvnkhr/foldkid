import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'
import { initialRound, replaceMatchedHome, sameShapes, SHAPES } from './shapeMatchDomain'
import { Shape } from './shapeMatchShapes'

describe('continuous Shape Match generation', () => {
  it('starts with four unique homes and an available target in both modes', () => {
    for (const mode of ['simple', 'pairs'] as const) {
      const round = initialRound(mode)
      expect(round.homes).toHaveLength(4)
      expect(new Set(round.homes.map(home => home.join(','))).size).toBe(4)
      expect(round.homes[round.targetIndex]).toEqual(mode === 'simple' ? ['circle'] : ['circle', 'square'])
    }
    expect(SHAPES).toHaveLength(34)
    expect(new Set(SHAPES).size).toBe(34)
    expect([...SHAPES].sort()).toEqual([...Shape.literals].sort())
  })

  it.each(['simple', 'pairs'] as const)('asks for all 34 shapes across 3,000 %s matches while replacing only the chosen home', mode => {
    let round = initialRound(mode)
    const targets = new Set<Shape>()
    const firstShapes = new Set<Shape>()
    const secondShapes = new Set<Shape>()
    for (let index = 0; index < 3000; index++) {
      const target = round.homes[round.targetIndex]!
      target.forEach(shape => { targets.add(shape) })
      firstShapes.add(target[0]!)
      if (mode === 'pairs') secondShapes.add(target[1]!)
      const before = round
      round = replaceMatchedHome(before, mode)
      expect(round.homes).toHaveLength(4)
      expect(new Set(round.homes.map(home => home.join(','))).size).toBe(4)
      expect(round.targetIndex).toBeGreaterThanOrEqual(0)
      expect(round.targetIndex).toBeLessThan(4)
      expect(round.targetIndex).not.toBe(before.targetIndex)
      expect(round.homes[before.targetIndex]).not.toEqual(before.homes[before.targetIndex])
      expect(before.homes.some(home => sameShapes(home, round.homes[before.targetIndex]!))).toBe(false)
      for (let slot = 0; slot < 4; slot++) {
        if (slot !== before.targetIndex) expect(round.homes[slot]).toBe(before.homes[slot])
        expect(round.homes[slot]).toHaveLength(mode === 'pairs' ? 2 : 1)
        round.homes[slot]!.forEach(shape => { expect(S.is(Shape)(shape)).toBe(true) })
      }
    }
    expect([...targets].sort()).toEqual([...Shape.literals].sort())
    expect([...firstShapes].sort()).toEqual([...Shape.literals].sort())
    if (mode === 'pairs') expect([...secondShapes].sort()).toEqual([...Shape.literals].sort())
  })

  it('is deterministic for a seed and keeps its input immutable', () => {
    const initial = initialRound('pairs')
    const homes = initial.homes.map(home => Object.freeze([...home]))
    const immutable = Object.freeze({ ...initial, homes: Object.freeze(homes) })
    expect(replaceMatchedHome(immutable, 'pairs')).toEqual(replaceMatchedHome(immutable, 'pairs'))
    expect(immutable).toEqual(initial)
    expect(replaceMatchedHome({ ...initial, rngSeed: initial.rngSeed + 1 }, 'pairs')).not.toEqual(replaceMatchedHome(initial, 'pairs'))
  })

  it('keeps reversed pairs distinct and allows double shapes', () => {
    expect(sameShapes(['circle', 'square'], ['square', 'circle'])).toBe(false)
    expect(sameShapes(['circle'], ['circle', 'square'])).toBe(false)
    let round = initialRound('pairs')
    const seen = new Set(round.homes.map(home => home.join(',')))
    for (let index = 0; index < 500; index++) {
      round = replaceMatchedHome(round, 'pairs')
      round.homes.forEach(home => seen.add(home.join(',')))
    }
    expect([...seen].some(pair => { const parts = pair.split(','); return parts[0] === parts[1] })).toBe(true)
    expect(seen.has('circle,square')).toBe(true)
    expect(seen.has('square,circle')).toBe(true)
  })

  it.each([-1, .5, NaN, Infinity, 4])('safely normalizes an invalid target index %s', targetIndex => {
    expect(replaceMatchedHome({ ...initialRound('simple'), targetIndex }, 'simple')).toEqual(initialRound('simple'))
  })

  it('safely normalizes an incomplete board or invalid seed', () => {
    const initial = initialRound('pairs')
    expect(replaceMatchedHome({ ...initial, homes: [] }, 'pairs')).toEqual(initial)
    expect(replaceMatchedHome({ ...initial, rngSeed: NaN }, 'pairs')).toEqual(replaceMatchedHome(initial, 'pairs'))
  })
})
