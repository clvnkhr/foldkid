import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, pop, chime, boing, swoosh, cardDrop, resetContext, warmAudio } from './audio'
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
  it.each(['throw', 'reject'] as const)('does not interrupt gestures or feedback commands when audio resume %s fails', async failure => {
    vi.useFakeTimers()
    class UnavailableContext extends MockAudioContext {
      override state: AudioContextState = 'suspended'
      override resume(): Promise<void> {
        if (failure === 'throw') throw new Error('resume unavailable')
        return Promise.reject(new Error('resume rejected'))
      }
    }
    globalThis.AudioContext = UnavailableContext as unknown as typeof AudioContext
    expect(() => warmAudio()).not.toThrow()
    expect(await Effect.runPromise(click('result').effect)).toBe('result')
    await Promise.resolve()
    vi.runAllTimers()
  })

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


describe('tarot paper and landing sound', () => {
  const fixture = (failFilter = false) => {
    const sources: AudioScheduledSourceNode[] = []
    const stops: number[] = []
    let samples = new Float32Array()
    class PaperContext extends MockAudioContext {
      sampleRate = 48000
      createBuffer(_channels: number, length: number): AudioBuffer {
        samples = new Float32Array(length)
        return { getChannelData: () => samples } as unknown as AudioBuffer
      }
      createBufferSource(): AudioBufferSourceNode {
        const node = { ...makeAudioNode(), buffer: null, onended: null,
          start: vi.fn(), stop: vi.fn((at?: number) => { if (at !== undefined) stops.push(at) }),
        } as unknown as AudioBufferSourceNode
        sources.push(node)
        return node
      }
      createBiquadFilter(): BiquadFilterNode {
        if (failFilter) throw new Error('filter unavailable')
        return { ...makeAudioNode(), Q: makeAudioParam(), frequency: makeAudioParam(), type: 'bandpass' } as unknown as BiquadFilterNode
      }
      override createOscillator(): OscillatorNode {
        const node = super.createOscillator()
        node.stop = vi.fn((at?: number) => { if (at !== undefined) stops.push(at) })
        sources.push(node)
        return node
      }
    }
    globalThis.AudioContext = PaperContext as unknown as typeof AudioContext
    return { sources, stops, samples: () => samples }
  }

  it('uses the unlocked shared context, schedules a short flutter and releases every node', async () => {
    vi.useFakeTimers()
    const sound = fixture()
    warmAudio()
    expect(MockAudioContext.created).toBe(1)
    const command = cardDrop('landed')
    expect(command.name).toBe('TarotCardDrop')
    expect(await Effect.runPromise(command.effect)).toBe('landed')
    expect(MockAudioContext.created).toBe(1)
    expect(sound.sources).toHaveLength(2)
    expect(sound.samples().some(sample => sample !== 0)).toBe(true)
    expect(sound.samples().every(sample => Math.abs(sample) <= 1)).toBe(true)
    expect(sound.stops).toHaveLength(2)
    expect(sound.stops.every(stop => stop > 0 && stop <= 0.2)).toBe(true)
    expect(disconnectCount).toBe(0)
    const done = sound.sources[1]!.onended
    if (done) done.call(sound.sources[1]!, new Event('ended'))
    expect(disconnectCount).toBe(5)
    vi.runAllTimers()
    expect(disconnectCount).toBe(5)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('has a bounded cleanup fallback if the audio engine never sends ended', async () => {
    vi.useFakeTimers()
    fixture()
    expect(await Effect.runPromise(cardDrop('done').effect)).toBe('done')
    vi.advanceTimersByTime(300)
    expect(disconnectCount).toBe(5)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resolves and cleans partially created nodes when an audio API fails', async () => {
    vi.useFakeTimers()
    const sound = fixture(true)
    expect(await Effect.runPromise(cardDrop('done').effect)).toBe('done')
    expect(sound.sources).toHaveLength(1)
    expect(sound.sources[0]!.stop).toHaveBeenCalled()
    expect(disconnectCount).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resolves when there is no audio engine', async () => {
    globalThis.AudioContext = undefined as unknown as typeof AudioContext
    expect(await Effect.runPromise(cardDrop('done').effect)).toBe('done')
  })
})
