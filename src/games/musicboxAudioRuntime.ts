import { MutableRef } from 'effect'
import type { DrumHit, DrumKind, FrequencyTable, Instrument, Pitch } from './musicboxDomain'

export type { Instrument } from './musicboxDomain'

export interface KeyHighlightHooks {
  readonly highlightKey: (pitch: string) => void
  readonly unhighlightKey: (pitch: string) => void
  readonly unhighlightAllKeys: () => void
  readonly highlightDrum: (kind: DrumKind) => void
}

export interface ScheduledNote {
  readonly pitch: Pitch
  readonly duration: number
}

export interface MusicBoxAudioRuntime {
  readonly primeFromGesture: () => void
  readonly playScheduledNote: (note: ScheduledNote, instrument: Instrument) => void
  readonly playDrumHit: (hit: Omit<DrumHit, 'at'>) => void
  readonly startManualNote: (pitch: Pitch, instrument: Instrument) => void
  readonly stopManualNote: (pitch: Pitch) => void
  readonly stopAllManualNotes: () => void
  readonly clearActiveNotes: () => void
  readonly resetGraph: () => void
}

export interface MusicBoxAudioRuntimeDeps {
  readonly getContext: () => AudioContext | undefined
  readonly resetContext: () => void
  readonly frequencies: FrequencyTable
  readonly hooks: KeyHighlightHooks
}

const SAFETY_MARGIN = 0.03

const DRUM_GAIN: Record<DrumKind, number> = {
  kick: 0.22,
  snare: 0.16,
  hatClosed: 0.06,
  hatOpen: 0.07,
  tomLow: 0.24,
  tomHigh: 0.2,
  clap: 0.16,
  stomp: 0.32,
  cheer: 0.12,
}

