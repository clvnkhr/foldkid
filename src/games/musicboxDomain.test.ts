import { describe, expect, it } from 'vitest'
import {
  buildKeyboard,
  MUSICBOX_FREQUENCIES,
  Pitch,
  transposePitch,
} from './musicboxDomain'
import { QWERTY_BLACKS, QWERTY_WHITES } from './musicboxKeyboardRuntime'

describe('musicboxDomain', () => {
  it('brands only known pitches from the frequency table', () => {
    expect(Pitch.fromString('C4', MUSICBOX_FREQUENCIES)).toBe('C4')
    expect(Pitch.fromString('not-a-note', MUSICBOX_FREQUENCIES)).toBeUndefined()
  })

  it('keeps transposition inside known frequencies', () => {
    expect(transposePitch('C4', 12, MUSICBOX_FREQUENCIES)).toBe('C5')
    expect(transposePitch('C0', -12, MUSICBOX_FREQUENCIES)).toBe('C0')
    expect(transposePitch('', 12, MUSICBOX_FREQUENCIES)).toBe('')
  })

  it('builds keyboards from known pitches only', () => {
    const keyboard = buildKeyboard('D3', 4, 0, MUSICBOX_FREQUENCIES)

    expect(keyboard.keys.map(key => key.pitch)).toEqual(['C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3'])
    expect(keyboard.keys.every(key => MUSICBOX_FREQUENCIES.has(key.pitch))).toBe(true)
  })

  it('keeps every QWERTY mapped pitch in the frequency table', () => {
    for (const key of [...QWERTY_WHITES, ...QWERTY_BLACKS]) {
      expect(MUSICBOX_FREQUENCIES.has(key.pitch)).toBe(true)
    }
  })
})
