import { Effect, MutableRef } from 'effect'

const sharedCtx = MutableRef.make<AudioContext | undefined>(undefined)

const isRetiredContext = (ctx: AudioContext): boolean =>
  ctx.state === 'closed' || ctx.state === 'interrupted'

export const resetContext = (): void => {
  const ctx = MutableRef.get(sharedCtx)
  if (ctx) {
    try { ctx.close() } catch { /* ignore */ }
  }
  MutableRef.set(sharedCtx, undefined)
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
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
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