export const createMusicBoxAudioRuntime = (deps: MusicBoxAudioRuntimeDeps): MusicBoxAudioRuntime => {
  const activeNotes = MutableRef.make(new Map<string, {
    nodes: Array<{ osc: OscillatorNode; gain: GainNode }>
    masterGain: GainNode
    release: number
  }>())

  let masterCompressor: DynamicsCompressorNode | undefined
  let compressorContext: AudioContext | undefined
  let activeOpenHat: {
    readonly source: AudioBufferSourceNode
    readonly filter: BiquadFilterNode
    readonly gain: GainNode
    readonly cleanupId: ReturnType<typeof setTimeout>
  } | undefined

  const getMusicBoxContext = (): AudioContext | undefined => {
    const ctx = deps.getContext()
    if (!ctx) return undefined
    if (!masterCompressor || compressorContext !== ctx) {
      masterCompressor = ctx.createDynamicsCompressor()
      masterCompressor.threshold.value = -18
      masterCompressor.knee.value = 12
      masterCompressor.ratio.value = 12
      masterCompressor.attack.value = 0.003
      masterCompressor.release.value = 0.1
      masterCompressor.connect(ctx.destination)
      compressorContext = ctx
    }
    return ctx
  }

  const connectToOutput = (ctx: AudioContext, node: AudioNode): void => {
    const dest = masterCompressor ?? ctx.destination
    node.connect(dest)
  }

  const connectMasterGain = (ctx: AudioContext, masterGain: GainNode, inst: Instrument): void => {
    if (inst.filterType && inst.filterFreq) {
      const filter = ctx.createBiquadFilter()
      filter.type = inst.filterType
      filter.frequency.value = inst.filterFreq
      filter.Q.value = inst.filterQ ?? 1
      masterGain.connect(filter)
      connectToOutput(ctx, filter)
    } else {
      connectToOutput(ctx, masterGain)
    }
  }

  const makeNoiseSource = (ctx: AudioContext, duration: number): AudioBufferSourceNode => {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.8
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    return source
  }

  const playNoise = (
    ctx: AudioContext,
    at: number,
    duration: number,
    gainValue: number,
    filterType: BiquadFilterType,
    filterFreq: number,
  ): void => {
    const source = makeNoiseSource(ctx, duration)
    const filter = ctx.createBiquadFilter()
    filter.type = filterType
    filter.frequency.value = filterFreq
    filter.Q.value = 0.7
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(gainValue, at + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    source.connect(filter)
    filter.connect(gain)
    connectToOutput(ctx, gain)
    source.start(at)
    source.stop(at + duration + 0.01)
    setTimeout(() => {
      try { source.stop() } catch { /* already stopped */ }
      source.disconnect()
      filter.disconnect()
      gain.disconnect()
    }, duration * 1000 + 100)
  }

  const playThump = (
    ctx: AudioContext,
    at: number,
    gainValue: number,
    startFreq: number,
    endFreq: number,
    duration: number,
  ): void => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(startFreq, at)
    osc.frequency.exponentialRampToValueAtTime(endFreq, at + duration * 0.65)
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(gainValue, at + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    osc.connect(gain)
    connectToOutput(ctx, gain)
    osc.start(at)
    osc.stop(at + duration + 0.01)
    setTimeout(() => {
      try { osc.stop() } catch { /* already stopped */ }
      osc.disconnect()
      gain.disconnect()
    }, duration * 1000 + 100)
  }

  const playTom = (
    ctx: AudioContext,
    at: number,
    gainValue: number,
    startFreq: number,
    endFreq: number,
    duration: number,
  ): void => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(startFreq, at)
    osc.frequency.exponentialRampToValueAtTime(endFreq, at + duration * 0.7)
    const body = ctx.createOscillator()
    body.type = 'triangle'
    body.frequency.setValueAtTime(startFreq * 1.48, at)
    body.frequency.exponentialRampToValueAtTime(endFreq * 1.25, at + duration * 0.55)
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(gainValue, at + 0.007)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    osc.connect(gain)
    body.connect(gain)
    connectToOutput(ctx, gain)
    osc.start(at)
    body.start(at)
    osc.stop(at + duration + 0.01)
    body.stop(at + duration + 0.01)
    setTimeout(() => {
      try { osc.stop() } catch { /* already stopped */ }
      try { body.stop() } catch { /* already stopped */ }
      osc.disconnect()
      body.disconnect()
      gain.disconnect()
    }, duration * 1000 + 100)
  }

  const playClosedHat = (ctx: AudioContext, at: number, gainValue: number): void => {
    chokeOpenHat(at)
    playNoise(ctx, at, 0.04, gainValue, 'highpass', 6500)
  }

  const cleanupOpenHat = (): void => {
    if (!activeOpenHat) return
    const openHat = activeOpenHat
    activeOpenHat = undefined
    clearTimeout(openHat.cleanupId)
    try { openHat.source.stop() } catch { /* already stopped */ }
    openHat.source.disconnect()
    openHat.filter.disconnect()
    openHat.gain.disconnect()
  }

  const chokeOpenHat = (at: number): void => {
    if (!activeOpenHat) return
    const openHat = activeOpenHat
    activeOpenHat = undefined
    clearTimeout(openHat.cleanupId)
    openHat.gain.gain.cancelScheduledValues(at)
    openHat.gain.gain.setValueAtTime(Math.max(openHat.gain.gain.value, 0.0001), at)
    openHat.gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.025)
    try { openHat.source.stop(at + 0.03) } catch { /* already stopped */ }
    setTimeout(() => {
      openHat.source.disconnect()
      openHat.filter.disconnect()
      openHat.gain.disconnect()
    }, 130)
  }

  const playClap = (ctx: AudioContext, at: number, gainValue: number): void => {
    playNoise(ctx, at, 0.045, gainValue * 0.9, 'bandpass', 1500)
    playNoise(ctx, at + 0.018, 0.055, gainValue * 0.85, 'bandpass', 1900)
    playNoise(ctx, at + 0.043, 0.12, gainValue * 0.7, 'bandpass', 2300)
    playNoise(ctx, at + 0.012, 0.035, gainValue * 0.22, 'highpass', 5200)
  }

  const playStomp = (ctx: AudioContext, at: number, gainValue: number): void => {
    playThump(ctx, at, gainValue, 90, 34, 0.38)
    playThump(ctx, at + 0.018, gainValue * 0.28, 64, 32, 0.42)
    playNoise(ctx, at + 0.006, 0.16, gainValue * 0.42, 'lowpass', 520)
  }

  const playCheer = (ctx: AudioContext, at: number, gainValue: number): void => {
    playNoise(ctx, at, 0.22, gainValue * 0.75, 'bandpass', 950)
    playNoise(ctx, at + 0.045, 0.24, gainValue * 0.82, 'bandpass', 1500)
    playNoise(ctx, at + 0.105, 0.2, gainValue * 0.62, 'bandpass', 2350)
    playNoise(ctx, at + 0.16, 0.12, gainValue * 0.35, 'highpass', 4200)
  }

  const playChokableOpenHat = (ctx: AudioContext, at: number, gainValue: number): void => {
    cleanupOpenHat()
    const source = makeNoiseSource(ctx, 0.46)
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 4800
    filter.Q.value = 0.9
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(gainValue, at + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.46)
    source.connect(filter)
    filter.connect(gain)
    connectToOutput(ctx, gain)
    source.start(at)
    source.stop(at + 0.47)
    activeOpenHat = {
      source,
      filter,
      gain,
      cleanupId: setTimeout(cleanupOpenHat, 570),
    }
  }

  const playDrumHit = (hit: Omit<DrumHit, 'at'>): void => {
    const ctx = getMusicBoxContext()
    if (!ctx) return
    const now = ctx.currentTime + SAFETY_MARGIN
    const gain = DRUM_GAIN[hit.kind] * (hit.gain ?? 1)
    deps.hooks.highlightDrum(hit.kind)

    switch (hit.kind) {
      case 'kick':
        playThump(ctx, now, gain, 130, 48, 0.24)
        break
      case 'snare':
        playNoise(ctx, now, 0.13, gain, 'bandpass', 1600)
        playThump(ctx, now, gain * 0.35, 190, 150, 0.09)
        break
      case 'hatClosed':
        playClosedHat(ctx, now, gain)
        break
      case 'hatOpen':
        playChokableOpenHat(ctx, now, gain)
        break
      case 'tomLow':
        playTom(ctx, now, gain, 170, 92, 0.3)
        break
      case 'tomHigh':
        playTom(ctx, now, gain, 235, 135, 0.24)
        break
      case 'clap':
        playClap(ctx, now, gain)
        break
      case 'stomp':
        playStomp(ctx, now, gain)
        break
      case 'cheer':
        playCheer(ctx, now, gain)
        break
    }
  }

  const playScheduledNote = (note: ScheduledNote, inst: Instrument): void => {
    const ctx = getMusicBoxContext()
    if (!ctx) return
    const freq = deps.frequencies.get(note.pitch)
    if (!freq) return
    const now = ctx.currentTime + SAFETY_MARGIN
    const totalTime = Math.max(note.duration * 0.45, inst.attack + inst.release + 0.02)
    const relStart = now + totalTime - inst.release

    const masterGain = ctx.createGain()

    masterGain.gain.value = 0
    masterGain.gain.setValueAtTime(0, now)
    masterGain.gain.linearRampToValueAtTime(inst.gain, now + inst.attack)
    const decEnd = now + inst.attack + inst.decay
    masterGain.gain.linearRampToValueAtTime(inst.gain * inst.sustain, decEnd)
    if (relStart > decEnd) {
      masterGain.gain.setValueAtTime(inst.gain * inst.sustain, relStart)
    }
    const end = now + totalTime
    masterGain.gain.linearRampToValueAtTime(0, end)

    connectMasterGain(ctx, masterGain, inst)

    const nodes: Array<{ osc: OscillatorNode; gain: GainNode }> = []
    for (const h of inst.harmonics) {
      const osc = ctx.createOscillator()
      osc.type = inst.type
      osc.frequency.value = freq * h.ratio
      if (inst.detune) osc.detune.value = inst.detune
      const hGain = ctx.createGain()
      hGain.gain.value = h.gain
      osc.connect(hGain)
      hGain.connect(masterGain)
      osc.start(now)
      osc.stop(end + 0.01)
      nodes.push({ osc, gain: hGain })
    }

    if (inst.tremoloFreq && inst.tremoloDepth) {
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = inst.tremoloFreq
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = inst.tremoloDepth
      lfo.connect(lfoGain)
      lfoGain.connect(masterGain.gain)
      lfo.start()
      lfo.stop(end + 0.01)
      nodes.push({ osc: lfo, gain: lfoGain })
    }

    setTimeout(() => {
      for (const { osc, gain } of nodes) {
        try { osc.stop() } catch { /* already stopped */ }
        osc.disconnect()
        gain.disconnect()
      }
      masterGain.disconnect()
    }, totalTime * 1000 + 100)
  }

  const startManualNote = (pitch: Pitch, inst: Instrument): void => {
    const freq = deps.frequencies.get(pitch)
    if (!freq || MutableRef.get(activeNotes).has(pitch)) return
    const ctx = getMusicBoxContext()
    if (!ctx) return
    const now = ctx.currentTime
    const masterGain = ctx.createGain()

    masterGain.gain.value = 0
    masterGain.gain.setValueAtTime(0, now)
    masterGain.gain.linearRampToValueAtTime(inst.gain, now + inst.attack)
    const decEnd = now + inst.attack + inst.decay
    masterGain.gain.linearRampToValueAtTime(inst.gain * inst.sustain, decEnd)

    connectMasterGain(ctx, masterGain, inst)

    const nodes: Array<{ osc: OscillatorNode; gain: GainNode }> = []
    for (const h of inst.harmonics) {
      const osc = ctx.createOscillator()
      osc.type = inst.type
      osc.frequency.value = freq * h.ratio
      if (inst.detune) osc.detune.value = inst.detune
      const hGain = ctx.createGain()
      hGain.gain.value = h.gain
      osc.connect(hGain)
      hGain.connect(masterGain)
      osc.start(now)
      nodes.push({ osc, gain: hGain })
    }

    if (inst.tremoloFreq && inst.tremoloDepth) {
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = inst.tremoloFreq
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = inst.tremoloDepth
      lfo.connect(lfoGain)
      lfoGain.connect(masterGain.gain)
      lfo.start()
      nodes.push({ osc: lfo, gain: lfoGain })
    }

    MutableRef.get(activeNotes).set(pitch, { nodes, masterGain, release: inst.release })
    deps.hooks.highlightKey(pitch)
  }

  const stopManualNote = (pitch: Pitch): void => {
    const entry = MutableRef.get(activeNotes).get(pitch)
    if (!entry) return
    const { nodes, masterGain, release } = entry
    MutableRef.get(activeNotes).delete(pitch)
    deps.hooks.unhighlightKey(pitch)
    const ctx = getMusicBoxContext()
    const now = ctx?.currentTime ?? performance.now() / 1000

    if (typeof masterGain.gain.cancelAndHoldAtTime === 'function') {
      masterGain.gain.cancelAndHoldAtTime(now)
    } else {
      masterGain.gain.cancelScheduledValues(now)
      masterGain.gain.setValueAtTime(masterGain.gain.value, now)
    }
    masterGain.gain.linearRampToValueAtTime(0, now + release)

    setTimeout(() => {
      for (const { osc, gain } of nodes) {
        try { osc.stop() } catch { /* already stopped */ }
        osc.disconnect()
        gain.disconnect()
      }
      masterGain.disconnect()
    }, release * 1000 + 50)
  }

  const stopAllManualNotes = (): void => {
    for (const pitch of MutableRef.get(activeNotes).keys()) {
      const typedPitch = deps.frequencies.pitch(pitch)
      if (typedPitch) stopManualNote(typedPitch)
    }
  }

  const clearActiveNotes = (): void => {
    for (const { nodes, masterGain } of MutableRef.get(activeNotes).values()) {
      for (const { osc, gain } of nodes) {
        try { osc.stop() } catch { /* already stopped */ }
        try { osc.disconnect() } catch { /* already disconnected */ }
        try { gain.disconnect() } catch { /* already disconnected */ }
      }
      try { masterGain.disconnect() } catch { /* already disconnected */ }
    }
    MutableRef.get(activeNotes).clear()
    deps.hooks.unhighlightAllKeys()
  }

  const resetGraph = (): void => {
    clearActiveNotes()
    deps.resetContext()
    masterCompressor = undefined
    compressorContext = undefined
  }

  return {
    primeFromGesture: getMusicBoxContext,
    playScheduledNote,
    playDrumHit,
    startManualNote,
    stopManualNote,
    stopAllManualNotes,
    clearActiveNotes,
    resetGraph,
  }
}
