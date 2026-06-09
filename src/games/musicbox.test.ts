import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as MusicBox from './musicbox'

const resolvePianoTop = [{ name: 'piano-top' as const }, MusicBox.NoteOn({ pitch: 'C4' })]
const resolvePianoBot = [{ name: 'piano-bot' as const }, MusicBox.NoteOn({ pitch: 'C2' })]
const resolveMount = [resolvePianoTop, resolvePianoBot]

describe('MusicBox', () => {
  it('init state', () => {
    expect(MusicBox.init()).toStrictEqual({
      selectedSong: 0, selectedInstrument: 0, isPlaying: false,
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true }),
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true }),
        Story.message(MusicBox.SongEnded()),
        Story.model((model) => {
          expect(model.isPlaying).toBe(false)
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
    it('top keyboard starts at C4 and ends at G5', () => {
      const keys = MusicBox.PianoKeys.TOP.keys
      expect(keys[0]!.pitch).toBe('C4')
      expect(keys[keys.length - 1]!.pitch).toBe('G5')
    })

    it('bottom keyboard starts at C2 and ends at G3', () => {
      const keys = MusicBox.PianoKeys.BOTTOM.keys
      expect(keys[0]!.pitch).toBe('C2')
      expect(keys[keys.length - 1]!.pitch).toBe('G3')
    })

    it('top keyboard has correct white/black split', () => {
      const white = MusicBox.PianoKeys.TOP.keys.filter(k => k.type === 'white')
      const black = MusicBox.PianoKeys.TOP.keys.filter(k => k.type === 'black')
      expect(white.length + black.length).toBe(MusicBox.PianoKeys.TOP.keys.length)
      expect(white).toHaveLength(12)
      expect(black).toHaveLength(8)
    })

    it('bottom keyboard has correct white/black split', () => {
      const white = MusicBox.PianoKeys.BOTTOM.keys.filter(k => k.type === 'white')
      const black = MusicBox.PianoKeys.BOTTOM.keys.filter(k => k.type === 'black')
      expect(white.length + black.length).toBe(MusicBox.PianoKeys.BOTTOM.keys.length)
      expect(white).toHaveLength(12)
      expect(black).toHaveLength(8)
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
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true }),
        Scene.Mount.resolveAll(...resolveMount),
        Scene.expect(Scene.text('⏹ Stop')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('play button absent when playing', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true }),
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
  })
})
