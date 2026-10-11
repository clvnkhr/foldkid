import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMusicBoxAudioRuntime } from './musicboxAudioRuntime'
import { MUSICBOX_FREQUENCIES, Pitch, type Instrument } from './musicboxDomain'
import { INSTRUMENTS } from './musicboxInstruments'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

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

  for (const inst of INSTRUMENTS) {
    it(`shares ${inst.key}'s spectrum and articulation between manual and sequenced playing`, () => {
      vi.useFakeTimers()
      const manual = makeRig()
      const sequenced = makeRig()
      manual.runtime.startManualNote(Pitch.unsafe('C4'), inst)
      sequenced.runtime.playScheduledNote({ pitch: Pitch.unsafe('C4'), duration: 2 }, inst)
      const spectrum = (rig: ReturnType<typeof makeRig>) => rig.oscillators.map(osc => ({
        type: osc.type, frequency: osc.frequency.value, detune: osc.detune.value,
      }))
      expect(spectrum(manual)).toEqual(spectrum(sequenced))
      expect(manual.filters.map(filter => filter.frequency.value)).toEqual(sequenced.filters.map(filter => filter.frequency.value))
      manual.runtime.clearActiveNotes()
      sequenced.runtime.clearActiveNotes()
      expect(vi.getTimerCount()).toBe(0)
    })

    it(`articulates very short ${inst.key} notes without reversing envelope automation`, () => {
      vi.useFakeTimers()
      const rig = makeRig()
      rig.runtime.playScheduledNote({ pitch: Pitch.unsafe('C4'), duration: 0.01 }, inst)
      const events = rig.gains[0]!.gain.events
      const times = events.map(event => event.time)
      expect(times).toEqual([...times].sort((a, b) => a - b))
      expect(events.at(-1)).toEqual({ type: 'linear', value: 0, time: 0.03 + 0.01 + inst.release })
      expect(rig.oscillators[0]!.stop).toHaveBeenCalledWith(0.03 + 0.01 + inst.release + 0.01)
      vi.runAllTimers()
      expect(rig.nodes.filter(node => node.kind !== 'compressor' && node.kind !== 'destination').every(node => node.disconnect.mock.calls.length === 1)).toBe(true)
    })
  }

  it('gives bell and guitar upper partials shorter natural decays while a key stays held', () => {
    vi.useFakeTimers()
    for (const index of [0, 3]) {
      const inst = INSTRUMENTS[index]!
      const rig = makeRig()
      rig.runtime.startManualNote(Pitch.unsafe('C4'), inst)
      const naturalDecays = rig.gains.slice(1, inst.harmonics.length + 1).map(gain =>
        gain.gain.events.find(event => event.type === 'exponential')!,
      )
      expect(naturalDecays).toHaveLength(inst.harmonics.length)
      expect(naturalDecays.every(event => event.value > 0 && event.value < 0.0001)).toBe(true)
      expect(naturalDecays.at(-1)!.time).toBeLessThan(naturalDecays[0]!.time)
      expect(rig.gains[0]!.gain.events.at(-1)!.value).toBe(inst.gain * inst.sustain)
      rig.runtime.clearActiveNotes()
    }
  })

  it('fades flute vibrato in after the attack and sends it to pitch, with a quiet filtered breath layer', () => {
    vi.useFakeTimers()
    const inst = INSTRUMENTS[1]!
    const rig = makeRig()
    rig.runtime.startManualNote(Pitch.unsafe('C4'), inst)
    const lfo = rig.oscillators.at(-1)!
    expect(lfo.frequency.value).toBe(inst.vibratoFreq)
    const vibrato = rig.gains[inst.harmonics.length + 1]!
    expect(vibrato.gain.events).toEqual([
      { type: 'set', value: 0, time: 0 },
      { type: 'set', value: 0, time: inst.vibratoDelay },
      { type: 'linear', value: inst.vibratoDepth, time: inst.vibratoDelay! + 0.16 },
    ])
    for (const osc of rig.oscillators.slice(0, -1)) expect(vibrato.connect).toHaveBeenCalledWith(osc.detune)
    expect(rig.bufferSources[0]!.loop).toBe(true)
    expect(rig.filters.at(-1)!.type).toBe('bandpass')
    expect(rig.gains.at(-1)!.gain.value).toBeLessThan(0.04)
    rig.runtime.stopManualNote(Pitch.unsafe('C4'))
    vi.runAllTimers()
    expect(rig.bufferSources[0]!.disconnect).toHaveBeenCalledOnce()
    expect(lfo.disconnect).toHaveBeenCalledOnce()
    expect(rig.filters.every(filter => filter.disconnect.mock.calls.length === 1)).toBe(true)
  })

  it.each([0.002, 0.02])('holds the actual envelope level when releasing after %s seconds without cancelAndHoldAtTime', (elapsed) => {
    vi.useFakeTimers()
    const rig = makeRig({ cancelAndHold: false })
    const inst = { ...instrument, attack: 0.01, decay: 0.04, sustain: 0.4 }
    rig.runtime.startManualNote(Pitch.unsafe('C4'), inst)
    rig.context.currentTime = elapsed
    rig.runtime.stopManualNote(Pitch.unsafe('C4'))
    const events = rig.gains[0]!.gain.events
    const expected = elapsed < inst.attack
      ? inst.gain * elapsed / inst.attack
      : inst.gain * (1 + (inst.sustain - 1) * (elapsed - inst.attack) / inst.decay)
    expect(events.at(-2)).toEqual({ type: 'set', value: expected, time: elapsed })
    expect(events.at(-1)).toEqual({ type: 'linear', value: 0, time: elapsed + inst.release })
    expect(rig.gains[0]!.gain.cancelScheduledValues).toHaveBeenCalledWith(elapsed)
    vi.runAllTimers()
    expect(rig.oscillators[0]!.disconnect).toHaveBeenCalledOnce()
  })

  it('holds with cancelAndHoldAtTime when supported and safely falls back if the method rejects', () => {
    vi.useFakeTimers()
    const rig = makeRig()
    rig.runtime.startManualNote(Pitch.unsafe('C4'), instrument)
    rig.context.currentTime = 0.005
    const param = rig.gains[0]!.gain
    vi.mocked(param.cancelAndHoldAtTime).mockImplementation(() => { throw new Error('unsupported') })
    expect(() => rig.runtime.stopManualNote(Pitch.unsafe('C4'))).not.toThrow()
    expect(param.cancelAndHoldAtTime).toHaveBeenCalledWith(0.005)
    expect(param.events.at(-2)).toEqual({ type: 'set', value: 0.05, time: 0.005 })
    vi.runAllTimers()
  })

  it('clears scheduled voices and released tails as well as simultaneous held notes on reset', () => {
    vi.useFakeTimers()
    const rig = makeRig()
    rig.runtime.startManualNote(Pitch.unsafe('C4'), INSTRUMENTS[1]!)
    rig.runtime.startManualNote(Pitch.unsafe('E4'), INSTRUMENTS[3]!)
    rig.runtime.stopManualNote(Pitch.unsafe('E4'))
    rig.runtime.playScheduledNote({ pitch: Pitch.unsafe('G4'), duration: 8 }, INSTRUMENTS[0]!)
    expect(vi.getTimerCount()).toBe(2)
    rig.runtime.resetGraph()
    expect(vi.getTimerCount()).toBe(0)
    expect(rig.nodes.filter(node => node.kind !== 'destination').every(node => node.disconnect.mock.calls.length === 1)).toBe(true)
    expect(rig.hooks.unhighlightAllKeys).toHaveBeenCalledOnce()
    expect(rig.resetContext).toHaveBeenCalledOnce()
    expect(rig.oscillators.every(osc => osc.stop.mock.calls.some(([when]) => when === undefined))).toBe(true)
    rig.runtime.resetGraph()
    expect(rig.nodes.filter(node => node.kind !== 'destination').every(node => node.disconnect.mock.calls.length === 1)).toBe(true)
  })

  it('releases all manual notes without stopping a sequenced voice, then clears its remaining tail', () => {
    vi.useFakeTimers()
    const rig = makeRig()
    rig.runtime.startManualNote(Pitch.unsafe('C4'), instrument)
    rig.runtime.startManualNote(Pitch.unsafe('E4'), instrument)
    rig.runtime.playScheduledNote({ pitch: Pitch.unsafe('G4'), duration: 4 }, instrument)
    rig.runtime.stopAllManualNotes()
    expect(rig.hooks.unhighlightKey.mock.calls).toEqual([['C4'], ['E4']])
    vi.advanceTimersByTime(150)
    expect(rig.oscillators.map(osc => osc.disconnect.mock.calls.length)).toEqual([1, 1, 0])
    rig.runtime.clearActiveNotes()
    expect(rig.oscillators.map(osc => osc.disconnect.mock.calls.length)).toEqual([1, 1, 1])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('treats scheduled duration as tempo-adjusted seconds, with only the release tail extending it', () => {
    vi.useFakeTimers()
    const rig = makeRig()
    rig.runtime.playScheduledNote({ pitch: Pitch.unsafe('C4'), duration: 0.175 }, instrument)
    expect(rig.gains[0]!.gain.events.at(-2)!.type).toBe('set')
    expect(rig.gains[0]!.gain.events.at(-2)!.value).toBe(0.1)
    expect(rig.gains[0]!.gain.events.at(-2)!.time).toBeCloseTo(0.205)
    expect(rig.gains[0]!.gain.events.at(-1)!.time).toBeCloseTo(0.255)
    vi.runAllTimers()
  })

  it('releases only accompaniment, preserving same-pitch melody and manual voices', () => {
    vi.useFakeTimers()
    const rig = makeRig()
    const pitch = Pitch.unsafe('C4')
    rig.runtime.startManualNote(pitch, instrument)
    rig.runtime.playScheduledNote({ pitch, duration: 8 }, instrument)
    rig.runtime.playScheduledNote({ pitch, duration: 8, track: 'melody' }, instrument)
    rig.runtime.playScheduledNote({ pitch, duration: 8, track: 'accompaniment' }, instrument)
    rig.context.currentTime = 0.1
    rig.runtime.stopAccompanimentNotes()
    rig.runtime.stopAccompanimentNotes()
    expect(vi.getTimerCount()).toBe(3)
    expect(rig.gains[6]!.gain.events.at(-1)!.time).toBeCloseTo(0.15)
    expect(rig.gains[2]!.gain.events.at(-1)!.time).toBeGreaterThan(8)
    expect(rig.gains[4]!.gain.events.at(-1)!.time).toBeGreaterThan(8)
    expect(rig.hooks.unhighlightKey).not.toHaveBeenCalled()
    expect(rig.hooks.unhighlightAllKeys).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(rig.oscillators.map(osc => osc.disconnect.mock.calls.length)).toEqual([0, 0, 0, 1])
    rig.runtime.startManualNote(pitch, instrument)
    expect(rig.oscillators).toHaveLength(4)
    rig.runtime.clearActiveNotes()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops both scheduled tracks without touching the held manual note or leaving their old timers', () => {
    vi.useFakeTimers()
    const rig = makeRig()
    rig.runtime.startManualNote(Pitch.unsafe('C4'), instrument)
    rig.runtime.playScheduledNote({ pitch: Pitch.unsafe('E4'), duration: 8 }, instrument)
    rig.runtime.playScheduledNote({ pitch: Pitch.unsafe('G4'), duration: 8, track: 'accompaniment' }, instrument)
    rig.context.currentTime = 0.1
    rig.runtime.stopScheduledNotes()
    rig.runtime.stopScheduledNotes()
    expect(vi.getTimerCount()).toBe(2)
    expect(rig.hooks.unhighlightKey).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(rig.oscillators.map(osc => osc.disconnect.mock.calls.length)).toEqual([0, 1, 1])
    expect(vi.getTimerCount()).toBe(0)
    rig.runtime.stopManualNote(Pitch.unsafe('C4'))
    vi.runAllTimers()
    expect(rig.oscillators.every(osc => osc.disconnect.mock.calls.length === 1)).toBe(true)
  })

  it('owns every filter, LFO, noise source and timer when stopping or resetting accompaniment', () => {
    vi.useFakeTimers()
    const rig = makeRig()
    rig.runtime.playScheduledNote({ pitch: Pitch.unsafe('C3'), duration: 8, track: 'accompaniment' }, INSTRUMENTS[1]!)
    rig.runtime.playScheduledNote({ pitch: Pitch.unsafe('E3'), duration: 8, track: 'accompaniment' }, INSTRUMENTS[3]!)
    rig.context.currentTime = 0.1
    rig.runtime.stopAccompanimentNotes()
    expect(vi.getTimerCount()).toBe(2)
    rig.runtime.resetGraph()
    expect(vi.getTimerCount()).toBe(0)
    vi.runAllTimers()
    expect(rig.nodes.filter(node => node.kind !== 'destination').every(node => node.disconnect.mock.calls.length === 1)).toBe(true)
    expect(rig.oscillators.every(osc => osc.stop.mock.calls.some(([when]) => when === undefined))).toBe(true)
    expect(rig.bufferSources.every(source => source.stop.mock.calls.some(([when]) => when === undefined))).toBe(true)
    expect(rig.resetContext).toHaveBeenCalledOnce()
  })

  it('gracefully stops sequenced and manual voices without leaving the original song cleanup timer alive', () => {
    vi.useFakeTimers()
    const rig = makeRig()
    rig.runtime.startManualNote(Pitch.unsafe('C4'), instrument)
    rig.runtime.playScheduledNote({ pitch: Pitch.unsafe('G4'), duration: 8 }, instrument)
    expect(vi.getTimerCount()).toBe(1)
    rig.context.currentTime = 0.1
    rig.runtime.stopAllNotes()
    expect(vi.getTimerCount()).toBe(2)
    expect(rig.gains[0]!.gain.events.at(-1)!.time).toBeCloseTo(0.15)
    expect(rig.gains[2]!.gain.events.at(-1)!.time).toBeCloseTo(0.15)
    rig.runtime.stopAllNotes()
    expect(vi.getTimerCount()).toBe(2)
    vi.runAllTimers()
    expect(rig.nodes.filter(node => node.kind !== 'compressor' && node.kind !== 'destination').every(node => node.disconnect.mock.calls.length === 1)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('continues the actual scheduled release level when Stop lands in the tail on Safari without cancelAndHold', () => {
    vi.useFakeTimers()
    const rig = makeRig({ cancelAndHold: false })
    rig.runtime.playScheduledNote({ pitch: Pitch.unsafe('C4'), duration: 0.2 }, instrument)
    rig.context.currentTime = 0.255
    rig.runtime.stopAllNotes()
    expect(rig.gains[0]!.gain.events.at(-2)!.value).toBeCloseTo(0.05)
    expect(rig.gains[0]!.gain.events.at(-2)!.time).toBe(0.255)
    expect(vi.getTimerCount()).toBe(1)
    vi.runAllTimers()
  })

  it('bounds repeated scheduled voices and cleans every retired source', () => {
    vi.useFakeTimers()
    const rig = makeRig()
    for (let index = 0; index < 40; index++) rig.runtime.playScheduledNote({ pitch: Pitch.unsafe('C4'), duration: 8 }, instrument)
    expect(vi.getTimerCount()).toBe(32)
    expect(rig.oscillators.filter(osc => osc.disconnect.mock.calls.length === 0)).toHaveLength(32)
    rig.runtime.clearActiveNotes()
    expect(vi.getTimerCount()).toBe(0)
    expect(rig.oscillators.every(osc => osc.disconnect.mock.calls.length === 1)).toBe(true)
  })

  it('omits ultrasonic partials for high-register notes and keeps each voice normalized', () => {
    vi.useFakeTimers()
    const rig = makeRig({ sampleRate: 22050 })
    rig.runtime.startManualNote(Pitch.unsafe('C9'), INSTRUMENTS[0]!)
    expect(rig.oscillators).toHaveLength(1)
    expect(rig.oscillators[0]!.frequency.value).toBe(MUSICBOX_FREQUENCIES.get('C9'))
    expect(rig.gains[1]!.gain.value).toBe(1)
    rig.runtime.clearActiveNotes()
  })

  it('ignores invalid durations and unavailable or closed audio', () => {
    vi.useFakeTimers()
    const rig = makeRig()
    for (const duration of [0, -1, NaN, Infinity]) rig.runtime.playScheduledNote({ pitch: Pitch.unsafe('C4'), duration }, instrument)
    expect(rig.oscillators).toHaveLength(0)
    const absent = createMusicBoxAudioRuntime({ getContext: () => undefined, resetContext: vi.fn(), frequencies: MUSICBOX_FREQUENCIES, hooks: makeHooks() })
    expect(() => {
      absent.primeFromGesture()
      absent.startManualNote(Pitch.unsafe('C4'), instrument)
      absent.playScheduledNote({ pitch: Pitch.unsafe('C4'), duration: 1 }, instrument)
      absent.playDrumHit({ kind: 'kick' })
      absent.stopAllManualNotes()
      absent.stopAccompanimentNotes()
      absent.stopScheduledNotes()
      absent.resetGraph()
    }).not.toThrow()
    rig.context.state = 'closed'
    rig.runtime.startManualNote(Pitch.unsafe('C4'), instrument)
    expect(rig.oscillators).toHaveLength(0)
  })

  it('cleans a partially created voice when a Web Audio method rejects', () => {
    vi.useFakeTimers()
    const rig = makeRig()
    rig.context.createOscillator = vi.fn(() => { throw new Error('audio unavailable') })
    expect(() => rig.runtime.startManualNote(Pitch.unsafe('C4'), INSTRUMENTS[1]!)).not.toThrow()
    expect(rig.gains[0]!.disconnect).toHaveBeenCalledOnce()
    expect(rig.filters[0]!.disconnect).toHaveBeenCalledOnce()
    expect(rig.hooks.highlightKey).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('safely handles context/compressor creation failure and can recover on a later gesture', () => {
    vi.useFakeTimers()
    const rig = makeRig()
    const compressor = rig.context.createDynamicsCompressor
    rig.context.createDynamicsCompressor = vi.fn(() => { throw new Error('audio unavailable') })
    expect(() => rig.runtime.primeFromGesture()).not.toThrow()
    rig.runtime.startManualNote(Pitch.unsafe('C4'), instrument)
    expect(rig.hooks.highlightKey).not.toHaveBeenCalled()
    rig.context.createDynamicsCompressor = compressor
    rig.runtime.startManualNote(Pitch.unsafe('C4'), instrument)
    expect(rig.hooks.highlightKey).toHaveBeenCalledOnce()
    rig.runtime.clearActiveNotes()
  })
})

const makeHooks = () => ({
  highlightKey: vi.fn(),
  unhighlightKey: vi.fn(),
  unhighlightAllKeys: vi.fn(),
  highlightDrum: vi.fn(),
})

interface AutomationEvent {
  readonly type: 'set' | 'linear' | 'exponential'
  readonly value: number
  readonly time: number
}

type TrackedParam = AudioParam & { readonly events: AutomationEvent[] }
type TrackedNode<T extends AudioNode = AudioNode> = T & {
  readonly kind: string
  readonly connect: ReturnType<typeof vi.fn>
  readonly disconnect: ReturnType<typeof vi.fn>
}
type TrackedGain = TrackedNode<GainNode> & { readonly gain: TrackedParam }
type TrackedOscillator = TrackedNode<OscillatorNode> & { readonly start: ReturnType<typeof vi.fn>; readonly stop: ReturnType<typeof vi.fn> }
type TrackedBufferSource = TrackedNode<AudioBufferSourceNode> & { readonly start: ReturnType<typeof vi.fn>; readonly stop: ReturnType<typeof vi.fn> }

const makeAudioParam = (initial = 0, cancelAndHold = true): TrackedParam => {
  const events: AutomationEvent[] = []
  const param = { value: initial, automationRate: 'a-rate', events } as unknown as TrackedParam
  param.cancelScheduledValues = vi.fn(() => param)
  param.exponentialRampToValueAtTime = vi.fn((value: number, time: number) => {
    events.push({ type: 'exponential', value, time })
    return param
  })
  param.linearRampToValueAtTime = vi.fn((value: number, time: number) => {
    events.push({ type: 'linear', value, time })
    return param
  })
  param.setValueAtTime = vi.fn((value: number, time: number) => {
    events.push({ type: 'set', value, time })
    return param
  })
  param.setTargetAtTime = vi.fn(() => param)
  param.setValueCurveAtTime = vi.fn(() => param)
  if (cancelAndHold) param.cancelAndHoldAtTime = vi.fn(() => param)
  return param
}

const makeRig = (
  options: { readonly cancelAndHold?: boolean; readonly sampleRate?: number } = {},
  starts: number[] = [],
  connections: Array<{ from: string; to: string }> = [],
  stops: number[] = [],
) => {
  const nodes: TrackedNode[] = []
  const gains: TrackedGain[] = []
  const oscillators: TrackedOscillator[] = []
  const bufferSources: TrackedBufferSource[] = []
  const filters: TrackedNode<BiquadFilterNode>[] = []
  const kinds = new WeakMap<object, string>()
  const makeNode = (kind: string): TrackedNode => {
    const node = {
      kind,
      connect: vi.fn((target?: AudioNode | AudioParam) => {
        connections.push({ from: kind, to: target ? kinds.get(target) ?? 'unknown' : 'unknown' })
        return target
      }),
      disconnect: vi.fn(),
    } as unknown as TrackedNode
    kinds.set(node, kind)
    nodes.push(node)
    return node
  }
  const context = {
    currentTime: 0,
    state: 'running' as AudioContextState,
    sampleRate: options.sampleRate ?? 44100,
    destination: makeNode('destination') as unknown as AudioDestinationNode,
    createDynamicsCompressor: () => Object.assign(makeNode('compressor'), {
      threshold: makeAudioParam(-24), knee: makeAudioParam(30), ratio: makeAudioParam(12),
      attack: makeAudioParam(0.003), release: makeAudioParam(0.25),
    }) as unknown as DynamicsCompressorNode,
    createGain: () => {
      const gain = Object.assign(makeNode('gain'), { gain: makeAudioParam(1, options.cancelAndHold ?? true) }) as TrackedGain
      gains.push(gain)
      return gain
    },
    createBiquadFilter: () => {
      const filter = Object.assign(makeNode('filter'), {
        type: 'lowpass', frequency: makeAudioParam(440), Q: makeAudioParam(1),
      }) as unknown as TrackedNode<BiquadFilterNode>
      filters.push(filter)
      return filter
    },
    createBuffer: (_channels: number, length: number) => {
      const data = new Float32Array(length)
      return { getChannelData: () => data } as unknown as AudioBuffer
    },
    createBufferSource: () => {
      const source = Object.assign(makeNode('bufferSource'), {
        buffer: null, loop: false,
        start: vi.fn((when = 0) => { starts.push(when) }),
        stop: vi.fn((when = 0) => { stops.push(when) }),
      }) as TrackedBufferSource
      bufferSources.push(source)
      return source
    },
    createOscillator: () => {
      const osc = Object.assign(makeNode('oscillator'), {
        type: 'sine', frequency: makeAudioParam(440), detune: makeAudioParam(0),
        start: vi.fn((when = 0) => { starts.push(when) }),
        stop: vi.fn((when = 0) => { stops.push(when) }),
      }) as unknown as TrackedOscillator
      oscillators.push(osc)
      return osc
    },
  }
  const hooks = makeHooks()
  const resetContext = vi.fn()
  const runtime = createMusicBoxAudioRuntime({
    getContext: () => context as unknown as AudioContext, resetContext, frequencies: MUSICBOX_FREQUENCIES, hooks,
  })
  return { runtime, context, hooks, resetContext, nodes, gains, oscillators, bufferSources, filters }
}

const makeContext = (
  starts: number[],
  connections: Array<{ from: string; to: string }> = [],
  stops: number[] = [],
): AudioContext => makeRig({}, starts, connections, stops).context as unknown as AudioContext
