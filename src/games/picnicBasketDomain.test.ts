import { Schema as S } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../i18n'
import { DEFAULT_SEED, Food, FOODS, generateOrder, type OrderLength } from './picnicBasketDomain'

afterEach(() => vi.restoreAllMocks())
describe('Picnic Basket order generation', () => {
  it('has sixteen distinct food pictures and a localized name for every food', () => {
    expect(FOODS).toHaveLength(16)
    expect(new Set(FOODS.map(food => food.id)).size).toBe(16)
    expect(new Set(FOODS.map(food => food.emoji)).size).toBe(16)
    for (const food of FOODS) {
      expect(S.is(Food)(food.id)).toBe(true)
      for (const language of ['en', 'zh', 'fr', 'de', 'fa', 'ms', 'zh-HK', 'ja']) expect(t(food.labelKey, language).trim()).not.toBe('')
    }
    expect(S.is(Food)('kiwi')).toBe(false)
  })

  it.each([2, 3] as const)('generates 1,000 orders of %s unique foods from six unique choices', length => {
    let seed = DEFAULT_SEED
    const foods = new Set<Food>()
    const orders = new Set<string>()
    for (let index = 0; index < 1000; index++) {
      const round = generateOrder(seed, length)
      expect(round.choices).toHaveLength(6)
      expect(new Set(round.choices).size).toBe(6)
      expect(round.order).toHaveLength(length)
      expect(new Set(round.order).size).toBe(length)
      for (const food of round.order) { expect(round.choices).toContain(food); foods.add(food) }
      expect(Number.isSafeInteger(round.rngSeed)).toBe(true)
      expect(round.rngSeed).toBeGreaterThanOrEqual(0)
      expect(round.rngSeed).toBeLessThanOrEqual(0xffffffff)
      orders.add(round.order.join(','))
      seed = round.rngSeed
    }
    expect(foods.size).toBe(16)
    expect(orders.size).toBeGreaterThan(100)
  })

  it('is deterministic and never reads a global random source', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('global randomness') })
    const before = JSON.stringify(FOODS)
    expect(generateOrder(DEFAULT_SEED, 3)).toEqual(generateOrder(DEFAULT_SEED, 3))
    expect(generateOrder(DEFAULT_SEED + 1, 3)).not.toEqual(generateOrder(DEFAULT_SEED, 3))
    expect(JSON.stringify(FOODS)).toBe(before)
    expect(random).not.toHaveBeenCalled()
  })

  it.each([-1, .5, NaN, Infinity, 0x100000000])('normalizes invalid generation seed %s', seed => {
    expect(generateOrder(seed, 3)).toEqual(generateOrder(DEFAULT_SEED, 3))
  })

  it('safely uses three foods for an unsupported requested length', () => {
    expect(generateOrder(DEFAULT_SEED, 4 as OrderLength).order).toHaveLength(3)
  })
})
