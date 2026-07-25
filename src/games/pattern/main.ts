import { Effect, Match as M, pipe, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { getContext, playTone } from '../../audio'
import { t } from '../../i18n'

const TILE_COUNT = 4

export const Model = S.Struct({
  score: S.Number,
  highScore: S.Number,
  sequence: S.Array(S.Number),
  showIndex: S.Number,
  gameState: S.Union([S.Literal('idle'), S.Literal('showing'), S.Literal('playing'), S.Literal('ended')]),
  playerIndex: S.Number,
  wrongTile: S.Number,
})
export type Model = typeof Model.Type

export const init: Model = {
  score: 0,
  highScore: 0,
  sequence: [],
  showIndex: -1,
  gameState: 'idle',
  playerIndex: 0,
  wrongTile: -1,
}

export const ClickedTile = m('PatClickedTile', { index: S.Number })
export const StartGame = m('PatStartGame')
export const SoundPlayed = m('PatSoundPlayed')
export const ShowTile = m('PatShowTile', { idx: S.Number })
export const StartPlaying = m('PatStartPlaying')

export const Message = S.Union([ClickedTile, StartGame, SoundPlayed, ShowTile, StartPlaying])
export type Message = typeof Message.Type

const rng = (n: number): number => Math.floor(Math.random() * n)

const genSeq = (len: number): number[] =>
  Array.from({ length: len }, () => rng(TILE_COUNT))

const TILE_FREQUENCIES = [523, 659, 784, 1047]
const TILE_FLASH_MS = 500

const ascend = <Msg>(msg: Msg) => ({
  name: 'PlayAscend' as const,
  effect: playTone(660, 0.15, 'sine').pipe(Effect.as(msg)),
})

const descend = <Msg>(msg: Msg) => ({
  name: 'PlayDescend' as const,
  effect: playTone(220, 0.4, 'triangle').pipe(Effect.as(msg)),
})

const correct = <Msg>(msg: Msg) => ({
  name: 'PlayCorrect' as const,
  effect: Effect.sync(() => {
    const ctx = getContext()
    if (!ctx) return
    const now = ctx.currentTime
    const t = (freq: number, start: number, dur: number, type: OscillatorType = 'sine') => {
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
    t(523, now, 0.07, 'triangle')
    t(659, now + 0.07, 0.07, 'triangle')
    t(784, now + 0.14, 0.15, 'triangle')
  }).pipe(Effect.as(msg)),
})

const buildShowCommands = (seq: number[], muted: boolean): ReadonlyArray<Command.Command<Message>> => {
  const cmds: Command.Command<Message>[] = []
  for (let i = 0; i < seq.length; i++) {
    const tile = seq[i] as number
    cmds.push({
      name: `ShowTile${i}` as const,
      effect: pipe(
        Effect.sleep(i * TILE_FLASH_MS),
        Effect.flatMap(() => muted ? Effect.void : playTone(TILE_FREQUENCIES[tile]!, 0.15, 'sine')),
        Effect.as(ShowTile({ idx: i })),
      ),
    })
  }
  cmds.push({
    name: 'StartPlaying' as const,
    effect: pipe(
      Effect.sleep(seq.length * TILE_FLASH_MS),
      Effect.as(StartPlaying()),
    ),
  })
  return cmds
}

const tileSound = <Msg>(tile: number, msg: Msg) => ({
  name: `PlayTile${tile}` as const,
  effect: playTone(TILE_FREQUENCIES[tile]!, 0.15, 'sine').pipe(Effect.as(msg)),
})

export const update = (
  model: Model,
  message: Message,
  muted: boolean = false,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      PatStartGame: () => {
        const seq = genSeq(3)
        return [
          { ...init, sequence: seq, gameState: 'showing', highScore: model.highScore } as Model,
          [...(muted ? [] : [ascend(SoundPlayed())]), ...buildShowCommands(seq, muted)],
        ]
      },
      PatShowTile: (msg) => {
        if (model.gameState !== 'showing') return [model, []]
        return [{ ...model, showIndex: msg.idx } as Model, []]
      },
      PatStartPlaying: () => {
        if (model.gameState !== 'showing') return [model, []]
        return [
          { ...model, gameState: 'playing', showIndex: -1, playerIndex: 0, wrongTile: -1 } as Model,
          [],
        ]
      },
      PatClickedTile: (msg) => {
        if (model.gameState !== 'playing') return [model, []]
        const i = msg.index
        if (i < 0 || i >= TILE_COUNT) return [model, []]
        const expected = model.sequence[model.playerIndex]
        if (expected === undefined) return [model, []]
        if (i !== expected) {
          return [
            {
              ...model,
              gameState: 'ended',
              wrongTile: i,
              highScore: Math.max(model.highScore, model.score),
            } as Model,
            muted ? [] : [descend(SoundPlayed())],
          ]
        }
        const nextIdx = model.playerIndex + 1
        if (nextIdx >= model.sequence.length) {
          const newSeq = [...model.sequence, rng(TILE_COUNT)]
          const newScore = model.score + 1
          return [
            {
              ...model,
              score: newScore,
              highScore: Math.max(model.highScore, newScore),
              sequence: newSeq,
              gameState: 'showing',
              playerIndex: 0,
              wrongTile: -1,
            } as Model,
            [...(muted ? [] : [correct(SoundPlayed())]), ...buildShowCommands(newSeq, muted)],
          ]
        }
        return [
          { ...model, playerIndex: nextIdx, wrongTile: -1 } as Model,
          muted ? [] : [tileSound(i, SoundPlayed())],
        ]
      },
      PatSoundPlayed: () => [model, []],
    }),
  )

