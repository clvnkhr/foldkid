import { describe, expect, it } from 'vitest'
import { Story } from 'foldkit/test'
import * as Memory from './memory'
import * as FindIt from './findit'

const matchingIds = (model: Memory.Model): [number, number] => {
  const first = model.deck[0]
  if (!first) throw new Error('expected first card')
  const match = model.deck.find(card => card.id !== first.id && card.pairId === first.pairId)
  if (!match) throw new Error('expected matching card')
  return [first.id, match.id]
}

const mismatchedIds = (model: Memory.Model): [number, number, number] => {
  const first = model.deck[0]
  if (!first) throw new Error('expected first card')
  const second = model.deck.find(card => card.pairId !== first.pairId)
  const third = model.deck.find(card => card.id !== first.id && card.id !== second?.id)
  if (!second || !third) throw new Error('expected mismatched cards')
  return [first.id, second.id, third.id]
}

describe('Memory Cards', () => {
  it('starts with a face-down deck of pairs', () => {
    const model = Memory.init()

    expect(model.deck).toHaveLength(12)
    expect(model.deck.every(card => !card.flipped && !card.matched)).toBe(true)
    expect(new Set(model.deck.map(card => card.pairId)).size).toBe(6)
    expect(model.enabledPacks).toEqual(FindIt.DEFAULT_EMOJI_PACK_KEYS)
  })

  it('marks a matching pair and counts one attempt', () => {
    const initial = Memory.init()
    const [firstId, secondId] = matchingIds(initial)

    Story.story(
      Memory.update,
      Story.with(initial),
      Story.message(Memory.ClickedCard({ id: firstId })),
      Story.message(Memory.ClickedCard({ id: secondId })),
      Story.model(model => {
        expect(model.attempts).toBe(1)
        expect(model.deck.find(card => card.id === firstId)?.matched).toBe(true)
        expect(model.deck.find(card => card.id === secondId)?.matched).toBe(true)
        expect(model.flippedIds).toEqual([])
      }),
      Story.Command.expectNone(),
    )
  })

  it('leaves mismatched cards visible until the next pick', () => {
    const initial = Memory.init()
    const [firstId, secondId, thirdId] = mismatchedIds(initial)
    const [one] = Memory.update(initial, Memory.ClickedCard({ id: firstId }))
    const [two] = Memory.update(one, Memory.ClickedCard({ id: secondId }))
    const [three] = Memory.update(two, Memory.ClickedCard({ id: thirdId }))

    expect(two.attempts).toBe(1)
    expect(two.deck.find(card => card.id === firstId)?.flipped).toBe(true)
    expect(two.deck.find(card => card.id === secondId)?.flipped).toBe(true)
    expect(three.deck.find(card => card.id === firstId)?.flipped).toBe(false)
    expect(three.deck.find(card => card.id === secondId)?.flipped).toBe(false)
    expect(three.deck.find(card => card.id === thirdId)?.flipped).toBe(true)
  })

  it('wins when every pair is matched and reset starts fresh', () => {
    const initial = Memory.init()
    const matches = [...new Set(initial.deck.map(card => card.pairId))]
      .map(pairId => initial.deck.filter(card => card.pairId === pairId).map(card => card.id))
    const won = matches.flat().reduce(
      (model, id) => Memory.update(model, Memory.ClickedCard({ id }))[0],
      initial,
    )
    const [reset] = Memory.update(won, Memory.ClickedReset())

    expect(won.won).toBe(true)
    expect(won.attempts).toBe(6)
    expect(reset.enabledPacks).toEqual(won.enabledPacks)
    expect(reset.deck.every(card => !card.flipped && !card.matched)).toBe(true)
  })

  it('builds cards from the enabled emoji packs', () => {
    const numbers = new Set(FindIt.emojiPoolForPacks(['numbers']))
    const model = Memory.init(['numbers'])

    expect(model.enabledPacks).toEqual(['numbers'])
    expect(model.deck.every(card => numbers.has(card.value))).toBe(true)
  })

  it('regenerates the deck when emoji packs change and keeps one pack enabled', () => {
    const numbersOnly = Memory.init(['numbers'])
    const [unchanged] = Memory.update(numbersOnly, Memory.SetEmojiPackEnabled({ key: 'numbers', value: false }))
    const [withFun] = Memory.update(numbersOnly, Memory.SetEmojiPackEnabled({ key: 'fun', value: true }))

    expect(unchanged).toBe(numbersOnly)
    expect(withFun.enabledPacks).toEqual(['numbers', 'fun'])
    expect(withFun.deck.every(card => !card.flipped && !card.matched)).toBe(true)
  })

  it('shuffles the generated card order', () => {
    const unshuffledPairOrder = Array.from({ length: Memory.PAIR_COUNT }, (_, pairId) => [pairId, pairId]).flat()
    const deck = Memory.buildDeck(['fun'], () => 0)

    expect(deck.map(card => card.pairId)).not.toEqual(unshuffledPairOrder)
    expect(deck).toHaveLength(Memory.PAIR_COUNT * 2)
  })
})
