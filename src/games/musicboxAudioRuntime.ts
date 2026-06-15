import { MutableRef } from 'effect'
import type { FrequencyTable, Instrument, Pitch } from './musicboxDomain'

export type { Instrument } from './musicboxDomain'

export interface KeyHighlightHooks {
  readonly highlightKey: (pitch: string) => void
  readonly unhighlightKey: (pitch: string) => void
  readonly unhighlightAllKeys: () => void
}

export interface ScheduledNote {
  readonly pitch: Pitch
  readonly duration: number
}

export interface MusicBoxAudioRuntime {
  readonly primeFromGesture: () => void
  readonly playScheduledNote: (note: ScheduledNote, instrument: Instrument) => void
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

export const createMusicBoxAudioRuntime = (deps: MusicBoxAudioRuntimeDeps): MusicBoxAudioRuntime => {
  const activeNotes = MutableRef.make(new Map<string, {
    nodes: Array<{ osc: OscillatorNode; gain: GainNode }>
    masterGain: GainNode
    release: number
  }>())

  let masterCompressor: DynamicsCompressorNode | undefined
  let compressorContext: AudioContext | undefined

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

  const connectMasterGain = (ctx: AudioContext, masterGain: GainNode, inst: Instrument): void => {
    const dest = masterCompressor ?? ctx.destination
    if (inst.filterType && inst.filterFreq) {
      const filter = ctx.createBiquadFilter()
      filter.type = inst.filterType
      filter.frequency.value = inst.filterFreq
      filter.Q.value = inst.filterQ ?? 1
      masterGain.connect(filter)
      filter.connect(dest)
    } else {
      masterGain.connect(dest)
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
    startManualNote,
    stopManualNote,
    stopAllManualNotes,
    clearActiveNotes,
    resetGraph,
  }
}
