import { Effect } from 'effect'

const getAudioContext = (): AudioContext | undefined => {
  try {
    return new AudioContext()
  } catch {
    return undefined
  }
}

const playTone = (
  frequency: number,
  duration: number,
  type: OscillatorType,
): Effect.Effect<void> =>
  Effect.sync(() => {
    const ctx = getAudioContext()
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
    osc.onended = () => ctx.close()
  })

export const click = <Msg>(msg: Msg): Readonly<{ name: string; effect: Effect.Effect<Msg> }> => ({
  name: 'PlayClick',
  effect: playTone(800, 0.06, 'square').pipe(Effect.as(msg)),
})

export const pop = <Msg>(msg: Msg): Readonly<{ name: string; effect: Effect.Effect<Msg> }> => ({
  name: 'PlayPop',
  effect: playTone(500, 0.08, 'sine').pipe(Effect.as(msg)),
})

export const chime = <Msg>(msg: Msg): Readonly<{ name: string; effect: Effect.Effect<Msg> }> => ({
  name: 'PlayChime',
  effect: playTone(880, 0.2, 'sine').pipe(Effect.as(msg)),
})

export const boing = <Msg>(msg: Msg): Readonly<{ name: string; effect: Effect.Effect<Msg> }> => ({
  name: 'PlayBoing',
  effect: playTone(660, 0.15, 'triangle').pipe(Effect.as(msg)),
})

export const swoosh = <Msg>(msg: Msg): Readonly<{ name: string; effect: Effect.Effect<Msg> }> => ({
  name: 'PlaySwoosh',
  effect: playTone(300, 0.12, 'triangle').pipe(Effect.as(msg)),
})
