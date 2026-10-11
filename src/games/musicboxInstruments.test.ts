import { describe, expect, it } from 'vitest'
import { INSTRUMENTS, envelopeLevel, voicePartials } from './musicboxInstruments'
import type { Instrument } from './musicboxDomain'

describe('Music Box instrument voices', () => {
  it('preserves the persisted instrument keys and order', () => {
    expect(INSTRUMENTS.map(instrument => instrument.key)).toEqual(['bell', 'flute', 'sawtooth', 'guitar'])
  })

  it('gives every instrument a distinct, finite spectrum with headroom for chords', () => {
    const spectra = INSTRUMENTS.map(instrument => {
      const partials = voicePartials(instrument, 440, 44100)
      expect(partials.length).toBeGreaterThan(0)
      expect(partials.length).toBeLessThanOrEqual(12)
      expect(partials.every(partial => Number.isFinite(partial.frequency) && partial.gain > 0)).toBe(true)
      const peak = partials.reduce((sum, partial) => sum + partial.gain, instrument.noiseGain ?? 0)
      expect(peak).toBeCloseTo(1)
      expect(instrument.gain * peak).toBeLessThanOrEqual(0.23)
      expect(instrument.attack).toBeGreaterThan(0)
      expect(instrument.release).toBeGreaterThan(0)
      return JSON.stringify(partials)
    })
    expect(new Set(spectra).size).toBe(INSTRUMENTS.length)
    expect(INSTRUMENTS[0]!.harmonics.some(partial => !Number.isInteger(partial.ratio))).toBe(true)
    expect(INSTRUMENTS[1]!.vibratoDepth).toBeLessThan(15)
    expect(INSTRUMENTS[2]!.type).toBe('sine')
    expect(INSTRUMENTS[2]!.filterType).toBe('lowpass')
    expect(INSTRUMENTS[3]!.harmonics.every(partial => partial.decay !== undefined)).toBe(true)
  })

  it('drops harmonics near Nyquist and renormalizes the audible spectrum', () => {
    const bell = INSTRUMENTS[0]!
    const partials = voicePartials(bell, 8372, 22050)
    expect(partials).toHaveLength(1)
    expect(partials[0]!.frequency).toBe(8372)
    expect(partials[0]!.gain).toBe(1)
    expect(voicePartials(bell, 15804, 22050)).toEqual([])
  })

  it('bounds malformed or oversized spectra without emitting invalid gain values', () => {
    const instrument: Instrument = {
      ...INSTRUMENTS[0]!,
      harmonics: [
        { ratio: -1, gain: 1 }, { ratio: NaN, gain: 1 }, { ratio: 1, gain: Infinity },
        ...Array.from({ length: 30 }, (_, i) => ({ ratio: i + 1, gain: 1 })),
      ],
    }
    const partials = voicePartials(instrument, 100, 44100)
    expect(partials).toHaveLength(9)
    expect(partials.reduce((sum, partial) => sum + partial.gain, 0)).toBeCloseTo(1)
    for (const frequency of [-1, 0, NaN, Infinity]) expect(voicePartials(instrument, frequency, 44100)).toEqual([])
    for (const sampleRate of [-1, 0, NaN, Infinity]) expect(voicePartials(instrument, 100, sampleRate)).toEqual([])
  })

  it('evaluates the same linear attack and decay used for clickless early release', () => {
    const instrument = { ...INSTRUMENTS[1]!, gain: 0.2, attack: 0.1, decay: 0.2, sustain: 0.5 }
    expect(envelopeLevel(instrument, -1)).toBe(0)
    expect(envelopeLevel(instrument, 0)).toBe(0)
    expect(envelopeLevel(instrument, 0.05)).toBeCloseTo(0.1)
    expect(envelopeLevel(instrument, 0.1)).toBe(0.2)
    expect(envelopeLevel(instrument, 0.2)).toBeCloseTo(0.15)
    expect(envelopeLevel(instrument, 2)).toBe(0.1)
    expect(envelopeLevel({ ...instrument, attack: 0, decay: 0 }, 0.01)).toBe(0.1)
  })
})
