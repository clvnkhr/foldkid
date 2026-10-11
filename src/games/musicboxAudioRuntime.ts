import type { DrumHit, DrumKind, FrequencyTable, Instrument, Pitch } from './musicboxDomain'
import { envelopeLevel, voicePartials } from './musicboxInstruments'

export type { Instrument } from './musicboxDomain'

export interface KeyHighlightHooks {
  readonly highlightKey: (pitch: string) => void
  readonly unhighlightKey: (pitch: string) => void
  readonly unhighlightAllKeys: () => void
  readonly highlightDrum: (kind: DrumKind) => void
}

export interface ScheduledNote {
  readonly pitch: Pitch
  /** Seconds until note-off, already adjusted for the playback tempo. */
  readonly duration: number
  readonly track?: 'melody' | 'accompaniment'
}

export interface MusicBoxAudioRuntime {
  readonly primeFromGesture: () => void
  readonly playScheduledNote: (note: ScheduledNote, instrument: Instrument) => void
  readonly playDrumHit: (hit: Omit<DrumHit, 'at'>) => void
  readonly startManualNote: (pitch: Pitch, instrument: Instrument) => void
  readonly stopManualNote: (pitch: Pitch) => void
  readonly stopAllManualNotes: () => void
  readonly stopAccompanimentNotes: () => void
  readonly stopScheduledNotes: () => void
  readonly stopAllNotes: () => void
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
const MIN_GAIN = 0.00001
const MAX_VOICES = 32

interface ToneVoice {
  readonly context: AudioContext
  readonly nodes: AudioNode[]
  readonly sources: Array<OscillatorNode | AudioBufferSourceNode>
  readonly masterGain: GainNode
  readonly instrument: Instrument
  readonly startedAt: number
  readonly gate?: number
  readonly track?: ScheduledNote['track']
  cleanupId?: ReturnType<typeof setTimeout>
  releasing: boolean
}

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
  const activeNotes = new Map<Pitch, ToneVoice>()
  const voices = new Set<ToneVoice>()

  let masterCompressor: DynamicsCompressorNode | undefined
  let compressorContext: AudioContext | undefined
  let activeOpenHat: {
    readonly source: AudioBufferSourceNode
    readonly filter: BiquadFilterNode
    readonly gain: GainNode
    readonly cleanupId: ReturnType<typeof setTimeout>
  } | undefined

  const getMusicBoxContext = (): AudioContext | undefined => {
    try {
      const ctx = deps.getContext()
      if (!ctx || ctx.state === 'closed') return undefined
      if (!masterCompressor || compressorContext !== ctx) {
        if (masterCompressor) masterCompressor.disconnect()
        masterCompressor = ctx.createDynamicsCompressor()
        masterCompressor.threshold.value = -16
        masterCompressor.knee.value = 18
        masterCompressor.ratio.value = 4
        masterCompressor.attack.value = 0.008
        masterCompressor.release.value = 0.18
        masterCompressor.connect(ctx.destination)
        compressorContext = ctx
      }
      return ctx
    } catch {
      try { masterCompressor?.disconnect() } catch { /* unavailable audio graph */ }
      masterCompressor = undefined
      compressorContext = undefined
      return undefined
    }
  }

  const connectToOutput = (ctx: AudioContext, node: AudioNode): void => {
    const dest = masterCompressor ?? ctx.destination
    node.connect(dest)
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

  const cleanupVoice = (voice: ToneVoice): void => {
    if (voice.cleanupId !== undefined) clearTimeout(voice.cleanupId)
    voice.cleanupId = undefined
    for (const source of voice.sources) {
      try { source.stop() } catch { /* already stopped */ }
    }
    for (const node of voice.nodes) {
      try { node.disconnect() } catch { /* already disconnected */ }
    }
    voices.delete(voice)
  }

  const finishVoiceAt = (voice: ToneVoice, end: number): void => {
    if (voice.cleanupId !== undefined) clearTimeout(voice.cleanupId)
    for (const source of voice.sources) {
      try { source.stop(end + 0.01) } catch { /* source may already have ended */ }
    }
    voice.cleanupId = setTimeout(() => cleanupVoice(voice), Math.max(0, end - voice.context.currentTime) * 1000 + 50)
  }

  const releaseVoice = (voice: ToneVoice): void => {
    if (voice.releasing) return
    voice.releasing = true
    const now = voice.context.currentTime
    const param = voice.masterGain.gain
    const hold = (): void => {
      param.cancelScheduledValues(now)
      const elapsed = now - voice.startedAt
      const level = voice.gate !== undefined && elapsed > voice.gate
        ? envelopeLevel(voice.instrument, voice.gate) * Math.max(0, 1 - (elapsed - voice.gate) / voice.instrument.release)
        : envelopeLevel(voice.instrument, elapsed)
      param.setValueAtTime(level, now)
    }
    try {
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now)
      else hold()
    } catch { hold() }
    param.linearRampToValueAtTime(0, now + voice.instrument.release)
    finishVoiceAt(voice, now + voice.instrument.release)
  }

