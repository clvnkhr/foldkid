import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import { Effect, Fiber } from 'effect'
import { resetContext } from '../audio'
import * as MusicBox from './musicbox'
import { withDrums } from './musicboxSongs/helpers'

const resolvePianoTop = [{ name: 'piano-top' as const }, MusicBox.NoteOn({ pitch: 'C4' })] as const
const resolvePianoBot = [{ name: 'piano-bot' as const }, MusicBox.NoteOn({ pitch: 'C3' })] as const
const resolveMount = [resolvePianoTop]
const defaultSongOrder = () => MusicBox.SONGS.map((_, index) => index)
const defaultHiddenSongs = () => MusicBox.SONGS.map(() => false)
const originalAudioContext = globalThis.AudioContext
const originalAudio = globalThis.Audio

const startedFrequencies: number[] = []
const startedAtTimes: number[] = []
const startedNodeKinds: string[] = []
const cancelAndHoldTimes: number[] = []
const setValueEvents: Array<{ value: number; time: number }> = []
const connections: Array<{ from: string; to: string }> = []
const audioEvents: string[] = []
const nodeKinds = new WeakMap<object, string>()
let contextCreateCount = 0
let compressorCreateCount = 0

const makeAudioParam = (initial = 0): AudioParam => {
  const param = {
    value: initial,
    automationRate: 'a-rate',
    cancelAndHoldAtTime: (time: number) => {
      cancelAndHoldTimes.push(time)
      return param
    },
    cancelScheduledValues: () => param,
    exponentialRampToValueAtTime: () => param,
    linearRampToValueAtTime: () => param,
    setTargetAtTime: () => param,
    setValueAtTime: (value: number, time: number) => {
      param.value = value
      setValueEvents.push({ value, time })
      return param
    },
    setValueCurveAtTime: () => param,
  } as unknown as AudioParam
  return param
}

const makeAudioNode = (kind = 'node'): AudioNode => {
  const node = {
    connect: (target?: AudioNode) => {
      connections.push({
        from: kind,
        to: target ? nodeKinds.get(target) ?? 'unknown' : 'unknown',
      })
      return target ?? makeAudioNode()
    },
    disconnect: () => {},
  } as unknown as AudioNode
  nodeKinds.set(node, kind)
  return node
}

class MockAudioContext {
  state: AudioContextState = 'running'
  currentTime = 0
  sampleRate = 44100
  destination = makeAudioNode('destination') as AudioDestinationNode

  constructor() {
    contextCreateCount += 1
    audioEvents.push('context')
  }

  createOscillator(): OscillatorNode {
    const frequency = makeAudioParam(440)
    return Object.assign(makeAudioNode('oscillator'), {
      type: 'sine',
      frequency,
      detune: makeAudioParam(0),
      start: (when = this.currentTime) => {
        startedFrequencies.push(frequency.value)
        startedAtTimes.push(when)
        startedNodeKinds.push('oscillator')
      },
      stop: () => {},
    }) as unknown as OscillatorNode
  }

  createGain(): GainNode {
    return Object.assign(makeAudioNode('gain'), {
      gain: makeAudioParam(1),
    }) as unknown as GainNode
  }

  createBiquadFilter(): BiquadFilterNode {
    return Object.assign(makeAudioNode('filter'), {
      type: 'lowpass',
      frequency: makeAudioParam(440),
      Q: makeAudioParam(1),
    }) as unknown as BiquadFilterNode
  }

  createBuffer(_channels: number, length: number): AudioBuffer {
    const data = new Float32Array(length)
    return {
      getChannelData: () => data,
    } as unknown as AudioBuffer
  }

  createBufferSource(): AudioBufferSourceNode {
    return Object.assign(makeAudioNode('bufferSource'), {
      buffer: null,
      start: (when = this.currentTime) => {
        startedAtTimes.push(when)
        startedNodeKinds.push('bufferSource')
      },
      stop: () => {},
    }) as unknown as AudioBufferSourceNode
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    compressorCreateCount += 1
    audioEvents.push('compressor')
    return Object.assign(makeAudioNode('compressor'), {
      threshold: makeAudioParam(-24),
      knee: makeAudioParam(30),
      ratio: makeAudioParam(12),
      attack: makeAudioParam(0.003),
      release: makeAudioParam(0.25),
    }) as unknown as DynamicsCompressorNode
  }

  close(): Promise<void> {
    this.state = 'closed'
    audioEvents.push('close')
    return Promise.resolve()
  }

  resume(): Promise<void> {
    this.state = 'running'
    audioEvents.push('resume')
    return Promise.resolve()
  }
}

afterEach(() => {
  MusicBox.resetKeyboardControls()
  MusicBox.resetWakeMonitor()
  resetContext()
  startedFrequencies.length = 0
  startedAtTimes.length = 0
  startedNodeKinds.length = 0
  cancelAndHoldTimes.length = 0
  setValueEvents.length = 0
  connections.length = 0
  audioEvents.length = 0
  contextCreateCount = 0
  compressorCreateCount = 0
  document.body.innerHTML = ''
  globalThis.AudioContext = originalAudioContext
  globalThis.Audio = originalAudio
  vi.restoreAllMocks()
})

