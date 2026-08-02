import { Effect, Match as M, Option as O, Schema as S, Stream } from 'effect'
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

let impactLayer: HTMLElement | null = null

const getImpactLayer = (): HTMLElement => {
  if (!impactLayer || !impactLayer.isConnected) {
    impactLayer = document.createElement('div')
    impactLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;contain:strict'
    impactLayer.setAttribute('aria-hidden', 'true')
    document.body.appendChild(impactLayer)
  }
  return impactLayer
}

const animateImpactPiece = (
  layer: HTMLElement,
  style: string,
  keyframes: Keyframe[],
  duration: number,
  easing: string = 'cubic-bezier(0.16, 0.84, 0.25, 1)',
  text: string = '',
): void => {
  const piece = document.createElement('span')
  piece.textContent = text
  piece.style.cssText = `position:fixed;pointer-events:none;will-change:transform,opacity;${style}`
  layer.appendChild(piece)
  const animation = piece.animate(keyframes, { duration, easing, fill: 'forwards' })
  animation.finished.then(() => piece.remove()).catch(() => piece.remove())
}

// Keep the celebration outside the grid so every hit can briefly paint a large
// part of the viewport without affecting the game board's layout or hit area.
const launchImpact = (index: number, type: number): void => {
  const hole = document.querySelector(`[data-whack-index="${index}"]`) as HTMLElement | null
  if (!hole) return

  const rect = hole.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const layer = getImpactLayer()
  const reach = Math.max(180, Math.min(Math.min(window.innerWidth, window.innerHeight) * 0.55, 520))
  const profiles: Record<number, { colors: readonly string[]; glyphs: readonly string[]; count: number; label: string; labelColor: string }> = {
    1: {
      colors: ['#4ade80', '#38bdf8', '#facc15', '#f472b6', '#ffffff'],
      glyphs: ['✦', '●', '◆', '✹'],
      count: 34,
      label: '+1!',
      labelColor: '#ffffff',
    },
    2: {
      colors: ['#ff3b30', '#ff7a00', '#ffd60a', '#ffffff'],
      glyphs: ['⚡', '✦', '◆', '💥'],
      count: 40,
      label: 'KAPOW!',
      labelColor: '#fff1a8',
    },
    3: {
      colors: ['#fff7a8', '#ffd60a', '#ff9f0a', '#ffffff'],
      glyphs: ['★', '✦', '✧', '●'],
      count: 52,
      label: 'JACKPOT!',
      labelColor: '#fff7a8',
    },
    4: {
      colors: ['#ff7eb6', '#d8b4fe', '#fb7185', '#ffffff'],
      glyphs: ['♥', '✿', '●', '☁'],
      count: 38,
      label: 'OOPS!',
      labelColor: '#ffd1e5',
    },
  }
  const profile = profiles[type] ?? profiles[1]!

  const flashSize = Math.round(reach * (type === 3 ? 2.9 : 2.35))
  animateImpactPiece(
    layer,
    `left:${cx}px;top:${cy}px;width:${flashSize}px;height:${flashSize}px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.96) 0%,${profile.colors[0]}cc 18%,${profile.colors[1]}66 42%,transparent 70%);mix-blend-mode:screen;`,
    [
      { transform: 'translate(-50%, -50%) scale(.08)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0 },
    ],
    640,
    'ease-out',
  )

  for (let ring = 0; ring < 3; ring++) {
    const size = reach * (0.55 + ring * 0.35)
    animateImpactPiece(
      layer,
      `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;border:${Math.max(3, 8 - ring * 2)}px solid ${profile.colors[ring % profile.colors.length]};border-radius:50%;box-shadow:0 0 24px ${profile.colors[ring % profile.colors.length]};`,
      [
        { transform: 'translate(-50%, -50%) scale(.12)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1.8)', opacity: 0 },
      ],
      720 + ring * 120,
      'cubic-bezier(.12,.76,.2,1)',
    )
  }

  for (let particle = 0; particle < profile.count; particle++) {
    const angle = (Math.PI * 2 * particle) / profile.count + (Math.random() - 0.5) * 0.22
    const distance = reach * (0.48 + Math.random() * 0.86)
    const dx = Math.cos(angle) * distance
    const dy = Math.sin(angle) * distance - reach * (0.08 + Math.random() * 0.25)
    const color = profile.colors[particle % profile.colors.length]!
    const glyph = profile.glyphs[particle % profile.glyphs.length]!
    const size = type === 3 ? 22 + Math.random() * 26 : 16 + Math.random() * 22
    const rotation = -240 + Math.random() * 480
    animateImpactPiece(
      layer,
      `left:${cx}px;top:${cy}px;color:${color};font-size:${size}px;font-weight:900;line-height:1;text-shadow:0 0 10px ${color},0 2px 5px rgba(0,0,0,.35);`,
      [
        { transform: `translate(-50%, -50%) scale(.15) rotate(0deg)`, opacity: 0 },
        { offset: 0.12, transform: `translate(-50%, -50%) scale(1.35) rotate(${rotation * 0.16}deg)`, opacity: 1 },
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(.35) rotate(${rotation}deg)`, opacity: 0 },
      ],
      780 + Math.random() * 440,
      'cubic-bezier(0.16, 0.84, 0.25, 1)',
      glyph,
    )
  }

  animateImpactPiece(
    layer,
    `left:${cx}px;top:${cy - reach * 0.12}px;color:${profile.labelColor};font-size:clamp(2rem,8vmin,5.5rem);font-weight:1000;letter-spacing:.04em;white-space:nowrap;text-shadow:0 0 12px ${profile.colors[0]},0 4px 0 rgba(0,0,0,.28),0 10px 25px rgba(0,0,0,.35);`,
    [
      { transform: 'translate(-50%, -50%) scale(.1) rotate(-12deg)', opacity: 0 },
      { offset: 0.2, transform: 'translate(-50%, -50%) scale(1.35) rotate(4deg)', opacity: 1 },
      { transform: `translate(-50%, calc(-50% - ${reach * 0.42}px)) scale(.7) rotate(-5deg)`, opacity: 0 },
    ],
    type === 3 ? 1350 : 1050,
    'cubic-bezier(.12,.9,.16,1)',
    profile.label,
  )
}

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
                  [
                    h.Class(moleClass(type)),
                    h.Attribute('data-whack-index', i.toString()),
                    h.OnPointerDown(() => {
                      if (type > 0) launchImpact(i, type)
                      return O.some(ClickedHole({ index: i }))
                    }),
                  ],
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
