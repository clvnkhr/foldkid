import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as MusicBox from './musicbox'

const resolvePianoTop = [{ name: 'piano-top' as const }, MusicBox.NoteOn({ pitch: 'C4' })] as const
const resolvePianoBot = [{ name: 'piano-bot' as const }, MusicBox.NoteOn({ pitch: 'C3' })] as const
const resolveMount = [resolvePianoTop]

describe('MusicBox', () => {
  it('init state', () => {
    expect(MusicBox.init()).toStrictEqual({
      selectedSong: 0, selectedInstrument: 0, isPlaying: false,
      whiteKeys: 8, showBottomKeyboard: false, octaveOffset: 0, bottomShift: 0, topShift: 0, tempo: 1, lyricsExpanded: false,
    })
  })

  describe('message handlers', () => {
    it('NoteOn leaves model unchanged', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.NoteOn({ pitch: 'C4' })),
        Story.model((model) => {
          expect(model).toStrictEqual(MusicBox.init())
        }),
        Story.Command.expectNone(),
      )
    })

    it('NoteOff leaves model unchanged', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.NoteOff({ pitch: 'C4' })),
        Story.model((model) => {
          expect(model).toStrictEqual(MusicBox.init())
        }),
        Story.Command.expectNone(),
      )
    })

    it('SetSong updates selectedSong', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.SetSong({ value: 2 })),
        Story.model((model) => {
          expect(model.selectedSong).toBe(2)
        }),
        Story.Command.expectNone(),
      )
    })

    it('SetInstrument updates selectedInstrument', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.SetInstrument({ value: 3 })),
        Story.model((model) => {
          expect(model.selectedInstrument).toBe(3)
        }),
        Story.Command.expectNone(),
      )
    })

    it('Play sets isPlaying and produces a command', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.Play()),
        Story.model((model) => {
          expect(model.isPlaying).toBe(true)
        }),
        Story.Command.resolveAll(
          [{ name: 'PlayMusicBox' }, MusicBox.SongEnded()],
        ),
        Story.model((model) => {
          expect(model.isPlaying).toBe(false)
        }),
        Story.Command.expectNone(),
      )
    })

    it('Stop sets isPlaying to false', () => {
      Story.story(
        MusicBox.update,
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, }),
        Story.message(MusicBox.Stop()),
        Story.model((model) => {
          expect(model.isPlaying).toBe(false)
        }),
        Story.Command.expectNone(),
      )
    })

    it('ToggleLyrics toggles lyricsExpanded', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.ToggleLyrics()),
        Story.model((model) => {
          expect(model.lyricsExpanded).toBe(true)
        }),
        Story.Command.expectNone(),
      )
    })

    it('ToggleLyrics toggles back to false', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), lyricsExpanded: true }),
        Story.message(MusicBox.ToggleLyrics()),
        Story.model((model) => {
          expect(model.lyricsExpanded).toBe(false)
        }),
        Story.Command.expectNone(),
      )
    })

    it('SongEnded sets isPlaying to false', () => {
      Story.story(
        MusicBox.update,
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, }),
        Story.message(MusicBox.SongEnded()),
        Story.model((model) => {
          expect(model.isPlaying).toBe(false)
        }),
        Story.Command.expectNone(),
      )
    })

    it('AddKey increments whiteKeys', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.AddKey()),
        Story.model((model) => {
          expect(model.whiteKeys).toBe(9)
        }),
        Story.Command.expectNone(),
      )
    })

    it('RemoveKey decrements whiteKeys', () => {
      Story.story(
        MusicBox.update,
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: 12, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, }),
        Story.message(MusicBox.RemoveKey()),
        Story.model((model) => {
          expect(model.whiteKeys).toBe(11)
        }),
        Story.Command.expectNone(),
      )
    })

    it('AddKey is capped at MAX_WHITE_KEYS', () => {
      Story.story(
        MusicBox.update,
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MAX_WHITE_KEYS, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, }),
        Story.message(MusicBox.AddKey()),
        Story.model((model) => {
          expect(model.whiteKeys).toBe(MusicBox.MAX_WHITE_KEYS)
        }),
        Story.Command.expectNone(),
      )
    })

    it('RemoveKey is capped at MIN_WHITE_KEYS', () => {
      Story.story(
        MusicBox.update,
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MIN_WHITE_KEYS, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, }),
        Story.message(MusicBox.RemoveKey()),
        Story.model((model) => {
          expect(model.whiteKeys).toBe(MusicBox.MIN_WHITE_KEYS)
        }),
        Story.Command.expectNone(),
      )
    })

    it('AddKey works at boundary MAX_WHITE_KEYS - 1', () => {
      Story.story(
        MusicBox.update,
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MAX_WHITE_KEYS - 1, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, }),
        Story.message(MusicBox.AddKey()),
        Story.model((model) => {
          expect(model.whiteKeys).toBe(MusicBox.MAX_WHITE_KEYS)
        }),
        Story.Command.expectNone(),
      )
    })

    it('RemoveKey works at boundary MIN_WHITE_KEYS + 1', () => {
      Story.story(
        MusicBox.update,
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MIN_WHITE_KEYS + 1, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, }),
        Story.message(MusicBox.RemoveKey()),
        Story.model((model) => {
          expect(model.whiteKeys).toBe(MusicBox.MIN_WHITE_KEYS)
        }),
        Story.Command.expectNone(),
      )
    })

    it('ToggleBottomKeyboard toggles showBottomKeyboard', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.ToggleBottomKeyboard()),
        Story.model((model) => {
          expect(model.showBottomKeyboard).toBe(true)
        }),
        Story.Command.expectNone(),
      )
    })

    it('ToggleBottomKeyboard toggles back to true', () => {
      Story.story(
        MusicBox.update,
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: 12, showBottomKeyboard: false, octaveOffset: 0, bottomShift: 0, topShift: 0, tempo: 1, lyricsExpanded: false, }),
        Story.message(MusicBox.ToggleBottomKeyboard()),
        Story.model((model) => {
          expect(model.showBottomKeyboard).toBe(true)
        }),
        Story.Command.expectNone(),
      )
    })

    it('ShiftTop increments topShift', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.ShiftTop({ delta: 1 })),
        Story.model((model) => {
          expect(model.topShift).toBe(1)
        }),
        Story.Command.expectNone(),
      )
    })

    it('ShiftTop decrements topShift', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.ShiftTop({ delta: -1 })),
        Story.model((model) => {
          expect(model.topShift).toBe(-1)
        }),
        Story.Command.expectNone(),
      )
    })

    it('ShiftTop is capped at -7', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), topShift: -7 }),
        Story.message(MusicBox.ShiftTop({ delta: -1 })),
        Story.model((model) => {
          expect(model.topShift).toBe(-7)
        }),
        Story.Command.expectNone(),
      )
    })

    it('ShiftTop is capped at 7', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), topShift: 7 }),
        Story.message(MusicBox.ShiftTop({ delta: 1 })),
        Story.model((model) => {
          expect(model.topShift).toBe(7)
        }),
        Story.Command.expectNone(),
      )
    })
  })

  describe('instruments', () => {
    for (const [i, inst] of MusicBox.INSTRUMENTS.entries()) {
      it(`instrument ${i} "${inst.key}" has valid fields`, () => {
        expect(inst.key).toBeTruthy()
        expect(inst.gain).toBeGreaterThan(0)
        expect(inst.attack).toBeGreaterThanOrEqual(0)
        expect(inst.decay).toBeGreaterThanOrEqual(0)
        expect(inst.sustain).toBeGreaterThanOrEqual(0)
        expect(inst.release).toBeGreaterThan(0)
        expect(inst.harmonics.length).toBeGreaterThan(0)
        expect(['sine', 'square', 'sawtooth', 'triangle']).toContain(inst.type)
        for (const h of inst.harmonics) {
          expect(h.ratio).toBeGreaterThan(0)
          expect(h.gain).toBeGreaterThan(0)
        }
      })
    }

    it('all instruments have unique keys', () => {
      const keys = MusicBox.INSTRUMENTS.map(i => i.key)
      expect(new Set(keys).size).toBe(keys.length)
    })
  })

  describe('songs', () => {
    for (const [i, song] of MusicBox.SONGS.entries()) {
      it(`song ${i} "${song.key}" notes all have valid pitches`, () => {
        expect(song.key).toBeTruthy()
        expect(song.emoji).toBeTruthy()
        expect(song.notes.length).toBeGreaterThan(0)
         for (const note of song.notes) {
           expect(note.dur).toBeGreaterThan(0)
           if (note.pitch) expect(MusicBox.FREQUENCIES[note.pitch]).toBeDefined()
         }
      })
    }

    it('all songs have unique keys', () => {
      const keys = MusicBox.SONGS.map(s => s.key)
      expect(new Set(keys).size).toBe(keys.length)
    })
  })

  it('every keyboard pitch has a frequency entry', () => {
    const top = MusicBox.PianoKeys.TOP.keys.map(k => k.pitch)
    const bot = MusicBox.PianoKeys.BOTTOM.keys.map(k => k.pitch)
    for (const pitch of [...top, ...bot]) {
      expect(MusicBox.FREQUENCIES[pitch]).toBeDefined()
    }
  })

  it('every QWERTY mapped pitch has a frequency entry', () => {
    const all = [...MusicBox.QWERTY_WHITES, ...MusicBox.QWERTY_BLACKS]
    for (const { pitch } of all) {
      expect(MusicBox.FREQUENCIES[pitch]).toBeDefined()
    }
  })

  describe('keyboard structure', () => {
    it('top keyboard starts at C4 and ends at G#5', () => {
      const keys = MusicBox.PianoKeys.TOP.keys
      expect(keys[0]!.pitch).toBe('C4')
      expect(keys[keys.length - 1]!.pitch).toBe('G#5')
    })

    it('bottom keyboard starts at C3 and last white key is G4', () => {
      const keys = MusicBox.PianoKeys.BOTTOM.keys
      const whiteKeys = keys.filter(k => k.type === 'white')
      expect(keys[0]!.pitch).toBe('C3')
      expect(whiteKeys[whiteKeys.length - 1]!.pitch).toBe('G4')
    })

    it('top keyboard has correct white/black split', () => {
      const white = MusicBox.PianoKeys.TOP.keys.filter(k => k.type === 'white')
      const black = MusicBox.PianoKeys.TOP.keys.filter(k => k.type === 'black')
      expect(white.length + black.length).toBe(MusicBox.PianoKeys.TOP.keys.length)
      expect(white).toHaveLength(12)
      expect(black).toHaveLength(9)
    })

    it('bottom keyboard has correct white/black split', () => {
      const white = MusicBox.PianoKeys.BOTTOM.keys.filter(k => k.type === 'white')
      const black = MusicBox.PianoKeys.BOTTOM.keys.filter(k => k.type === 'black')
      expect(white.length + black.length).toBe(MusicBox.PianoKeys.BOTTOM.keys.length)
      expect(white).toHaveLength(12)
      expect(black).toHaveLength(9)
    })

    it('shiftStart shifts by white key positions', () => {
      expect(MusicBox.shiftStart('C3', 0)).toBe('C3')
      expect(MusicBox.shiftStart('C3', 1)).toBe('D3')
      expect(MusicBox.shiftStart('C3', 2)).toBe('E3')
      expect(MusicBox.shiftStart('C3', 6)).toBe('B3')
      expect(MusicBox.shiftStart('C3', 7)).toBe('C4')
      expect(MusicBox.shiftStart('C3', -1)).toBe('B2')
      expect(MusicBox.shiftStart('C3', -7)).toBe('C2')
      expect(MusicBox.shiftStart('E3', 1)).toBe('F3')
      expect(MusicBox.shiftStart('E3', -1)).toBe('D3')
    })

    it('buildKeyboard starts from any white key', () => {
      const kb = MusicBox.buildKeyboard('D3', 3)
      const whitePitches = kb.keys.filter(k => k.type === 'white').map(k => k.pitch)
      expect(whitePitches).toEqual(['D3', 'E3', 'F3'])
    })

    it('buildKeyboard with non-C start includes correct black keys', () => {
      const kb = MusicBox.buildKeyboard('D3', 4)
      const blackPitches = kb.keys.filter(k => k.type === 'black').map(k => k.pitch)
      expect(blackPitches).toEqual(['C#3', 'D#3', 'F#3', 'G#3'])
    })

    it('buildKeyboard with negative shift wraps octave correctly', () => {
      const kb = MusicBox.buildKeyboard('B3', 3)
      const whitePitches = kb.keys.filter(k => k.type === 'white').map(k => k.pitch)
      expect(whitePitches).toEqual(['B3', 'C4', 'D4'])
    })
  })

  describe('view', () => {
    it('renders play button', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with(MusicBox.init()),
        Scene.Mount.resolveAll(...resolveMount),
        Scene.expect(Scene.text('▶ Play')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('renders stop button when playing', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, }),
        Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
        Scene.expect(Scene.text('⏹ Stop')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('play button absent when playing', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, }),
        Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
        Scene.expect(Scene.text('▶ Play')).not.toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('renders title', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with(MusicBox.init()),
        Scene.Mount.resolveAll(...resolveMount),
        Scene.expect(Scene.text('Music Box')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('renders + button', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with(MusicBox.init()),
        Scene.Mount.resolveAll(...resolveMount),
        Scene.expect(Scene.text('+')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('renders - button', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with(MusicBox.init()),
        Scene.Mount.resolveAll(...resolveMount),
        Scene.expect(Scene.text('−')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('- button exists at MIN_WHITE_KEYS', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MIN_WHITE_KEYS, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, }),
        Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
        Scene.expect(Scene.text('−')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('+ button exists at MAX_WHITE_KEYS', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MAX_WHITE_KEYS, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, }),
        Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
        Scene.expect(Scene.text('+')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('renders Keys label', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with(MusicBox.init()),
        Scene.Mount.resolveAll(...resolveMount),
        Scene.expect(Scene.text('Keys')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('renders bottom keyboard toggle checkbox', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with(MusicBox.init()),
        Scene.Mount.resolveAll(...resolveMount),
        Scene.expect(Scene.text('Bottom keyboard')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('does not render bottom keyboard when toggled off', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: 12, showBottomKeyboard: false, octaveOffset: 0, bottomShift: 0, topShift: 0, tempo: 1, lyricsExpanded: false, }),
        Scene.Mount.resolveAll(resolvePianoTop),
        Scene.expect(Scene.text('Bottom keyboard')).toExist(),
        Scene.Command.expectNone(),
      )
    })
  })
})
