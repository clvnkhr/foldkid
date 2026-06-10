import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as MusicBox from './musicbox'

const resolvePianoTop = [{ name: 'piano-top' as const }, MusicBox.NoteOn({ pitch: 'C4' })] as const
const resolvePianoBot = [{ name: 'piano-bot' as const }, MusicBox.NoteOn({ pitch: 'C2' })] as const
const resolveMount = [resolvePianoTop, resolvePianoBot]

describe('MusicBox', () => {
  it('init state', () => {
    expect(MusicBox.init()).toStrictEqual({
      selectedSong: 0, selectedInstrument: 0, isPlaying: false,
      whiteKeys: 12,
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12 }),
        Story.message(MusicBox.Stop()),
        Story.model((model) => {
          expect(model.isPlaying).toBe(false)
        }),
        Story.Command.expectNone(),
      )
    })

    it('SongEnded sets isPlaying to false', () => {
      Story.story(
        MusicBox.update,
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12 }),
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
          expect(model.whiteKeys).toBe(13)
        }),
        Story.Command.expectNone(),
      )
    })

    it('RemoveKey decrements whiteKeys', () => {
      Story.story(
        MusicBox.update,
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: 12 }),
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MAX_WHITE_KEYS }),
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MIN_WHITE_KEYS }),
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MAX_WHITE_KEYS - 1 }),
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MIN_WHITE_KEYS + 1 }),
        Story.message(MusicBox.RemoveKey()),
        Story.model((model) => {
          expect(model.whiteKeys).toBe(MusicBox.MIN_WHITE_KEYS)
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
          expect(MusicBox.FREQUENCIES[note.pitch]).toBeDefined()
        }
      })
    }

    it('all songs have unique keys', () => {
      const keys = MusicBox.SONGS.map(s => s.key)
      expect(new Set(keys).size).toBe(keys.length)
    })
  })

  describe('frequency coverage', () => {
    const allTopPitches = MusicBox.PianoKeys.TOP.keys.map(k => k.pitch)
    const allBottomPitches = MusicBox.PianoKeys.BOTTOM.keys.map(k => k.pitch)

    for (const pitch of allTopPitches) {
      it(`top keyboard has frequency for ${pitch}`, () => {
        expect(MusicBox.FREQUENCIES[pitch]).toBeDefined()
      })
    }

    for (const pitch of allBottomPitches) {
      it(`bottom keyboard has frequency for ${pitch}`, () => {
        expect(MusicBox.FREQUENCIES[pitch]).toBeDefined()
      })
    }
  })

  describe('QWERTY mapping frequency coverage', () => {
    for (const { qwerty, pitch } of MusicBox.QWERTY_WHITES) {
      it(`Qwerty ${qwerty} -> ${pitch} has frequency`, () => {
        expect(MusicBox.FREQUENCIES[pitch]).toBeDefined()
      })
    }

    for (const { qwerty, pitch } of MusicBox.QWERTY_BLACKS) {
      it(`Qwerty ${qwerty} -> ${pitch} has frequency`, () => {
        expect(MusicBox.FREQUENCIES[pitch]).toBeDefined()
      })
    }
  })

  describe('keyboard structure', () => {
    it('top keyboard starts at C4 and ends at G#5', () => {
      const keys = MusicBox.PianoKeys.TOP.keys
      expect(keys[0]!.pitch).toBe('C4')
      expect(keys[keys.length - 1]!.pitch).toBe('G#5')
    })

    it('bottom keyboard starts at C2 and last white key is G3', () => {
      const keys = MusicBox.PianoKeys.BOTTOM.keys
      const whiteKeys = keys.filter(k => k.type === 'white')
      expect(keys[0]!.pitch).toBe('C2')
      expect(whiteKeys[whiteKeys.length - 1]!.pitch).toBe('G3')
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
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12 }),
        Scene.Mount.resolveAll(...resolveMount),
        Scene.expect(Scene.text('⏹ Stop')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('play button absent when playing', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12 }),
        Scene.Mount.resolveAll(...resolveMount),
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
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MIN_WHITE_KEYS }),
        Scene.Mount.resolveAll(...resolveMount),
        Scene.expect(Scene.text('−')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('+ button exists at MAX_WHITE_KEYS', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MAX_WHITE_KEYS }),
        Scene.Mount.resolveAll(...resolveMount),
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
  })
})
