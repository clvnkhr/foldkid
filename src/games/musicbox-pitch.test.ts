import { describe, expect, it } from 'vitest'
import * as MusicBox from './musicbox'

describe('MusicBox pitch invariants', () => {
  it('all bottom keyboard pitches have frequencies', () => {
    const kb = MusicBox.buildKeyboard('C3', 8, 0)
    for (const k of kb.keys) {
      expect(MusicBox.FREQUENCIES[k.pitch]).toBeDefined()
    }
  })
})