describe('MusicBox', () => {
  it('init state', () => {
    expect(MusicBox.init()).toStrictEqual({
      selectedSong: 0, selectedInstrument: 0, isPlaying: false, isPaused: false, songTranspose: 0,
      whiteKeys: 8, bottomPanelMode: 'simple', octaveOffset: 0, bottomShift: 0, topShift: 0, tempo: 1, drumVolume: 1, repeatMode: 'off', lyricsExpanded: false,
      songOrder: defaultSongOrder(), hiddenSongs: defaultHiddenSongs(), dragIndex: -1,
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

  it('QWERTY right bracket starts F#5 instead of left bracket', () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    MusicBox.init()

    const oldDown = new KeyboardEvent('keydown', { key: '[', cancelable: true })
    document.dispatchEvent(oldDown)
    expect(oldDown.defaultPrevented).toBe(false)
    expect(startedFrequencies).toEqual([])

    const newDown = new KeyboardEvent('keydown', { key: ']', cancelable: true })
    document.dispatchEvent(newDown)
    expect(newDown.defaultPrevented).toBe(true)
    expect(startedFrequencies[0]!).toBeCloseTo(MusicBox.FREQUENCIES['F#5']!)
  })

  it('drum keybinds trigger the visible drum kit', () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    MusicBox.init()

    expect(MusicBox.DRUM_KEYBINDS.map(({ qwerty, kind }) => [qwerty, kind])).toEqual([
      ['C', 'kick'],
      ['V', 'snare'],
      ['B', 'hatClosed'],
      ['N', 'hatOpen'],
      ['M', 'tomLow'],
      [',', 'tomHigh'],
    ])

    const down = new KeyboardEvent('keydown', { key: 'c', cancelable: true, bubbles: true })
    document.body.dispatchEvent(down)

    expect(down.defaultPrevented).toBe(true)
    expect(startedFrequencies[0]!).toBeCloseTo(130)
  })

  it('QWERTY keys follow the rendered octave offset', () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    const model = { ...MusicBox.init(), octaveOffset: 1 }
    MusicBox.view(model)

    const down = new KeyboardEvent('keydown', { key: 'a', cancelable: true })
    document.dispatchEvent(down)

    expect(startedFrequencies[0]!).toBeCloseTo(MusicBox.FREQUENCIES.C5!)
  })

  it('routes manual piano notes through one master compressor', () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    const model = MusicBox.init()

    MusicBox.update(model, MusicBox.NoteOn({ pitch: 'C4' }))
    MusicBox.update(model, MusicBox.NoteOn({ pitch: 'E4' }))

    expect(compressorCreateCount).toBe(1)
    expect(connections).toContainEqual({ from: 'compressor', to: 'destination' })
    expect(connections.filter(connection => connection.from === 'gain' && connection.to === 'compressor').length).toBeGreaterThanOrEqual(2)
  })

  it('routes song playback notes through the same master compressor path', async () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    const [, commands] = MusicBox.update(MusicBox.init(), MusicBox.Play())

    const playCommand = commands[0]
    expect(playCommand?.name).toBe('PlayMusicBox')
    const fiber = Effect.runFork(playCommand!.effect)
    await new Promise(resolve => setTimeout(resolve, 0))
    await Effect.runPromise(Fiber.interrupt(fiber))

    expect(compressorCreateCount).toBe(1)
    expect(connections).toContainEqual({ from: 'compressor', to: 'destination' })
    expect(connections.some(connection => connection.from === 'gain' && connection.to === 'compressor')).toBe(true)
  })

  it('starts drum voices during song playback', async () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    const model = { ...MusicBox.init(), selectedSong: MusicBox.SONGS.findIndex(song => song.key === 'row') }
    const [, commands] = MusicBox.update(model, MusicBox.Play())

    const playCommand = commands[0]
    expect(playCommand?.name).toBe('PlayMusicBox')
    const fiber = Effect.runFork(playCommand!.effect)
    await new Promise(resolve => setTimeout(resolve, 0))
    await Effect.runPromise(Fiber.interrupt(fiber))

    expect(startedFrequencies).toContain(130)
    expect(startedNodeKinds).toContain('oscillator')
  })

  it('does not start drum voices when drum volume is zero', async () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    const model = {
      ...MusicBox.init(),
      selectedSong: MusicBox.SONGS.findIndex(song => song.key === 'row'),
      drumVolume: 0,
    }
    const [, commands] = MusicBox.update(model, MusicBox.Play())

    const playCommand = commands[0]
    expect(playCommand?.name).toBe('PlayMusicBox')
    const fiber = Effect.runFork(playCommand!.effect)
    await new Promise(resolve => setTimeout(resolve, 0))
    await Effect.runPromise(Fiber.interrupt(fiber))

    expect(startedFrequencies).not.toContain(130)
  })

  it('stops the old playback command before auto-playing the skipped song', async () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    const [playing, playCommands] = MusicBox.update(MusicBox.init(), MusicBox.Play())
    const oldCommand = playCommands[0]
    if (!oldCommand) throw new Error('missing initial PlayMusicBox command')

    const oldFiber = Effect.runFork(oldCommand.effect)
    await new Promise(resolve => setTimeout(resolve, 0))
    const c4 = MusicBox.FREQUENCIES.C4!
    const c4CountAfterStart = startedFrequencies.filter(frequency => frequency === c4).length
    expect(c4CountAfterStart).toBeGreaterThan(0)

    const [, skipCommands] = MusicBox.update(playing, MusicBox.SkipSong())
    const newCommand = skipCommands[0]
    if (!newCommand) throw new Error('missing skipped PlayMusicBox command')
    const newFiber = Effect.runFork(newCommand.effect)

    await new Promise(resolve => setTimeout(resolve, 450))
    await Effect.runPromise(Fiber.interrupt(oldFiber))
    await Effect.runPromise(Fiber.interrupt(newFiber))

    expect(startedFrequencies.filter(frequency => frequency === c4).length).toBe(c4CountAfterStart)
  })

  it('primes Safari audio once from the first trusted gesture', () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    const originalAudioSession = Object.getOwnPropertyDescriptor(navigator, 'audioSession')
    const session = {
      currentType: 'ambient',
      get type() {
        return this.currentType
      },
      set type(value: string) {
        audioEvents.push(`audioSession:${value}`)
        this.currentType = value
      },
    }
    Object.defineProperty(navigator, 'audioSession', {
      configurable: true,
      value: session,
    })
    globalThis.Audio = class {
      play(): Promise<void> {
        audioEvents.push('silentWav')
        return Promise.resolve()
      }
    } as unknown as typeof Audio

    try {
      MusicBox.init()

      document.dispatchEvent(new Event('pointerup'))
      document.dispatchEvent(new Event('pointerup'))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))

      expect(audioEvents).toEqual(['audioSession:playback', 'silentWav', 'context', 'compressor'])
      expect(session.type).toBe('playback')
      expect(contextCreateCount).toBe(1)
      expect(compressorCreateCount).toBe(1)
    } finally {
      if (originalAudioSession) {
        Object.defineProperty(navigator, 'audioSession', originalAudioSession)
      } else {
        delete (navigator as { audioSession?: unknown }).audioSession
      }
    }
  })

  it('recreates the audio graph after a persisted pageshow wake event', () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    const model = MusicBox.init()

    MusicBox.update(model, MusicBox.NoteOn({ pitch: 'C4' }))
    expect(contextCreateCount).toBe(1)
    expect(compressorCreateCount).toBe(1)

    const pageShow = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(pageShow, 'persisted', { value: true })
    window.dispatchEvent(pageShow)
    MusicBox.update(model, MusicBox.NoteOn({ pitch: 'E4' }))

    expect(contextCreateCount).toBe(2)
    expect(compressorCreateCount).toBe(2)
    expect(audioEvents).toContain('close')
    expect(startedFrequencies.some(freq => Math.abs(freq - MusicBox.FREQUENCIES.E4!) < 0.01)).toBe(true)
  })

  it('rapid QWERTY key presses start every distinct note immediately', () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    MusicBox.init()

    for (const key of ['a', 's', 'd']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }))
    }

    expect(startedFrequencies.some(freq => Math.abs(freq - MusicBox.FREQUENCIES.C4!) < 0.01)).toBe(true)
    expect(startedFrequencies.some(freq => Math.abs(freq - MusicBox.FREQUENCIES.D4!) < 0.01)).toBe(true)
    expect(startedFrequencies.some(freq => Math.abs(freq - MusicBox.FREQUENCIES.E4!) < 0.01)).toBe(true)
    expect(startedAtTimes.every(time => time === 0)).toBe(true)
  })

  it('releasing a note holds the envelope before fading out', () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
    const model = MusicBox.init()

    MusicBox.update(model, MusicBox.NoteOn({ pitch: 'C4' }))
    MusicBox.update(model, MusicBox.NoteOff({ pitch: 'C4' }))

    expect(cancelAndHoldTimes).toEqual([0])
    expect(setValueEvents).not.toContainEqual({ value: 1, time: 0 })
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

    it('SkipSong moves to the next visible song in configured order', () => {
      const order = [2, 0, 1, ...MusicBox.SONGS.map((_, index) => index).slice(3)]
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), selectedSong: 0, songOrder: order }),
        Story.message(MusicBox.SkipSong()),
        Story.model((model) => {
          expect(model.selectedSong).toBe(1)
        }),
        Story.Command.expectNone(),
      )
    })

    it('PreviousSong wraps to the previous visible song and skips hidden songs', () => {
      Story.story(
        MusicBox.update,
        Story.with({
          ...MusicBox.init(),
          selectedSong: 0,
          hiddenSongs: MusicBox.SONGS.map((_, index) => index === MusicBox.SONGS.length - 1),
        }),
        Story.message(MusicBox.PreviousSong()),
        Story.model((model) => {
          expect(model.selectedSong).toBe(MusicBox.SONGS.length - 2)
        }),
        Story.Command.expectNone(),
      )
    })

    it('song navigation auto-plays the shifted song while actively playing', () => {
      const [next, cmds] = MusicBox.update(
        { ...MusicBox.init(), selectedSong: 0, isPlaying: true, isPaused: false },
        MusicBox.SkipSong(),
      )
      const [afterStaleEnd, staleCmds] = MusicBox.update(next, MusicBox.SongEnded({ playbackId: 0 }))

      expect(next.selectedSong).toBe(1)
      expect(next.isPlaying).toBe(true)
      expect(next.isPaused).toBe(false)
      expect(cmds[0]?.name).toBe('PlayMusicBox')
      expect(afterStaleEnd.selectedSong).toBe(1)
      expect(afterStaleEnd.isPlaying).toBe(true)
      expect(staleCmds).toEqual([])
    })

    it('song navigation does not auto-play while paused', () => {
      const [next, cmds] = MusicBox.update(
        { ...MusicBox.init(), selectedSong: 0, isPlaying: true, isPaused: true },
        MusicBox.SkipSong(),
      )

      expect(next.selectedSong).toBe(1)
      expect(next.isPlaying).toBe(false)
      expect(next.isPaused).toBe(false)
      expect(cmds).toEqual([])
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
          [{ name: 'PlayMusicBox' }, MusicBox.SongEnded({ playbackId: 1 })],
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12, bottomPanelMode: 'keyboard', tempo: 1, lyricsExpanded: false, }),
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

    it('CycleRepeatMode cycles off, loop, loop one, shuffle, off', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.CycleRepeatMode()),
        Story.model(model => {
          expect(model.repeatMode).toBe('loop')
        }),
        Story.message(MusicBox.CycleRepeatMode()),
        Story.model(model => {
          expect(model.repeatMode).toBe('loopOne')
        }),
        Story.message(MusicBox.CycleRepeatMode()),
        Story.model(model => {
          expect(model.repeatMode).toBe('shuffle')
        }),
        Story.message(MusicBox.CycleRepeatMode()),
        Story.model(model => {
          expect(model.repeatMode).toBe('off')
        }),
        Story.Command.expectNone(),
      )
    })

    it('SongEnded sets isPlaying to false', () => {
      Story.story(
        MusicBox.update,
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12, bottomPanelMode: 'keyboard', tempo: 1, lyricsExpanded: false, }),
        Story.message(MusicBox.SongEnded({ playbackId: 0 })),
        Story.model((model) => {
          expect(model.isPlaying).toBe(false)
        }),
        Story.Command.expectNone(),
      )
    })

    it('late SongEnded after Stop does not restart loop playback', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), selectedSong: 0, isPlaying: false, isPaused: false, repeatMode: 'loop' }),
        Story.message(MusicBox.SongEnded({ playbackId: 0 })),
        Story.model(model => {
          expect(model.selectedSong).toBe(0)
          expect(model.isPlaying).toBe(false)
          expect(model.isPaused).toBe(false)
        }),
        Story.Command.expectNone(),
      )
    })

    it('SongEnded with loop selects the next visible song and keeps playing', () => {
      const model = {
        ...MusicBox.init(),
        selectedSong: 0,
        isPlaying: true,
        repeatMode: 'loop' as const,
        hiddenSongs: MusicBox.SONGS.map((_, index) => index === 1),
      }

      const [next, cmds] = MusicBox.update(model, MusicBox.SongEnded({ playbackId: 0 }))
      const [afterNext] = MusicBox.update(next, MusicBox.SongEnded({ playbackId: 1 }))

      expect(next.selectedSong).toBe(2)
      expect(next.isPlaying).toBe(true)
      expect(next.isPaused).toBe(false)
      expect(cmds[0]?.name).toBe('PlayMusicBox')
      expect(afterNext.selectedSong).toBe(3)
      expect(afterNext.isPlaying).toBe(true)
    })

    it('SongEnded with loop one repeats the selected song', () => {
      const [next, cmds] = MusicBox.update(
        { ...MusicBox.init(), selectedSong: 2, isPlaying: true, repeatMode: 'loopOne' },
        MusicBox.SongEnded({ playbackId: 0 }),
      )

      expect(next.selectedSong).toBe(2)
      expect(next.isPlaying).toBe(true)
      expect(cmds[0]?.name).toBe('PlayMusicBox')
    })

    it('nextSongForRepeat shuffles among visible songs without picking the current song when possible', () => {
      const model = {
        ...MusicBox.init(),
        selectedSong: 0,
        repeatMode: 'shuffle' as const,
        hiddenSongs: MusicBox.SONGS.map((_, index) => index === 1),
      }

      expect(MusicBox.nextSongForRepeat(model, 0)).toBe(2)
      expect(MusicBox.nextSongForRepeat(model, 0.99)).toBe(MusicBox.SONGS.length - 1)
    })

    it('nextSongForRepeat loops through the configured visible order', () => {
      const model = {
        ...MusicBox.init(),
        selectedSong: 0,
        repeatMode: 'loop' as const,
        songOrder: [2, 0, 1, ...MusicBox.SONGS.map((_, index) => index).slice(3)],
      }

      expect(MusicBox.nextSongForRepeat(model)).toBe(1)
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: 12, bottomPanelMode: 'keyboard', tempo: 1, lyricsExpanded: false, }),
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MAX_WHITE_KEYS, bottomPanelMode: 'keyboard', tempo: 1, lyricsExpanded: false, }),
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MIN_WHITE_KEYS, bottomPanelMode: 'keyboard', tempo: 1, lyricsExpanded: false, }),
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MAX_WHITE_KEYS - 1, bottomPanelMode: 'keyboard', tempo: 1, lyricsExpanded: false, }),
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
        Story.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MIN_WHITE_KEYS + 1, bottomPanelMode: 'keyboard', tempo: 1, lyricsExpanded: false, }),
        Story.message(MusicBox.RemoveKey()),
        Story.model((model) => {
          expect(model.whiteKeys).toBe(MusicBox.MIN_WHITE_KEYS)
        }),
        Story.Command.expectNone(),
      )
    })

    it('ToggleBottomKeyboard opens the second keyboard', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.ToggleBottomKeyboard()),
        Story.model((model) => {
          expect(model.bottomPanelMode).toBe('keyboard')
        }),
        Story.Command.expectNone(),
      )
    })

    it('ToggleBottomKeyboard closes the second keyboard', () => {
      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), bottomPanelMode: 'keyboard' }),
        Story.message(MusicBox.ToggleBottomKeyboard()),
        Story.model((model) => {
          expect(model.bottomPanelMode).toBe('simple')
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

    it('SetDrumVolume clamps to the slider range', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.SetDrumVolume({ value: 0.55 })),
        Story.model((model) => {
          expect(model.drumVolume).toBe(0.55)
        }),
        Story.message(MusicBox.SetDrumVolume({ value: -1 })),
        Story.model((model) => {
          expect(model.drumVolume).toBe(0)
        }),
        Story.message(MusicBox.SetDrumVolume({ value: 2 })),
        Story.model((model) => {
          expect(model.drumVolume).toBe(1)
        }),
        Story.Command.expectNone(),
      )
    })

    it('SetBottomPanelMode selects lower panel content', () => {
      Story.story(
        MusicBox.update,
        Story.with(MusicBox.init()),
        Story.message(MusicBox.SetBottomPanelMode({ value: 'drums' })),
        Story.model((model) => {
          expect(model.bottomPanelMode).toBe('drums')
        }),
        Story.message(MusicBox.SetBottomPanelMode({ value: 'keyboard' })),
        Story.model((model) => {
          expect(model.bottomPanelMode).toBe('keyboard')
        }),
        Story.Command.expectNone(),
      )
    })

    it('DrumPadHit plays through the musicbox audio runtime', () => {
      globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext

      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), drumVolume: 0.7 }),
        Story.message(MusicBox.DrumPadHit({ kind: 'kick' })),
        Story.model((model) => {
          expect(model.drumVolume).toBe(0.7)
          expect(startedFrequencies[0]!).toBeCloseTo(130)
          expect(compressorCreateCount).toBe(1)
        }),
        Story.Command.expectNone(),
      )
    })

    it('DrumPadHit lights the matching drumpad', () => {
      globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
      const kick = document.createElement('button')
      kick.className = 'drum-pad-button'
      kick.setAttribute('data-drum-kind', 'kick')
      const snare = document.createElement('button')
      snare.className = 'drum-pad-button'
      snare.setAttribute('data-drum-kind', 'snare')
      document.body.append(kick, snare)

      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), drumVolume: 0.7 }),
        Story.message(MusicBox.DrumPadHit({ kind: 'kick' })),
        Story.model(() => {
          expect(kick.classList.contains('drum-pad-button--active')).toBe(true)
          expect(snare.classList.contains('drum-pad-button--active')).toBe(false)
        }),
        Story.Command.expectNone(),
      )
    })

    it('DrumPadHit is silent when drum volume is zero', () => {
      globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
      const kick = document.createElement('button')
      kick.className = 'drum-pad-button'
      kick.setAttribute('data-drum-kind', 'kick')
      document.body.append(kick)

      Story.story(
        MusicBox.update,
        Story.with({ ...MusicBox.init(), drumVolume: 0 }),
        Story.message(MusicBox.DrumPadHit({ kind: 'kick' })),
        Story.model((model) => {
          expect(model.drumVolume).toBe(0)
          expect(startedFrequencies).toEqual([])
          expect(contextCreateCount).toBe(0)
          expect(kick.classList.contains('drum-pad-button--active')).toBe(false)
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

    it('includes the added nursery songs with title keys', () => {
      const keys = MusicBox.SONGS.map(song => song.key)

      expect(keys).toEqual(expect.arrayContaining(['incy', 'fish', 'duke', 'frere']))
      expect(MusicBox.SONG_TKEYS.incy).toBe('musicBoxIncy')
      expect(MusicBox.SONG_TKEYS.fish).toBe('musicBoxFish')
      expect(MusicBox.SONG_TKEYS.duke).toBe('musicBoxDuke')
      expect(MusicBox.SONG_TKEYS.frere).toBe('musicBoxFrere')
    })

    it('all songs have valid lofi drum tracks inside the song timeline', () => {
      for (const song of MusicBox.SONGS) {
        const totalDuration = song.notes.reduce((sum, note) => sum + note.dur, 0)
        expect(song.drums.length, `${song.key} drums`).toBeGreaterThan(0)
        for (const drum of song.drums) {
          expect(MusicBox.DRUM_KINDS).toContain(drum.kind)
          expect(drum.at, `${song.key} drum at`).toBeGreaterThanOrEqual(0)
          expect(drum.at, `${song.key} drum at`).toBeLessThan(totalDuration)
          if (drum.gain !== undefined) expect(drum.gain).toBeGreaterThan(0)
        }
      }
    })

    it('uses meter-matched drum grids for 6/8 and 3/4 songs', () => {
      const getSong = (key: string) => {
        const song = MusicBox.SONGS.find(s => s.key === key)
        expect(song).toBeDefined()
        return song!
      }
      const timesFor = (key: string, kind: string) =>
        getSong(key).drums.filter(drum => drum.kind === kind).map(drum => drum.at)

      expect(timesFor('row', 'kick').slice(0, 4)).toEqual([0, 3, 6, 9])
      expect(timesFor('row', 'snare').slice(0, 4)).toEqual([1.5, 4.5, 7.5, 10.5])
      expect(timesFor('row', 'kick')).not.toContain(4)

      expect(timesFor('birthday', 'kick').slice(0, 4)).toEqual([1, 4, 7, 10])
      expect(timesFor('birthday', 'snare').slice(0, 4)).toEqual([3, 6, 9, 12])
      expect(timesFor('birthday', 'kick')).not.toContain(0)

      expect(timesFor('incy', 'kick').slice(0, 4)).toEqual([0.5, 3.5, 6.5, 9.5])
      expect(timesFor('incy', 'snare').slice(0, 4)).toEqual([2, 5, 8, 11])
      expect(timesFor('incy', 'kick')).not.toContain(0)

      expect(timesFor('happy', 'kick').slice(0, 3)).toEqual([1.5, 4.5, 7.5])
      expect(timesFor('happy', 'kick')).not.toContain(0)
      expect(timesFor('happy', 'clap').slice(0, 2)).toEqual([9, 10.5])
      expect(timesFor('happy', 'hatClosed')).not.toContain(9.5)
      expect(timesFor('happy', 'hatClosed')).not.toContain(10)
      expect(timesFor('happy', 'hatClosed')).not.toContain(11)
      expect(timesFor('happy', 'hatClosed')).not.toContain(11.5)
      expect(timesFor('happy', 'kick')).not.toContain(9)
      expect(timesFor('happy', 'snare')).not.toContain(10.5)
    })

    it('can offset generated drums and trims hits outside the song timeline', () => {
      const song = withDrums({
        key: 'offset-test',
        emoji: '🥁',
        lyrics: ['Offset test'],
        notes: [{ pitch: 'C4', dur: 4 }],
      }, () => [
        { at: 0, kind: 'kick' },
        { at: 3.5, kind: 'snare' },
      ], { drumOffset: 0.75 })

      expect(song.drums.map(drum => [drum.at, drum.kind])).toEqual([[0.75, 'kick']])
    })

    it('can derive drum offsets from pickup notes', () => {
      const song = withDrums({
        key: 'pickup-test',
        emoji: '🥁',
        lyrics: ['Pickup test'],
        notes: [
          { pitch: 'C4', dur: 0.5 },
          { pitch: 'D4', dur: 0.5 },
          { pitch: 'E4', dur: 4 },
        ],
      }, () => [
        { at: 0, kind: 'kick' },
        { at: 2, kind: 'snare' },
      ], { pickupNotes: 2 })

      expect(song.drums.map(drum => [drum.at, drum.kind])).toEqual([
        [1, 'kick'],
        [3, 'snare'],
      ])
    })

    it('accepts drum options without passing a custom drum maker', () => {
      const song = withDrums({
        key: 'default-pickup-test',
        emoji: '🥁',
        lyrics: ['Default pickup test'],
        notes: [
          { pitch: 'C4', dur: 0.5 },
          { pitch: 'D4', dur: 0.5 },
          { pitch: 'E4', dur: 4 },
        ],
      }, { pickupNotes: 2 })

      expect(song.drums.find(drum => drum.kind === 'kick')?.at).toBe(1)
      expect(song.drums.find(drum => drum.kind === 'snare')?.at).toBe(3)
    })

    it('happy song follows the sourced 6/8 melody and rhythm for every verse', () => {
      const happy = MusicBox.SONGS.find(song => song.key === 'happy')
      expect(happy).toBeDefined()
      const expectedVerse = [
        ['C4', 1], ['C4', 0.5],
        ['F4', 1], ['F4', 0.5], ['F4', 1], ['F4', 0.5],
        ['F4', 1], ['F4', 0.5], ['E4', 1], ['F4', 0.5],
        ['G4', 1.5],
        ['', 1.5], ['', 1.5],
        ['C4', 1], ['C4', 0.5],
        ['G4', 1], ['G4', 0.5], ['G4', 1], ['G4', 0.5],
        ['G4', 1], ['G4', 0.5], ['F4', 1], ['G4', 0.5],
        ['A4', 1.5],
        ['', 1.5], ['', 1.5],
        ['A4', 1], ['A4', 0.5],
        ['A#4', 1], ['A#4', 0.5], ['A#4', 1], ['A#4', 0.5],
        ['D4', 1], ['D4', 0.5], ['A#4', 1], ['A#4', 0.5],
        ['A4', 1], ['A4', 0.5], ['A4', 1], ['G4', 0.5],
        ['F4', 1], ['F4', 0.5], ['A4', 1], ['A4', 0.5],
        ['G4', 1], ['G4', 0.5], ['G4', 1], ['F4', 0.5],
        ['E4', 1], ['E4', 0.5], ['D4', 1], ['E4', 0.5],
        ['F4', 1.5],
        ['', 1.5], ['', 1.5],
      ]

      const verses = [
        happy!.notes.slice(0, expectedVerse.length),
        happy!.notes.slice(expectedVerse.length, expectedVerse.length * 2),
        happy!.notes.slice(expectedVerse.length * 2, expectedVerse.length * 3),
      ]
      expect(happy!.notes).toHaveLength(expectedVerse.length * 3)
      for (const verse of verses) {
        expect(verse.map(note => [note.pitch, note.dur])).toEqual(expectedVerse)
      }
    })

    it('happy song maps action rests to clap, stomp, and cheer drums', () => {
      const happy = MusicBox.SONGS.find(song => song.key === 'happy')
      expect(happy).toBeDefined()

      let at = 0
      const restStarts: number[] = []
      for (const note of happy!.notes) {
        if (!note.pitch) restStarts.push(at)
        at += note.dur
      }
      const actionDrums = happy!.drums
        .filter(drum => drum.kind === 'clap' || drum.kind === 'stomp' || drum.kind === 'cheer')
        .map(drum => [drum.at, drum.kind])

      expect(actionDrums).toEqual([
        ...restStarts.slice(0, 6).map(start => [start, 'clap']),
        ...restStarts.slice(6, 12).map(start => [start, 'stomp']),
        ...restStarts.slice(12, 18).map(start => [start, 'cheer']),
      ])
    })

    it('fish song follows the corrected melody and repeats once', () => {
      const fish = MusicBox.SONGS.find(song => song.key === 'fish')
      expect(fish).toBeDefined()
      const expectedVerse = [
        ['E4', 1], ['E4', 1], ['D4', 0.5], ['C4', 0.5], ['C4', 1],
        ['C4', 0.5], ['D4', 0.5], ['E4', 0.5], ['G4', 0.5],
        ['G4', 0.5], ['F4', 0.5], ['F4', 1],
        ['F4', 1], ['F4', 0.5], ['E4', 0.5],
        ['E4', 0.5], ['D4', 0.5], ['D4', 1],
        ['C4', 0.5], ['B3', 0.5], ['A3', 0.5], ['B3', 0.5],
        ['D4', 0.5], ['C4', 0.5], ['C4', 1],
      ]

      expect(fish!.notes).toHaveLength(expectedVerse.length * 2)
      expect(fish!.notes.slice(0, expectedVerse.length).map(note => [note.pitch, note.dur])).toEqual(expectedVerse)
      expect(fish!.notes.slice(expectedVerse.length).map(note => [note.pitch, note.dur])).toEqual(expectedVerse)
    })

    it('duke song follows the corrected Eb-major melody with lead-in drums', () => {
      const duke = MusicBox.SONGS.find(song => song.key === 'duke')
      expect(duke).toBeDefined()

      const expectedMelody = [
        ['D#4', 0.5], ['F4', 0.5], ['G4', 1], ['D#4', 1],
        ['D#4', 1], ['D#4', 1], ['D#4', 3],
        ['D#4', 1], ['F4', 1], ['F4', 1], ['F4', 1], ['F4', 1], ['F4', 3],
        ['F4', 0.5], ['F4', 0.5], ['G4', 1], ['G4', 1], ['G4', 1],
        ['G4', 0.5], ['G4', 0.5],
        ['G#4', 1], ['G#4', 1], ['G#4', 1], ['G#4', 0.5], ['G#4', 0.5],
        ['G4', 1], ['D#4', 1], ['F4', 1], ['D4', 1], ['D#4', 3],
        ['A#3', 1], ['D#4', 1], ['D#4', 1], ['D#4', 1], ['D#4', 1], ['D#4', 3],
        ['D#4', 1], ['F4', 1], ['F4', 1], ['F4', 1], ['F4', 1], ['F4', 3],
        ['F4', 0.5], ['F4', 0.5], ['G4', 1], ['G4', 1], ['G4', 1],
        ['G4', 0.5], ['G4', 0.5],
        ['G#4', 1], ['G#4', 1], ['G#4', 1], ['G#4', 0.5], ['G#4', 0.5],
        ['G4', 1], ['D#4', 1], ['F4', 1], ['D4', 1], ['D#4', 3], ['', 1],
      ]
      const duration = duke!.notes.reduce((sum, note) => sum + note.dur, 0)

      expect(duration).toBe(65)
      expect(duke!.notes.map(note => [note.pitch, note.dur])).toEqual(expectedMelody)
      expect(duke!.drums.some(drum => drum.at === 0)).toBe(false)
      expect(duke!.drums.filter(drum => drum.kind === 'kick').slice(0, 4).map(drum => drum.at))
        .toEqual([1, 5, 9, 13])
      expect(duke!.drums.filter(drum => drum.kind === 'snare').slice(0, 4).map(drum => drum.at))
        .toEqual([3, 7, 11, 15])
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

    it('renders repeat mode button with a mode-specific icon', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ ...MusicBox.init(), repeatMode: 'shuffle' }),
        Scene.Mount.resolveAll(...resolveMount),
        Scene.expect(Scene.selector('#musicbox-repeat svg')).toExist(),
        Scene.expect(Scene.selector('#musicbox-repeat.repeat-mode-btn--shuffle')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('renders previous and skip buttons beside the song picker label', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with(MusicBox.init()),
        Scene.Mount.resolveAll(...resolveMount),
        Scene.expect(Scene.selector('.musicbox-song-label-row #musicbox-previous svg')).toExist(),
        Scene.expect(Scene.selector('.musicbox-song-label-row #musicbox-skip svg')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('renders stop button when playing', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12, bottomPanelMode: 'keyboard', tempo: 1, lyricsExpanded: false, songOrder: defaultSongOrder(), hiddenSongs: defaultHiddenSongs(), dragIndex: -1 }),
        Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
        Scene.expect(Scene.selector('#musicbox-stop svg')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('play button disabled when playing', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: true, whiteKeys: 12, bottomPanelMode: 'keyboard', tempo: 1, lyricsExpanded: false, songOrder: defaultSongOrder(), hiddenSongs: defaultHiddenSongs(), dragIndex: -1 }),
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
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MIN_WHITE_KEYS, bottomPanelMode: 'keyboard', tempo: 1, lyricsExpanded: false, songOrder: defaultSongOrder(), hiddenSongs: defaultHiddenSongs(), dragIndex: -1 }),
        Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
        Scene.expect(Scene.text('−')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('+ button exists at MAX_WHITE_KEYS', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: MusicBox.MAX_WHITE_KEYS, bottomPanelMode: 'keyboard', tempo: 1, lyricsExpanded: false, songOrder: defaultSongOrder(), hiddenSongs: defaultHiddenSongs(), dragIndex: -1 }),
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

    it('renders compact lower panel dropdown options', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with(MusicBox.init()),
        Scene.Mount.resolveAll(...resolveMount),
        Scene.expect(Scene.text('🎹')).toExist(),
        Scene.expect(Scene.text('🎹🥁')).toExist(),
        Scene.expect(Scene.text('🎹🎹')).toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('does not render bottom keyboard in simple lower panel mode', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ selectedSong: 0, selectedInstrument: 0, isPlaying: false, whiteKeys: 12, bottomPanelMode: 'simple', octaveOffset: 0, bottomShift: 0, topShift: 0, tempo: 1, lyricsExpanded: false, songOrder: defaultSongOrder(), hiddenSongs: defaultHiddenSongs(), dragIndex: -1 }),
        Scene.Mount.resolveAll(resolvePianoTop),
        Scene.expect(Scene.selector('[key="piano-bot"]')).not.toExist(),
        Scene.Command.expectNone(),
      )
    })

    it('renders drumpads instead of the bottom keyboard in drums lower panel mode', () => {
      Scene.scene(
        { update: MusicBox.update, view: MusicBox.view },
        Scene.with({ ...MusicBox.init(), bottomPanelMode: 'drums' }),
        Scene.Mount.resolveAll(resolvePianoTop),
        Scene.expect(Scene.selector('[key="drum-pad"]')).toExist(),
        Scene.expect(Scene.selector('[data-drum-kind="kick"]')).toExist(),
        Scene.expect(Scene.selector('[data-drum-kind="hatClosed"]')).toExist(),
        Scene.expect(Scene.selector('[data-drum-kind="hatOpen"]')).toExist(),
        Scene.expect(Scene.selector('[data-drum-kind="tomLow"]')).toExist(),
        Scene.expect(Scene.selector('[data-drum-kind="tomHigh"]')).toExist(),
        Scene.expect(Scene.selector('[data-drum-kind="clap"]')).not.toExist(),
        Scene.expect(Scene.selector('[data-drum-kind="stomp"]')).not.toExist(),
        Scene.expect(Scene.selector('[data-drum-kind="cheer"]')).not.toExist(),
        Scene.expect(Scene.selector('[key="piano-bot"]')).not.toExist(),
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
          [{ name: 'PlayMusicBox' }, MusicBox.SongEnded({ playbackId: 1 })],
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
        Story.message(MusicBox.SongEnded({ playbackId: 0 })),
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

    it('ToggleSongVisibility does not hide the last visible song', () => {
      const model = {
        ...MusicBox.init(),
        selectedSong: 0,
        hiddenSongs: MusicBox.SONGS.map((_, index) => index !== 0),
      }
      Story.story(
        MusicBox.update,
        Story.with(model),
        Story.message(MusicBox.ToggleSongVisibility({ index: 0 })),
        Story.model((next) => {
          expect(next.hiddenSongs).toStrictEqual(model.hiddenSongs)
          expect(next.selectedSong).toBe(0)
        }),
        Story.Command.expectNone(),
      )
    })

    it('ToggleSongVisibility ignores out-of-bounds song indices', () => {
      const model = MusicBox.init()
      Story.story(
        MusicBox.update,
        Story.with(model),
        Story.message(MusicBox.ToggleSongVisibility({ index: MusicBox.SONGS.length + 10 })),
        Story.model((next) => {
          expect(next.hiddenSongs).toStrictEqual(model.hiddenSongs)
          expect(next.songOrder).toStrictEqual(model.songOrder)
        }),
        Story.Command.expectNone(),
      )
    })

    it('ToggleSongVisibility moves selection when hiding the selected song', () => {
      const model = { ...MusicBox.init(), selectedSong: 0 }
      Story.story(
        MusicBox.update,
        Story.with(model),
        Story.message(MusicBox.ToggleSongVisibility({ index: 0 })),
        Story.model((next) => {
          expect(next.hiddenSongs[0]).toBe(true)
          expect(next.selectedSong).toBe(1)
        }),
        Story.Command.expectNone(),
      )
    })
  })
})
