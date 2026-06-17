import { describe, expect, it, vi } from 'vitest'
import { createMusicBoxAudioRuntime } from './musicboxAudioRuntime'
import { MUSICBOX_FREQUENCIES, Pitch, type Instrument } from './musicboxDomain'

const instrument: Instrument = {
  key: 'test',
  type: 'sine',
  gain: 0.1,
  attack: 0.01,
  decay: 0.01,
  sustain: 1,
  release: 0.05,
  harmonics: [{ ratio: 1, gain: 1 }],
}

describe('musicboxAudioRuntime', () => {
  it('ignores duplicate manual starts for the same pitch', () => {
    const starts: number[] = []
    const ctx = makeContext(starts)
    const hooks = makeHooks()
    const runtime = createMusicBoxAudioRuntime({
      getContext: () => ctx,
      resetContext: vi.fn(),
      frequencies: MUSICBOX_FREQUENCIES,
      hooks,
    })
    const pitch = Pitch.unsafe('C4')

    runtime.startManualNote(pitch, instrument)
    runtime.startManualNote(pitch, instrument)

    expect(starts).toHaveLength(1)
  })

  it('routes manual and scheduled notes through one compressor', () => {
    const starts: number[] = []
    const connections: Array<{ from: string; to: string }> = []
    const ctx = makeContext(starts, connections)
    const hooks = makeHooks()
    const runtime = createMusicBoxAudioRuntime({
      getContext: () => ctx,
      resetContext: vi.fn(),
      frequencies: MUSICBOX_FREQUENCIES,
      hooks,
    })
    const pitch = Pitch.unsafe('C4')

    runtime.startManualNote(pitch, instrument)
    runtime.playScheduledNote({ pitch, duration: 1 }, instrument)

    expect(connections.filter(connection => connection.from === 'compressor' && connection.to === 'destination')).toHaveLength(1)
    expect(connections.filter(connection => connection.from === 'gain' && connection.to === 'compressor')).toHaveLength(2)
  })

  it('routes lofi drum hits through the same compressor', () => {
    const starts: number[] = []
    const stops: number[] = []
    const connections: Array<{ from: string; to: string }> = []
    const ctx = makeContext(starts, connections, stops)
    const hooks = makeHooks()
    const runtime = createMusicBoxAudioRuntime({
      getContext: () => ctx,
      resetContext: vi.fn(),
      frequencies: MUSICBOX_FREQUENCIES,
      hooks,
    })

    runtime.playDrumHit({ kind: 'kick' })
    runtime.playDrumHit({ kind: 'clap' })
    runtime.playDrumHit({ kind: 'tomLow' })

    expect(connections.filter(connection => connection.from === 'compressor' && connection.to === 'destination')).toHaveLength(1)
    expect(connections.filter(connection => connection.from === 'gain' && connection.to === 'compressor').length).toBeGreaterThanOrEqual(3)
    expect(connections.some(connection => connection.from === 'filter' && connection.to === 'gain')).toBe(true)
    expect(hooks.highlightDrum).toHaveBeenCalledWith('kick')
    expect(hooks.highlightDrum).toHaveBeenCalledWith('clap')
    expect(hooks.highlightDrum).toHaveBeenCalledWith('tomLow')
    expect(stops.length).toBeGreaterThan(0)
  })

  it('chokes an open hi-hat when a closed hi-hat plays', () => {
    const starts: number[] = []
    const stops: number[] = []
    const ctx = makeContext(starts, [], stops)
    const runtime = createMusicBoxAudioRuntime({
      getContext: () => ctx,
      resetContext: vi.fn(),
      frequencies: MUSICBOX_FREQUENCIES,
      hooks: makeHooks(),
    })

    runtime.playDrumHit({ kind: 'hatOpen' })
    const scheduledOpenStop = Math.max(...stops)
    runtime.playDrumHit({ kind: 'hatClosed' })

    expect(scheduledOpenStop).toBeGreaterThan(0.4)
    expect(stops.some(stop => stop > 0 && stop < scheduledOpenStop)).toBe(true)
  })
})

const makeHooks = () => ({
  highlightKey: vi.fn(),
  unhighlightKey: vi.fn(),
  unhighlightAllKeys: vi.fn(),
  highlightDrum: vi.fn(),
})

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

const makeContext = (
  starts: number[],
  connections: Array<{ from: string; to: string }> = [],
  stops: number[] = [],
): AudioContext => {
  const kinds = new WeakMap<object, string>()
  const makeNode = (kind: string): AudioNode => {
    const node = {
      connect: (target?: AudioNode) => {
        connections.push({
          from: kind,
          to: target ? kinds.get(target) ?? 'unknown' : 'unknown',
        })
        return target ?? makeNode('node')
      },
      disconnect: () => {},
    } as unknown as AudioNode
    kinds.set(node, kind)
    return node
  }

  return {
    currentTime: 0,
    sampleRate: 44100,
    destination: makeNode('destination') as AudioDestinationNode,
    createDynamicsCompressor: () => Object.assign(makeNode('compressor'), {
      threshold: makeAudioParam(-24),
      knee: makeAudioParam(30),
      ratio: makeAudioParam(12),
      attack: makeAudioParam(0.003),
      release: makeAudioParam(0.25),
    }) as DynamicsCompressorNode,
    createGain: () => Object.assign(makeNode('gain'), {
      gain: makeAudioParam(1),
    }) as GainNode,
    createBiquadFilter: () => Object.assign(makeNode('filter'), {
      type: 'lowpass',
      frequency: makeAudioParam(440),
      Q: makeAudioParam(1),
    }) as BiquadFilterNode,
    createBuffer: (_channels: number, length: number) => {
      const data = new Float32Array(length)
      return { getChannelData: () => data } as unknown as AudioBuffer
    },
    createBufferSource: () => Object.assign(makeNode('bufferSource'), {
      buffer: null,
      start: (when = 0) => {
        starts.push(when)
      },
      stop: (when = 0) => {
        stops.push(when)
      },
    }) as AudioBufferSourceNode,
    createOscillator: () => Object.assign(makeNode('oscillator'), {
      type: 'sine',
      frequency: makeAudioParam(440),
      detune: makeAudioParam(0),
      start: (when = 0) => {
        starts.push(when)
      },
      stop: (when = 0) => {
        stops.push(when)
      },
    }) as OscillatorNode,
  } as unknown as AudioContext
}
