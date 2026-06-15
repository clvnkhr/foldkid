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
    const runtime = createMusicBoxAudioRuntime({
      getContext: () => ctx,
      resetContext: vi.fn(),
      frequencies: MUSICBOX_FREQUENCIES,
      hooks: {
        highlightKey: vi.fn(),
        unhighlightKey: vi.fn(),
        unhighlightAllKeys: vi.fn(),
      },
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
    const runtime = createMusicBoxAudioRuntime({
      getContext: () => ctx,
      resetContext: vi.fn(),
      frequencies: MUSICBOX_FREQUENCIES,
      hooks: {
        highlightKey: vi.fn(),
        unhighlightKey: vi.fn(),
        unhighlightAllKeys: vi.fn(),
      },
    })
    const pitch = Pitch.unsafe('C4')

    runtime.startManualNote(pitch, instrument)
    runtime.playScheduledNote({ pitch, duration: 1 }, instrument)

    expect(connections.filter(connection => connection.from === 'compressor' && connection.to === 'destination')).toHaveLength(1)
    expect(connections.filter(connection => connection.from === 'gain' && connection.to === 'compressor')).toHaveLength(2)
  })

  it('routes lofi drum hits through the same compressor', () => {
    const starts: number[] = []
    const connections: Array<{ from: string; to: string }> = []
    const ctx = makeContext(starts, connections)
    const runtime = createMusicBoxAudioRuntime({
      getContext: () => ctx,
      resetContext: vi.fn(),
      frequencies: MUSICBOX_FREQUENCIES,
      hooks: {
        highlightKey: vi.fn(),
        unhighlightKey: vi.fn(),
        unhighlightAllKeys: vi.fn(),
      },
    })

    runtime.playDrumHit({ kind: 'kick' })
    runtime.playDrumHit({ kind: 'clap' })

    expect(connections.filter(connection => connection.from === 'compressor' && connection.to === 'destination')).toHaveLength(1)
    expect(connections.filter(connection => connection.from === 'gain' && connection.to === 'compressor').length).toBeGreaterThanOrEqual(3)
    expect(connections.some(connection => connection.from === 'filter' && connection.to === 'gain')).toBe(true)
  })
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
      stop: () => {},
    }) as AudioBufferSourceNode,
    createOscillator: () => Object.assign(makeNode('oscillator'), {
      type: 'sine',
      frequency: makeAudioParam(440),
      detune: makeAudioParam(0),
      start: (when = 0) => {
        starts.push(when)
      },
      stop: () => {},
    }) as OscillatorNode,
  } as unknown as AudioContext
}
