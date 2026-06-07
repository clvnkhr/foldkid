import { Effect } from 'effect'

let sharedCtx: AudioContext | undefined

const getContext = (): AudioContext | undefined => {
  if (sharedCtx?.state === 'closed') sharedCtx = undefined
  if (!sharedCtx) {
    try { sharedCtx = new AudioContext() } catch { return undefined }
  }
  if (sharedCtx.state === 'suspended') sharedCtx.resume()
  return sharedCtx
}

const playTone = (
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
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }
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