  // Manual and sequenced notes use exactly the same spectrum, articulation and graph.
  const createVoice = (
    ctx: AudioContext,
    frequency: number,
    inst: Instrument,
    gate?: number,
    track?: ScheduledNote['track'],
  ): ToneVoice | undefined => {
    const partials = voicePartials(inst, frequency, ctx.sampleRate)
    if (partials.length === 0) return undefined
    const now = ctx.currentTime + (gate === undefined ? 0 : SAFETY_MARGIN)
    const nodes: AudioNode[] = []
    const sources: Array<OscillatorNode | AudioBufferSourceNode> = []
    let voice: ToneVoice | undefined
    try {
      const masterGain = ctx.createGain()
      nodes.push(masterGain)
      voice = { context: ctx, nodes, sources, masterGain, instrument: inst, startedAt: now, gate, track, releasing: false }
      masterGain.gain.value = 0
      masterGain.gain.setValueAtTime(0, now)
      const attackEnd = Math.min(inst.attack, gate ?? Infinity)
      if (attackEnd > 0) masterGain.gain.linearRampToValueAtTime(envelopeLevel(inst, attackEnd), now + attackEnd)
      else masterGain.gain.setValueAtTime(inst.gain, now)
      const decayEnd = Math.min(inst.attack + inst.decay, gate ?? Infinity)
      if (decayEnd > attackEnd) masterGain.gain.linearRampToValueAtTime(envelopeLevel(inst, decayEnd), now + decayEnd)
      if (gate !== undefined) {
        if (gate > decayEnd) masterGain.gain.setValueAtTime(envelopeLevel(inst, gate), now + gate)
        masterGain.gain.linearRampToValueAtTime(0, now + gate + inst.release)
      }

      if (inst.filterType && inst.filterFreq) {
        const filter = ctx.createBiquadFilter()
        nodes.push(filter)
        filter.type = inst.filterType
        filter.frequency.value = Math.min(inst.filterFreq, inst.filterRatio ? frequency * inst.filterRatio : inst.filterFreq, ctx.sampleRate * 0.45)
        filter.Q.value = inst.filterQ ?? 0.7
        masterGain.connect(filter)
        connectToOutput(ctx, filter)
      } else connectToOutput(ctx, masterGain)

      const oscillators: OscillatorNode[] = []
      for (const partial of partials) {
        const osc = ctx.createOscillator()
        nodes.push(osc)
        sources.push(osc)
        oscillators.push(osc)
        osc.type = inst.type
        osc.frequency.value = partial.frequency
        osc.detune.value = inst.detune ?? 0
        const gain = ctx.createGain()
        nodes.push(gain)
        gain.gain.value = partial.gain
        if (partial.decay !== undefined) {
          gain.gain.setValueAtTime(partial.gain, now)
          gain.gain.exponentialRampToValueAtTime(MIN_GAIN, now + partial.decay)
        }
        osc.connect(gain)
        gain.connect(masterGain)
        osc.start(now)
      }

      if (inst.vibratoFreq && inst.vibratoDepth) {
        const lfo = ctx.createOscillator()
        nodes.push(lfo)
        sources.push(lfo)
        lfo.type = 'sine'
        lfo.frequency.value = inst.vibratoFreq
        const gain = ctx.createGain()
        nodes.push(gain)
        gain.gain.value = 0
        gain.gain.setValueAtTime(0, now)
        gain.gain.setValueAtTime(0, now + (inst.vibratoDelay ?? 0))
        gain.gain.linearRampToValueAtTime(inst.vibratoDepth, now + (inst.vibratoDelay ?? 0) + 0.16)
        lfo.connect(gain)
        for (const osc of oscillators) gain.connect(osc.detune)
        lfo.start(now)
      }

      if (inst.noiseGain) {
        const source = makeNoiseSource(ctx, inst.noiseDuration ?? 0.25)
        nodes.push(source)
        sources.push(source)
        source.loop = inst.noiseDuration === undefined
        const filter = ctx.createBiquadFilter()
        nodes.push(filter)
        filter.type = inst.noiseFilterType ?? 'bandpass'
        filter.frequency.value = Math.min(Math.max(frequency * 4, 1200), 6500, ctx.sampleRate * 0.4)
        filter.Q.value = 0.6
        const gain = ctx.createGain()
        nodes.push(gain)
        gain.gain.value = inst.noiseGain
        if (inst.noiseDuration) {
          gain.gain.setValueAtTime(inst.noiseGain, now)
          gain.gain.exponentialRampToValueAtTime(MIN_GAIN, now + inst.noiseDuration)
        }
        source.connect(filter)
        filter.connect(gain)
        gain.connect(masterGain)
        source.start(now)
        if (inst.noiseDuration) source.stop(now + inst.noiseDuration)
      }

      if (voices.size >= MAX_VOICES) {
        const oldest = voices.values().next().value
        if (oldest) {
          for (const [pitch, active] of activeNotes) {
            if (active === oldest) {
              activeNotes.delete(pitch)
              deps.hooks.unhighlightKey(pitch)
            }
          }
          cleanupVoice(oldest)
        }
      }
      voices.add(voice)
      if (gate !== undefined) finishVoiceAt(voice, now + gate + inst.release)
      return voice
    } catch {
      if (voice) cleanupVoice(voice)
      else for (const node of nodes) { try { node.disconnect() } catch { /* partial graph */ } }
      return undefined
    }
  }

