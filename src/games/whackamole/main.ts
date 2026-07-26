import { Effect, Match as M, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { pop, chime, boing, swoosh, getContext, playTone } from '../../audio'
import { t } from '../../i18n'

const HOLE_COUNT = 9

const MOLE_SCORES: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: -3 }

const uhOh = <Msg>(msg: Msg) => ({
  name: 'PlayUhOh' as const,
  effect: Effect.sync(() => {
    const ctx = getContext()
    if (!ctx) return
    const now = ctx.currentTime
    const play = (freq: number, start: number, dur: number, type: OscillatorType = 'sine') => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = type
      o.frequency.value = freq
      g.gain.setValueAtTime(0.15, start)
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      o.connect(g).connect(ctx.destination)
      o.start(start)
      o.stop(start + dur)
    }
    play(520, now, 0.12, 'sine')
    play(370, now + 0.1, 0.28, 'triangle')
  }).pipe(Effect.as(msg)),
})

const MOLE_SOUNDS: Record<number, <Msg>(msg: Msg) => { name: string; effect: Effect.Effect<Msg> }> = { 1: pop, 2: boing, 3: chime, 4: uhOh }

const ascend = <Msg>(msg: Msg) => ({
  name: 'PlayAscend' as const,
  effect: playTone(660, 0.15, 'sine').pipe(Effect.as(msg)),
})

const descend = <Msg>(msg: Msg) => ({
  name: 'PlayDescend' as const,
  effect: playTone(220, 0.4, 'sine').pipe(Effect.as(msg)),
})

export const GameState = S.Union([S.Literal('idle'), S.Literal('playing'), S.Literal('ended')])

export const Model = S.Struct({
  score: S.Number,
  highScore: S.Number,
  timeLeft: S.Number,
  holes: S.Array(S.Number),
  gameState: GameState,
})
export type Model = typeof Model.Type

export const init: Model = {
  score: 0,
  highScore: 0,
  timeLeft: 30,
  holes: new Array(HOLE_COUNT).fill(0) as number[],
  gameState: 'idle',
}

export const ClickedHole = m('WhackClickedHole', { index: S.Number })
export const Tick = m('WhackTick')
export const StartGame = m('WhackStartGame')
export const SoundPlayed = m('WhackSoundPlayed')

export const Message = S.Union([ClickedHole, Tick, StartGame, SoundPlayed])
export type Message = typeof Message.Type

const randomMoleType = (): number => {
  const r = Math.random()
  if (r < 0.45) return 1
  if (r < 0.70) return 2
  if (r < 0.85) return 3
  return 4
}

const randomHoles = (): readonly number[] => {
  const holes = new Array(HOLE_COUNT).fill(0) as number[]
  const count = 2 + Math.floor(Math.random() * 3)
  const positions = new Set<number>()
  while (positions.size < count) {
    positions.add(Math.floor(Math.random() * HOLE_COUNT))
  }
  for (const pos of positions) {
    holes[pos] = randomMoleType()
  }
  return holes
}

export const update = (
  model: Model,
  message: Message,
  muted: boolean = false,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      WhackStartGame: () => {
        const next: Model = { ...model, score: 0, timeLeft: 30, holes: randomHoles(), gameState: 'playing' }
        return [next, muted ? [] : [ascend(SoundPlayed())]]
      },
      WhackTick: () => {
        const nextTime = model.timeLeft - 1
        if (nextTime <= 0) {
          const holes: number[] = new Array(HOLE_COUNT).fill(0)
          const next: Model = { ...model, timeLeft: 0, holes, gameState: 'ended', highScore: Math.max(model.highScore, model.score) }
          return [next, muted ? [] : [descend(SoundPlayed())]]
        }
        const next: Model = { ...model, timeLeft: nextTime, holes: randomHoles() }
        return [next, []]
      },
      WhackClickedHole: (msg) => {
        if (model.gameState !== 'playing') return [model, []]
        const index = msg.index
        if (index < 0 || index >= HOLE_COUNT) return [model, []]
        const moleType = model.holes[index] ?? 0
        if (moleType === 0) {
          const next: Model = { ...model, score: model.score - 1, holes: model.holes }
          return [next, muted ? [] : [swoosh(SoundPlayed())]]
        }
        const newHoles = [...model.holes]
        newHoles[index] = 0
        const scoreChange = MOLE_SCORES[moleType] ?? 1
        const sound = MOLE_SOUNDS[moleType]?.(SoundPlayed())
        const next: Model = { ...model, score: model.score + scoreChange, holes: newHoles }
        return [next, !muted && sound ? [sound] : []]
      },
      WhackSoundPlayed: () => [model, []],
    }),
  )

const moleClass = (type: number | undefined): string => {
  if (type === 0) return 'whack-cell'
  return `whack-cell whack-cell--up whack-mole--type-${type}`
}

export const view = (model: Model, language: string = 'en'): Html => {
  const h = html<Message>()

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.h1([h.Class('title')], [t('whackTitle', language)]),
        model.gameState === 'playing'
          ? h.div([h.Class('whack-header')], [
              h.span([h.Class('whack-score')], [`${t('whackScore', language)} ${model.score}`]),
              h.span([h.Class('whack-time' + (model.timeLeft <= 10 ? ' whack-time--danger' : ''))], [`${t('whackTime', language)} ${model.timeLeft}s`]),
            ])
          : null,
        model.gameState === 'idle' || model.gameState === 'ended'
          ? h.div([h.Class('whack-start')], [
              model.gameState === 'ended'
                ? h.p([h.Class('whack-gameover')], [t('whackGameOver', language)])
                : h.p([h.Class('whack-tapstart')], [t('whackTapStart', language)]),
              model.gameState === 'ended'
                ? h.p([h.Class('whack-final-score')], [
                    `${t('whackScore', language)} ${model.score}`,
                    model.score >= model.highScore && model.score > 0 ? ` 🏆 ${t('whackNewHighScore', language)}` : '',
                  ])
                : null,
              h.button([h.OnClick(StartGame()), h.Class('btn btn-primary whack-start-btn')], [
                model.gameState === 'ended' ? t('whackPlayAgain', language) : t('whackStart', language),
              ]),
            ])
          : h.div([h.Class('whack-grid'), h.OnMount({
              name: 'whackTimer',
              f: () => Stream.tick(1000).pipe(
                Stream.map(() => Tick()),
              ),
            })], [
              ...Array.from({ length: HOLE_COUNT }, (_, i) => {
                const type = model.holes[i] ?? 0
                return h.div(
                  [h.Class(moleClass(type)), h.OnTouchStart(ClickedHole({ index: i }))],
                  [
                    h.div([h.Class('whack-hole')], []),
                    type > 0
                      ? h.div([h.Class('whack-mole')], [
                          h.div([h.Class('whack-mole-head')], [
                            h.div([h.Class('whack-mole-ear whack-mole-ear--l')], []),
                            h.div([h.Class('whack-mole-ear whack-mole-ear--r')], []),
                            h.div([h.Class('whack-mole-eye whack-mole-eye--l')], [
                              h.div([h.Class('whack-mole-pupil')], []),
                            ]),
                            h.div([h.Class('whack-mole-eye whack-mole-eye--r')], [
                              h.div([h.Class('whack-mole-pupil')], []),
                            ]),
                            h.div([h.Class('whack-mole-nose')], []),
                          ]),
                        ])
                      : null,
                  ],
                )
              }),
            ]),
      ]),
    ],
  )
}
