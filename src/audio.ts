import { Effect } from 'effect'

// AudioContext creation can fail; catch the defect and produce undefined
const getAudioContext: Effect.Effect<AudioContext | undefined> = Effect.sync(
  () => new AudioContext(),
).pipe(Effect.catchDefect(() => Effect.succeed(undefined)))

const playTone = (
  frequency: number,
  duration: number,
  type: OscillatorType,
): Effect.Effect<void> =>
  getAudioContext.pipe(
    Effect.flatMap((ctx) => {
      if (!ctx) return Effect.void
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
      osc.onended = () => ctx.close()
      return Effect.void
    }),
  )

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
