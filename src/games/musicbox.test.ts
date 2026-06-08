import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as MusicBox from './musicbox'

describe('MusicBox', () => {
  it('init state', () => {
    expect(MusicBox.init()).toStrictEqual({
      selectedSong: 0, selectedInstrument: 0, isPlaying: false,
    })
  })

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
      it(`Qwerty ${qwerty} → ${pitch} has frequency`, () => {
        expect(MusicBox.FREQUENCIES[pitch]).toBeDefined()
      })
    }

    for (const { qwerty, pitch } of MusicBox.QWERTY_BLACKS) {
      it(`Qwerty ${qwerty} → ${pitch} has frequency`, () => {
        expect(MusicBox.FREQUENCIES[pitch]).toBeDefined()
      })
    }
  })

  describe('keyboard structure', () => {
    it('top keyboard starts at C4 and ends at G5', () => {
      const keys = MusicBox.PianoKeys.TOP.keys
      expect(keys[0].pitch).toBe('C4')
      expect(keys[keys.length - 1].pitch).toBe('G5')
    })

    it('bottom keyboard starts at C2 and ends at G3', () => {
      const keys = MusicBox.PianoKeys.BOTTOM.keys
      expect(keys[0].pitch).toBe('C2')
      expect(keys[keys.length - 1].pitch).toBe('G3')
    })

    it('top keyboard white count equals keys minus blacks', () => {
      const white = MusicBox.PianoKeys.TOP.keys.filter(k => k.type === 'white')
      const black = MusicBox.PianoKeys.TOP.keys.filter(k => k.type === 'black')
      expect(white.length + black.length).toBe(MusicBox.PianoKeys.TOP.keys.length)
    })

    it('bottom keyboard white count equals keys minus blacks', () => {
      const white = MusicBox.PianoKeys.BOTTOM.keys.filter(k => k.type === 'white')
      const black = MusicBox.PianoKeys.BOTTOM.keys.filter(k => k.type === 'black')
      expect(white.length + black.length).toBe(MusicBox.PianoKeys.BOTTOM.keys.length)
    })
  })

  it('renders play button', () => {
    Scene.scene(
      { update: MusicBox.update, view: MusicBox.view },
      Scene.with(MusicBox.init()),
      Scene.Mount.resolveAll(
        [{ name: 'piano-top' } as const, MusicBox.NoteOn({ pitch: 'C4' })],
        [{ name: 'piano-bot' } as const, MusicBox.NoteOn({ pitch: 'C2' })],
      ),
      Scene.expect(Scene.text('▶ Play')).toExist(),
      Scene.Command.expectNone(),
    )
  })
})
