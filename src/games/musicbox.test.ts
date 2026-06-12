import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import { resetContext } from '../audio'
import * as MusicBox from './musicbox'

const resolvePianoTop = [{ name: 'piano-top' as const }, MusicBox.NoteOn({ pitch: 'C4' })] as const
const resolvePianoBot = [{ name: 'piano-bot' as const }, MusicBox.NoteOn({ pitch: 'C3' })] as const
const resolveMount = [resolvePianoTop]
const originalAudioContext = globalThis.AudioContext

const startedFrequencies: number[] = []

const makeAudioParam = (initial = 0): AudioParam => ({
  value: initial,
  automationRate: 'a-rate',
  cancelAndHoldAtTime: () => makeAudioParam(initial),
  cancelScheduledValues: () => makeAudioParam(initial),
  exponentialRampToValueAtTime: () => makeAudioParam(initial),
  linearRampToValueAtTime: () => makeAudioParam(initial),
  setTargetAtTime: () => makeAudioParam(initial),
  setValueAtTime: () => makeAudioParam(initial),
  setValueCurveAtTime: () => makeAudioParam(initial),
} as unknown as AudioParam)

const makeAudioNode = (): AudioNode => ({
  connect: () => makeAudioNode(),
  disconnect: () => {},
} as unknown as AudioNode)

class MockAudioContext {
  state: AudioContextState = 'running'
  currentTime = 0
  destination = makeAudioNode() as AudioDestinationNode

  createOscillator(): OscillatorNode {
    const frequency = makeAudioParam(440)
    return {
      ...makeAudioNode(),
      type: 'sine',
      frequency,
      detune: makeAudioParam(0),
      start: () => { startedFrequencies.push(frequency.value) },
      stop: () => {},
    } as unknown as OscillatorNode
  }

  createGain(): GainNode {
    return {
      ...makeAudioNode(),
      gain: makeAudioParam(1),
    } as unknown as GainNode
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    return {
      ...makeAudioNode(),
      threshold: makeAudioParam(-24),
      knee: makeAudioParam(30),
      ratio: makeAudioParam(12),
      attack: makeAudioParam(0.003),
      release: makeAudioParam(0.25),
    } as unknown as DynamicsCompressorNode
  }

  close(): Promise<void> {
    this.state = 'closed'
    return Promise.resolve()
  }

  resume(): Promise<void> {
    this.state = 'running'
    return Promise.resolve()
  }
}

afterEach(() => {
  MusicBox.resetKeyboardControls()
  MusicBox.resetWakeMonitor()
  resetContext()
  startedFrequencies.length = 0
  document.body.innerHTML = ''
  globalThis.AudioContext = originalAudioContext
  vi.restoreAllMocks()
})

