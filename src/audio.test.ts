import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, pop, chime, boing, swoosh, resetContext } from './audio'
import * as MusicBox from './games/musicbox'

const originalAudioContext = globalThis.AudioContext
const rampTargets: number[] = []
let disconnectCount = 0

const makeAudioParam = (initial = 0): AudioParam => ({
  value: initial,
  automationRate: 'a-rate',
  cancelAndHoldAtTime: () => makeAudioParam(initial),
  cancelScheduledValues: () => makeAudioParam(initial),
  exponentialRampToValueAtTime: (value: number) => {
    rampTargets.push(value)
    return makeAudioParam(initial)
  },
  linearRampToValueAtTime: () => makeAudioParam(initial),
  setTargetAtTime: () => makeAudioParam(initial),
  setValueAtTime: () => makeAudioParam(initial),
  setValueCurveAtTime: () => makeAudioParam(initial),
} as unknown as AudioParam)

const makeAudioNode = (): AudioNode => ({
  connect: () => makeAudioNode(),
  disconnect: () => { disconnectCount += 1 },
} as unknown as AudioNode)

class MockAudioContext {
  static created = 0

  state: AudioContextState = 'running'
  currentTime = 0
  destination = makeAudioNode() as AudioDestinationNode

  constructor() {
    MockAudioContext.created += 1
  }

  createOscillator(): OscillatorNode {
    return {
      ...makeAudioNode(),
      type: 'sine',
      frequency: makeAudioParam(440),
      detune: makeAudioParam(0),
      start: () => {},
      stop: () => {},
      onended: null,
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
  resetContext()
  MockAudioContext.created = 0
  rampTargets.length = 0
  disconnectCount = 0
  globalThis.AudioContext = originalAudioContext
  vi.useRealTimers()
})

describe('audio', () => {
  it('click returns command with PlayClick name', () => {
    const cmd = click('msg')
    expect(cmd.name).toBe('PlayClick')
  })

  it('pop returns command with PlayPop name', () => {
    const cmd = pop('msg')
    expect(cmd.name).toBe('PlayPop')
  })

  it('chime returns command with PlayChime name', () => {
    const cmd = chime('msg')
    expect(cmd.name).toBe('PlayChime')
  })

  it('boing returns command with PlayBoing name', () => {
    const cmd = boing('msg')
    expect(cmd.name).toBe('PlayBoing')
  })

  it('swoosh returns command with PlaySwoosh name', () => {
    const cmd = swoosh('msg')
    expect(cmd.name).toBe('PlaySwoosh')
  })

  it('click produces the correct result message', async () => {
    const cmd = click('result')
    const result = await Effect.runPromise(cmd.effect)
    expect(result).toBe('result')
  })

  it('uses a quiet exponential fade target', async () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext

    await Effect.runPromise(click('result').effect)

    expect(rampTargets).toContain(0.0001)
  })

  it('disconnects tone nodes even when oscillator onended does not fire', async () => {
    vi.useFakeTimers()
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext

    await Effect.runPromise(click('result').effect)
    expect(disconnectCount).toBe(0)

    vi.advanceTimersByTime(111)

    expect(disconnectCount).toBe(2)
  })

  it('shares one AudioContext between simple sounds and MusicBox notes', async () => {
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext

    const result = await Effect.runPromise(click('result').effect)
    expect(result).toBe('result')

    MusicBox.update(MusicBox.init(), MusicBox.NoteOn({ pitch: 'C4' }))

    expect(MockAudioContext.created).toBe(1)
  })
})