export const view = (model: Model, language: string = 'en'): Html => {
  const h = html<Message>()

  return h.div([h.Class('page')], [
    h.div([h.Class('card')], [
      h.h1([h.Class('title')], [t('patternTitle', language)]),
      model.gameState === 'idle' || model.gameState === 'ended'
        ? h.div([h.Class('pat-start')], [
            model.gameState === 'ended'
              ? h.p([h.Class('pat-gameover')], [t('patternGameOver', language)])
              : h.p([h.Class('pat-tapstart')], [t('patternTapStart', language)]),
            model.gameState === 'ended'
              ? h.p([h.Class('pat-final-score')], [
                  `${t('patternScore', language)} ${model.score}`,
                  model.score > 0 && model.score >= model.highScore ? ` 🏆 ${t('patternNewHighScore', language)}` : '',
                ])
              : null,
            h.button([h.OnClick(StartGame()), h.Class('btn btn-primary pat-start-btn')], [
              model.gameState === 'ended' ? t('patternPlayAgain', language) : t('patternStart', language),
            ]),
          ])
        : h.div([h.Class('pat-grid')], [
            h.div([h.Class('pat-header')], [
              h.span([h.Class('pat-round')], [`${t('patternRound', language)} ${model.sequence.length}`]),
              h.span([h.Class('pat-score')], [`${t('patternScore', language)} ${model.score}`]),
            ]),
            h.div([h.Class('pat-tiles')], [
              ...[0, 1, 2, 3].map(i => {
                const activeIdx = model.gameState === 'showing' && model.showIndex >= 0 && model.showIndex < model.sequence.length
                  ? model.sequence[model.showIndex] as number
                  : -1
                const isActive = activeIdx === i
                return h.div([
                  h.Class(`pat-tile pat-tile--${i}${isActive ? ' pat-tile--active' : ''}`),
                  h.OnClick(ClickedTile({ index: i })),
                  ...(isActive ? [h.Key(`pat-tile-${i}-${model.showIndex}`)] : []),
                ], [])
              }),
            ]),
            model.gameState === 'playing'
              ? h.div([h.Class('pat-progress')], [
                  ...model.sequence.map((_, idx) =>
                    h.div([h.Class(`pat-dot${idx < model.playerIndex ? ' pat-dot--filled' : ''}`)], []),
                  ),
                ])
              : null,
          ]),
    ]),
  ])
}