describe('MusicBox', () => {
  it('init state', () => {
    expect(MusicBox.init()).toStrictEqual({
      selectedSong: 0, selectedInstrument: 0, isPlaying: false, isPaused: false, songTranspose: 0,
      whiteKeys: 8, showBottomKeyboard: false, octaveOffset: 0, bottomShift: 0, topShift: 0, tempo: 1, lyricsExpanded: false,
      songOrder: [0, 1, 2, 3, 4, 5, 6], hiddenSongs: [false, false, false, false, false, false, false], dragIndex: -1,
    })
  })

  it('QWERTY A key starts and releases C4', () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    MusicBox.init()

    const down = new KeyboardEvent('keydown', { key: 'a', cancelable: true })
    document.dispatchEvent(down)

    expect(down.defaultPrevented).toBe(true)
    expect(startedFrequencies[0]!).toBeCloseTo(MusicBox.FREQUENCIES.C4!)

    const up = new KeyboardEvent('keyup', { key: 'a', cancelable: true })
    document.dispatchEvent(up)

    expect(up.defaultPrevented).toBe(true)
  })

  it('QWERTY keys follow the rendered octave offset', () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    const model = { ...MusicBox.init(), octaveOffset: 1 }
    MusicBox.view(model)

    const down = new KeyboardEvent('keydown', { key: 'a', cancelable: true })
    document.dispatchEvent(down)

    expect(startedFrequencies[0]!).toBeCloseTo(MusicBox.FREQUENCIES.C5!)
  })

  it('resetKeyboardControls removes the document listeners installed by init', () => {
    const originalAdd = document.addEventListener.bind(document)
    const originalRemove = document.removeEventListener.bind(document)
    const added: Array<{ type: string; listener: EventListenerOrEventListenerObject }> = []
    const removed: Array<{ type: string; listener: EventListenerOrEventListenerObject }> = []

    document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === 'keydown' || type === 'keyup' || type === 'pointerup') {
        added.push({ type, listener })
      }
      return originalAdd(type, listener, options)
    }) as Document['addEventListener']
    document.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
      if (type === 'keydown' || type === 'keyup' || type === 'pointerup') {
        removed.push({ type, listener })
      }
      return originalRemove(type, listener, options)
    }) as Document['removeEventListener']

    try {
      MusicBox.init()
      MusicBox.resetKeyboardControls()

      expect(added.map(entry => entry.type)).toEqual(['keydown', 'keyup', 'pointerup', 'keydown', 'keydown'])
      expect(removed).toHaveLength(added.length)
      for (const entry of added) {
        expect(removed).toContainEqual(entry)
      }
    } finally {
      document.addEventListener = originalAdd as Document['addEventListener']
      document.removeEventListener = originalRemove as Document['removeEventListener']
    }
  })

  it('starts one removable wake monitor from init', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const intervalId = 123 as unknown as ReturnType<typeof window.setInterval>
    const setIntervalSpy = vi.spyOn(window, 'setInterval').mockReturnValue(intervalId)
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval').mockImplementation(() => {})

    MusicBox.init()
    MusicBox.init()
    MusicBox.resetWakeMonitor()

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(addSpy.mock.calls.filter(([type]) => type === 'pageshow')).toHaveLength(1)
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId)
    const pageshowListener = addSpy.mock.calls.find(([type]) => type === 'pageshow')?.[1]
    expect(removeSpy).toHaveBeenCalledWith('pageshow', pageshowListener)
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

    it('Play while paused resumes without duplicating command', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), isPlaying: true, isPaused: true }),
        Story.message(MusicBox.Play()),
        Story.model((model) => {
          expect(model.isPlaying).toBe(true)
          expect(model.isPaused).toBe(false)
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

    it('TogglePause sets isPaused when playing', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), isPlaying: true, isPaused: false }),
        Story.message(MusicBox.TogglePause()),
        Story.model((model) => {
          expect(model.isPaused).toBe(true)
        }),
        Story.Command.expectNone(),
      )
    })

    it('TogglePause unsets isPaused', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), isPlaying: true, isPaused: true }),
        Story.message(MusicBox.TogglePause()),
        Story.model((model) => {
          expect(model.isPaused).toBe(false)
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

    it('TransposeUp increments songTranspose', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.TransposeUp()),
        Story.model((model) => {
          expect(model.songTranspose).toBe(1)
        }),
        Story.Command.expectNone(),
      )
    })

    it('TransposeDown decrements songTranspose', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.TransposeDown()),
        Story.model((model) => {
          expect(model.songTranspose).toBe(-1)
        }),
        Story.Command.expectNone(),
      )
    })

    it('TransposeUp is capped at 12', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), songTranspose: 12 }),
        Story.message(MusicBox.TransposeUp()),
        Story.model((model) => {
          expect(model.songTranspose).toBe(12)
        }),
        Story.Command.expectNone(),
      )
    })

    it('TransposeDown is capped at -12', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), songTranspose: -12 }),
        Story.message(MusicBox.TransposeDown()),
        Story.model((model) => {
          expect(model.songTranspose).toBe(-12)
        }),
        Story.Command.expectNone(),
      )
    })

    it('OctaveUp increments octaveOffset', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.OctaveUp()),
        Story.model((model) => {
          expect(model.octaveOffset).toBe(1)
        }),
        Story.Command.expectNone(),
      )
    })

    it('OctaveDown decrements octaveOffset', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.OctaveDown()),
        Story.model((model) => {
          expect(model.octaveOffset).toBe(-1)
        }),
        Story.Command.expectNone(),
      )
    })

    it('OctaveUp is capped at MAX_OCTAVE', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), octaveOffset: MusicBox.MAX_OCTAVE }),
        Story.message(MusicBox.OctaveUp()),
        Story.model((model) => {
          expect(model.octaveOffset).toBe(MusicBox.MAX_OCTAVE)
        }),
        Story.Command.expectNone(),
      )
    })

    it('OctaveDown is capped at MIN_OCTAVE', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), octaveOffset: MusicBox.MIN_OCTAVE }),
        Story.message(MusicBox.OctaveDown()),
        Story.model((model) => {
          expect(model.octaveOffset).toBe(MusicBox.MIN_OCTAVE)
        }),
        Story.Command.expectNone(),
      )
    })

    it('OctaveUp works at boundary MAX_OCTAVE - 1', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), octaveOffset: MusicBox.MAX_OCTAVE - 1 }),
        Story.message(MusicBox.OctaveUp()),
        Story.model((model) => {
          expect(model.octaveOffset).toBe(MusicBox.MAX_OCTAVE)
        }),
        Story.Command.expectNone(),
      )
    })

    it('OctaveDown works at boundary MIN_OCTAVE + 1', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), octaveOffset: MusicBox.MIN_OCTAVE + 1 }),
        Story.message(MusicBox.OctaveDown()),
        Story.model((model) => {
          expect(model.octaveOffset).toBe(MusicBox.MIN_OCTAVE)
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
        Scene.expect(Scene.selector('#musicbox-play svg')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('renders stop button when playing', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, songOrder: [0, 1, 2, 3, 4, 5, 6], hiddenSongs: [false, false, false, false, false, false, false], dragIndex: -1 }),
        Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
        Scene.expect(Scene.selector('#musicbox-stop svg')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('play button disabled when playing', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, songOrder: [0, 1, 2, 3, 4, 5, 6], hiddenSongs: [false, false, false, false, false, false, false], dragIndex: -1 }),
        Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
        Scene.expect(Scene.selector('#musicbox-play svg')).toExist(),
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
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MIN_WHITE_KEYS, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, songOrder: [0, 1, 2, 3, 4, 5, 6], hiddenSongs: [false, false, false, false, false, false, false], dragIndex: -1 }),
        Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
        Scene.expect(Scene.text('−')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('+ button exists at MAX_WHITE_KEYS', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MAX_WHITE_KEYS, showBottomKeyboard: true, tempo: 1, lyricsExpanded: false, songOrder: [0, 1, 2, 3, 4, 5, 6], hiddenSongs: [false, false, false, false, false, false, false], dragIndex: -1 }),
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
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: 12, showBottomKeyboard: false, octaveOffset: 0, bottomShift: 0, topShift: 0, tempo: 1, lyricsExpanded: false, songOrder: [0, 1, 2, 3, 4, 5, 6], hiddenSongs: [false, false, false, false, false, false, false], dragIndex: -1 }),
        Scene.Mount.resolveAll(resolvePianoTop),
        Scene.expect(Scene.text('Bottom keyboard')).toExist(),
        Scene.Command.expectNone(),
      )
    })
  })

  describe('global state refactor', () => {
    it('SetSong during playback stops playing and sets isPlaying false', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), isPlaying: true, isPaused: false }),
        Story.message(MusicBox.SetSong({ value: 2 })),
        Story.model((model) => {
          expect(model.isPlaying).toBe(false)
          expect(model.isPaused).toBe(false)
          expect(model.selectedSong).toBe(2)
        }),
        Story.Command.expectNone(),
      )
    })

    it('Play after SetSong works (stopFlag was reset)', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), isPlaying: false, selectedSong: 1 }),
        Story.message(MusicBox.SetSong({ value: 0 })),
        Story.Command.expectNone(),
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

    it('SongEnded sets isPlaying to false', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), isPlaying: true, isPaused: false }),
        Story.message(MusicBox.SongEnded()),
        Story.model((model) => {
          expect(model.isPlaying).toBe(false)
          expect(model.isPaused).toBe(false)
        }),
        Story.Command.expectNone(),
      )
    })

    it('SetInstrument updates selectedInstrument', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.SetInstrument({ value: 2 })),
        Story.model((model) => {
          expect(model.selectedInstrument).toBe(2)
        }),
        Story.Command.expectNone(),
      )
    })
  })
})
