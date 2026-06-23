import { describe, expect, it } from 'vitest'
import * as PhonemeGarden from './phonemeGarden'

describe('Phoneme Garden', () => {
  it('starts with no flipped cards and a stored audio file for each phoneme', () => {
    const model = PhonemeGarden.init()

    expect(model.flippedIds).toEqual([])
    expect(PhonemeGarden.PHONEME_CARDS.length).toBeGreaterThan(0)
    expect(PhonemeGarden.PHONEME_CARDS.every(card => card.audioSrc.includes('/audio/phonemes/'))).toBe(true)
    expect(PhonemeGarden.PHONEME_CARDS.every(card => card.audioSrc.endsWith('.m4a'))).toBe(true)
  })

  it('flips a card and plays the IPA recording', () => {
    const card = PhonemeGarden.PHONEME_CARDS[0]
    if (!card) throw new Error('expected a phoneme card')
    const [next, cmds] = PhonemeGarden.update(PhonemeGarden.init(), PhonemeGarden.ClickedCard({ id: card.id }))

    expect(next.flippedIds).toEqual([card.id])
    expect(cmds).toHaveLength(1)
    expect(cmds[0]?.name).toBe('PlayAudioFile')
    expect(cmds[0]?.args).toEqual({ src: card.audioSrc })
  })

  it('speaks the example word and flips back to the phoneme', () => {
    const card = PhonemeGarden.PHONEME_CARDS[0]
    if (!card) throw new Error('expected a phoneme card')
    const [next, cmds] = PhonemeGarden.update(
      { flippedIds: [card.id] },
      PhonemeGarden.ClickedExample({ id: card.id }),
    )

    expect(next.flippedIds).toEqual([])
    expect(cmds).toHaveLength(1)
    expect(cmds[0]?.name).toBe('Speak')
  })

  it('does not play audio while muted', () => {
    const card = PhonemeGarden.PHONEME_CARDS[0]
    if (!card) throw new Error('expected a phoneme card')
    const [next, cmds] = PhonemeGarden.update(PhonemeGarden.init(), PhonemeGarden.ClickedCard({ id: card.id }), true)

    expect(next.flippedIds).toEqual([card.id])
    expect(cmds).toEqual([])
  })
})