  const playScheduledNote = (note: ScheduledNote, inst: Instrument): void => {
    if (!Number.isFinite(note.duration) || note.duration <= 0) return
    const frequency = deps.frequencies.get(note.pitch)
    if (!frequency) return
    const ctx = getMusicBoxContext()
    if (ctx) createVoice(ctx, frequency, inst, note.duration, note.track === 'accompaniment' ? 'accompaniment' : 'melody')
  }

  const startManualNote = (pitch: Pitch, inst: Instrument): void => {
    const frequency = deps.frequencies.get(pitch)
    if (!frequency || activeNotes.has(pitch)) return
    const ctx = getMusicBoxContext()
    if (!ctx) return
    const voice = createVoice(ctx, frequency, inst)
    if (!voice) return
    activeNotes.set(pitch, voice)
    deps.hooks.highlightKey(pitch)
  }

  const stopManualNote = (pitch: Pitch): void => {
    const voice = activeNotes.get(pitch)
    if (!voice) return
    activeNotes.delete(pitch)
    deps.hooks.unhighlightKey(pitch)
    try { releaseVoice(voice) } catch { cleanupVoice(voice) }
  }

  const stopAllManualNotes = (): void => {
    for (const pitch of activeNotes.keys()) stopManualNote(pitch)
  }

  const stopAccompanimentNotes = (): void => {
    for (const voice of voices) {
      if (voice.track !== 'accompaniment') continue
      try { releaseVoice(voice) } catch { cleanupVoice(voice) }
    }
  }

  const stopScheduledNotes = (): void => {
    for (const voice of voices) {
      if (voice.track === undefined) continue
      try { releaseVoice(voice) } catch { cleanupVoice(voice) }
    }
  }

  const stopAllNotes = (): void => {
    stopAllManualNotes()
    for (const voice of voices) {
      try { releaseVoice(voice) } catch { cleanupVoice(voice) }
    }
  }

  const clearActiveNotes = (): void => {
    for (const voice of voices) cleanupVoice(voice)
    activeNotes.clear()
    deps.hooks.unhighlightAllKeys()
  }

  const resetGraph = (): void => {
    clearActiveNotes()
    cleanupOpenHat()
    try { masterCompressor?.disconnect() } catch { /* already disconnected */ }
    masterCompressor = undefined
    compressorContext = undefined
    deps.resetContext()
  }

  return {
    primeFromGesture: getMusicBoxContext,
    playScheduledNote,
    playDrumHit,
    startManualNote,
    stopManualNote,
    stopAllManualNotes,
    stopAccompanimentNotes,
    stopScheduledNotes,
    stopAllNotes,
    clearActiveNotes,
    resetGraph,
  }
}
