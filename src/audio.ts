import { Effect, MutableRef } from 'effect'

const sharedCtx = MutableRef.make<AudioContext | undefined>(undefined)
let speechWarm = false

const isRetiredContext = (ctx: AudioContext): boolean =>
  ctx.state === 'closed' || ctx.state === 'interrupted'

export const resetContext = (): void => {
  const ctx = MutableRef.get(sharedCtx)
  if (ctx) {
    try { ctx.close() } catch { /* ignore */ }
  }
  MutableRef.set(sharedCtx, undefined)
  speechWarm = false
}

/** Unlock browser audio and speech while still inside a qualifying gesture. */
export const warmAudio = (): void => {
  getContext()
  if (speechWarm || typeof globalThis.speechSynthesis === 'undefined' || typeof globalThis.SpeechSynthesisUtterance === 'undefined') return
  const synth = globalThis.speechSynthesis
  try {
    synth.getVoices()
    synth.resume()
    const unlock = new SpeechSynthesisUtterance(' ')
    unlock.volume = 0
    unlock.rate = 10
    unlock.pitch = 1
    unlock.onend = () => {}
    synth.speak(unlock)
    speechWarm = true
  } catch {
    // A browser may expose speech APIs but still reject the unlock utterance.
  }
}

// NOTE (iOS Safari): AudioContext.resume() and osc.start() only actually
// produce sound when triggered by a qualifying user gesture. Use `OnTouchEnd`
// or `OnPointerUp` (not `OnTouchStart`/`OnPointerDown`) for game interactions
// that call any function in this module.
export const getContext = (): AudioContext | undefined => {
  let ctx = MutableRef.get(sharedCtx)
  if (ctx && isRetiredContext(ctx)) {
    resetContext()
    ctx = undefined
  }
  if (!ctx) {
    try { ctx = new AudioContext() } catch { return undefined }
    MutableRef.set(sharedCtx, ctx)
  }
  if (ctx.state === 'suspended') {
    try { ctx.resume().catch(() => {}) } catch { /* A rejected unlock must not interrupt the gesture. */ }
  }
  return ctx
}

export const playTone = (
  frequency: number,
  duration: number,
  type: OscillatorType,
): Effect.Effect<void> =>
  Effect.sync(() => {
    const ctx = getContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = frequency
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
    let cleaned = false
    const cleanup = (): void => {
      if (cleaned) return
      cleaned = true
      osc.disconnect()
      gain.disconnect()
    }
    osc.onended = cleanup
    globalThis.setTimeout(cleanup, duration * 1000 + 50)
  })

export const click = <Msg>(msg: Msg) => ({
  name: 'PlayClick' as const,
  effect: playTone(800, 0.06, 'square').pipe(Effect.as(msg)),
})

export const pop = <Msg>(msg: Msg) => ({
  name: 'PlayPop' as const,
  effect: playTone(500, 0.08, 'sine').pipe(Effect.as(msg)),
})

export const chime = <Msg>(msg: Msg) => ({
  name: 'PlayChime' as const,
  effect: playTone(880, 0.2, 'sine').pipe(Effect.as(msg)),
})

export const boing = <Msg>(msg: Msg) => ({
  name: 'PlayBoing' as const,
  effect: playTone(660, 0.15, 'triangle').pipe(Effect.as(msg)),
})

export const swoosh = <Msg>(msg: Msg) => ({
  name: 'PlaySwoosh' as const,
  effect: playTone(300, 0.12, 'triangle').pipe(Effect.as(msg)),
})

/** A short paper flutter and soft landing, using the shared, gesture-unlocked context. */
export const cardDrop = <Msg>(msg: Msg) => ({
  name: 'TarotCardDrop' as const,
  effect: Effect.sync(() => {
    const ctx = getContext()
    if (!ctx) return
    const nodes: AudioNode[] = []
    const sources: AudioScheduledSourceNode[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    let cleaned = false
    const cleanup = (): void => {
      if (cleaned) return
      cleaned = true
      if (timer !== undefined) clearTimeout(timer)
      for (const source of sources) {
        source.onended = null
        try { source.stop() } catch { /* A source may already have ended. */ }
      }
      for (const node of nodes) { try { node.disconnect() } catch { /* Release every owned node. */ } }
    }
    const own = <N extends AudioNode>(node: N): N => { nodes.push(node); return node }
    try {
      const at = ctx.currentTime
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.16), ctx.sampleRate)
      const samples = buffer.getChannelData(0)
      for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1
      const paper = own(ctx.createBufferSource())
      sources.push(paper)
      paper.buffer = buffer
      const filter = own(ctx.createBiquadFilter())
      filter.type = 'bandpass'
      filter.Q.value = 0.7
      filter.frequency.setValueAtTime(1900, at)
      filter.frequency.exponentialRampToValueAtTime(650, at + 0.15)
      const flutter = own(ctx.createGain())
      flutter.gain.setValueAtTime(0.0001, at)
      flutter.gain.linearRampToValueAtTime(0.10, at + 0.018)
      flutter.gain.linearRampToValueAtTime(0.025, at + 0.05)
      flutter.gain.linearRampToValueAtTime(0.075, at + 0.085)
      flutter.gain.exponentialRampToValueAtTime(0.0001, at + 0.16)
      paper.connect(filter); filter.connect(flutter); flutter.connect(ctx.destination)
      const tap = own(ctx.createOscillator())
      sources.push(tap)
      tap.type = 'sine'
      tap.frequency.setValueAtTime(150, at + 0.09)
      tap.frequency.exponentialRampToValueAtTime(65, at + 0.18)
      const landing = own(ctx.createGain())
      landing.gain.setValueAtTime(0.0001, at)
      landing.gain.setValueAtTime(0.08, at + 0.09)
      landing.gain.exponentialRampToValueAtTime(0.0001, at + 0.18)
      tap.connect(landing); landing.connect(ctx.destination)
      tap.onended = cleanup
      paper.start(at); paper.stop(at + 0.16)
      tap.start(at + 0.09); tap.stop(at + 0.18)
      timer = globalThis.setTimeout(cleanup, 260)
    } catch { cleanup() }
  }).pipe(Effect.as(msg), Effect.catchCause(() => Effect.succeed(msg))),
})

export const playAudioFile = <Msg>(src: string, msg: Msg) => ({
  name: 'PlayAudioFile' as const,
  args: { src },
  effect: Effect.callback<Msg>((resume) => {
    if (typeof globalThis.Audio === 'undefined') {
      resume(Effect.succeed(msg))
      return Effect.void
    }
    const audio = new Audio(src)
    const cleanup = (): void => {
      audio.removeEventListener('ended', onDone)
      audio.removeEventListener('error', onDone)
    }
    const onDone = (): void => {
      cleanup()
      resume(Effect.succeed(msg))
    }
    audio.addEventListener('ended', onDone)
    audio.addEventListener('error', onDone)
    audio.play().catch(onDone)
    return Effect.sync(cleanup)
  }),
})
