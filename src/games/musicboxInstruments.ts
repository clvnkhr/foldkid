import { FrequencyHz, type Instrument } from './musicboxDomain'

// This order is persisted as selectedInstrument; retain the existing keys and indices.
export const INSTRUMENTS: Instrument[] = [
  {
    key: 'bell', type: 'sine', gain: 0.2,
    attack: 0.004, decay: 0.18, sustain: 0.82, release: 0.5,
    harmonics: [
      { ratio: 1, gain: 1, decay: 3.8 },
      { ratio: 2.01, gain: 0.44, decay: 2.4 },
      { ratio: 2.76, gain: 0.16, decay: 1.2 },
      { ratio: 4.07, gain: 0.18, decay: 0.85 },
      { ratio: 5.43, gain: 0.09, decay: 0.48 },
      { ratio: 6.79, gain: 0.04, decay: 0.3 },
    ],
  },
  {
    key: 'flute', type: 'sine', gain: 0.2,
    attack: 0.055, decay: 0.12, sustain: 0.9, release: 0.12,
    harmonics: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.16 },
      { ratio: 3, gain: 0.055 },
      { ratio: 4, gain: 0.015 },
    ],
    filterType: 'lowpass', filterFreq: FrequencyHz.unsafe(6500), filterRatio: 7, filterQ: 0.5,
    vibratoFreq: 5.1, vibratoDepth: 9, vibratoDelay: 0.18,
    noiseGain: 0.035, noiseFilterType: 'bandpass',
  },
  {
    key: 'sawtooth', type: 'sine', gain: 0.19,
    attack: 0.024, decay: 0.19, sustain: 0.72, release: 0.16,
    harmonics: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.44 },
      { ratio: 3, gain: 0.26 },
      { ratio: 4, gain: 0.17 },
      { ratio: 5, gain: 0.11 },
      { ratio: 6, gain: 0.075 },
      { ratio: 7, gain: 0.05 },
      { ratio: 8, gain: 0.035 },
    ],
    filterType: 'lowpass', filterFreq: FrequencyHz.unsafe(4800), filterRatio: 5.5, filterQ: 0.65,
  },
  {
    key: 'guitar', type: 'sine', gain: 0.23,
    attack: 0.003, decay: 0.12, sustain: 0.85, release: 0.18,
    harmonics: [
      { ratio: 1, gain: 1, decay: 2.2 },
      { ratio: 2, gain: 0.48, decay: 1.6 },
      { ratio: 3, gain: 0.26, decay: 1.05 },
      { ratio: 4, gain: 0.13, decay: 0.68 },
      { ratio: 5, gain: 0.085, decay: 0.45 },
      { ratio: 6, gain: 0.055, decay: 0.32 },
    ],
    filterType: 'lowpass', filterFreq: FrequencyHz.unsafe(7500), filterRatio: 9, filterQ: 0.55,
    noiseGain: 0.07, noiseDuration: 0.028, noiseFilterType: 'highpass',
  },
]

export interface VoicePartial {
  readonly frequency: number
  readonly gain: number
  readonly decay?: number
}

/** A bounded, normalized spectrum for any keyboard register and audio sample rate. */
export const voicePartials = (instrument: Instrument, frequency: number, sampleRate: number): readonly VoicePartial[] => {
  if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) return []
  const partials = instrument.harmonics.slice(0, 12).filter(partial =>
    Number.isFinite(partial.ratio) && partial.ratio > 0 && Number.isFinite(partial.gain) && partial.gain > 0 &&
    frequency * partial.ratio < sampleRate * 0.45,
  )
  const total = partials.reduce((sum, partial) => sum + partial.gain, 0)
  const tonalShare = 1 - Math.min(0.2, Math.max(0, instrument.noiseGain ?? 0))
  return partials.map(partial => ({
    frequency: frequency * partial.ratio,
    gain: partial.gain / total * tonalShare,
    ...(partial.decay === undefined ? {} : { decay: partial.decay }),
  }))
}

export const envelopeLevel = (instrument: Instrument, elapsed: number): number => {
  if (elapsed <= 0) return 0
  if (elapsed < instrument.attack) return instrument.gain * elapsed / instrument.attack
  if (elapsed < instrument.attack + instrument.decay) {
    const progress = (elapsed - instrument.attack) / instrument.decay
    return instrument.gain * (1 + (instrument.sustain - 1) * progress)
  }
  return instrument.gain * instrument.sustain
}
