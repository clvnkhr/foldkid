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

interface ImpactOrigin {
  readonly layer: HTMLElement
  readonly cx: number
  readonly cy: number
  readonly reach: number
}

const normalImpact = ({ layer, cx, cy, reach }: ImpactOrigin): void => {
  const colors = ['#22c55e', '#38bdf8', '#facc15', '#f472b6', '#a78bfa']
  const glyphs = ['●', '■', '★']

  for (let particle = 0; particle < 34; particle++) {
    const angle = -Math.PI * (0.12 + Math.random() * 0.76)
    const distance = reach * (0.35 + Math.random() * 0.55)
    const dx = Math.cos(angle) * distance
    const lift = Math.sin(angle) * distance
    const fall = reach * (0.35 + Math.random() * 0.5)
    const color = colors[particle % colors.length]!
    const glyph = glyphs[particle % glyphs.length]!
    const rotation = -180 + Math.random() * 720
    animateImpactPiece(
      layer,
      `left:${cx}px;top:${cy}px;color:${color};font-size:${14 + Math.random() * 20}px;font-weight:900;line-height:1;text-shadow:0 0 7px ${color};`,
      [
        { transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 },
        { offset: 0.15, transform: `translate(-50%,-50%) translate(${dx * 0.48}px,${lift}px) scale(1.25) rotate(${rotation * 0.25}deg)`, opacity: 1 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${fall}px) scale(.65) rotate(${rotation}deg)`, opacity: 0 },
      ],
      900 + Math.random() * 350,
      'cubic-bezier(.17,.67,.28,1)',
      glyph,
    )
  }

  animateImpactPiece(
    layer,
    `left:${cx}px;top:${cy}px;color:#fff;font-size:clamp(2.4rem,9vmin,5.6rem);font-weight:1000;text-shadow:0 5px 0 #16a34a,0 12px 24px rgba(0,0,0,.35);`,
    [
      { transform: 'translate(-50%,-50%) scale(.1)', opacity: 0 },
      { offset: 0.28, transform: 'translate(-50%,-85%) scale(1.25)', opacity: 1 },
      { offset: 0.52, transform: 'translate(-50%,-70%) scale(.9)', opacity: 1 },
      { transform: `translate(-50%,calc(-50% - ${reach * 0.38}px)) scale(.65)`, opacity: 0 },
    ],
    950,
    'cubic-bezier(.2,.9,.3,1.25)',
    'POP!',
  )
}

const angryImpact = ({ layer, cx, cy, reach }: ImpactOrigin): void => {
  const app = document.querySelector('.app') as HTMLElement | null
  app?.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: 'translate(-10px,5px)' },
      { transform: 'translate(9px,-7px)' },
      { transform: 'translate(-6px,-3px)' },
      { transform: 'translate(0,0)' },
    ],
    { duration: 260, easing: 'linear' },
  )

  const blastSize = reach * 1.45
  animateImpactPiece(
    layer,
    `left:${cx}px;top:${cy}px;width:${blastSize}px;height:${blastSize}px;background:linear-gradient(135deg,#ffdf00 0 28%,#ff2d00 29% 62%,#7f0000 63%);clip-path:polygon(50% 0,59% 31%,78% 10%,73% 39%,100% 38%,76% 54%,96% 73%,66% 67%,65% 100%,49% 72%,31% 97%,34% 65%,3% 77%,26% 54%,0 38%,31% 38%,22% 9%,43% 31%);filter:drop-shadow(0 0 24px #ff2d00);`,
    [
      { transform: 'translate(-50%,-50%) scale(.05) rotate(-14deg)', opacity: 1 },
      { offset: 0.32, transform: 'translate(-50%,-50%) scale(1) rotate(6deg)', opacity: 1 },
      { transform: 'translate(-50%,-50%) scale(1.45) rotate(-3deg)', opacity: 0 },
    ],
    650,
    'cubic-bezier(.1,.9,.2,1)',
  )

  for (let ray = 0; ray < 20; ray++) {
    const angle = (360 * ray) / 20 + Math.random() * 9
    const length = reach * (0.4 + Math.random() * 0.55)
    animateImpactPiece(
      layer,
      `left:${cx}px;top:${cy}px;width:${7 + Math.random() * 12}px;height:${length}px;background:${ray % 3 === 0 ? '#1f0700' : ray % 2 === 0 ? '#ffd400' : '#ff3100'};clip-path:polygon(36% 0,100% 0,66% 42%,100% 42%,20% 100%,38% 57%,0 57%);transform-origin:50% 100%;filter:drop-shadow(0 0 7px #ff3b00);`,
      [
        { transform: `translate(-50%,-100%) rotate(${angle}deg) scaleY(.05)`, opacity: 0 },
        { offset: 0.22, transform: `translate(-50%,-100%) rotate(${angle}deg) scaleY(1)`, opacity: 1 },
        { transform: `translate(-50%,-100%) rotate(${angle}deg) translateY(${-reach * 0.32}px) scaleY(.2)`, opacity: 0 },
      ],
      520 + Math.random() * 260,
      'cubic-bezier(.15,.78,.2,1)',
    )
  }

  for (let mark = 0; mark < 13; mark++) {
    const angle = (Math.PI * 2 * mark) / 13
    const distance = reach * (0.55 + Math.random() * 0.45)
    const glyph = mark % 3 === 0 ? '💢' : mark % 2 === 0 ? '!' : '⚡'
    animateImpactPiece(
      layer,
      `left:${cx}px;top:${cy}px;color:${mark % 2 === 0 ? '#ff2400' : '#15100e'};font-size:${28 + Math.random() * 34}px;font-weight:1000;line-height:1;text-shadow:0 0 4px #ffd400,3px 4px 0 #ffd400;`,
      [
        { transform: 'translate(-50%,-50%) scale(.1) rotate(-20deg)', opacity: 0 },
        { offset: 0.18, transform: 'translate(-50%,-50%) scale(1.4) rotate(8deg)', opacity: 1 },
        { transform: `translate(-50%,-50%) translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance}px) scale(.8) rotate(${mark % 2 === 0 ? 35 : -35}deg)`, opacity: 0 },
      ],
      720,
      'cubic-bezier(.12,.88,.2,1)',
      glyph,
    )
  }

  animateImpactPiece(
    layer,
    `left:${cx}px;top:${cy}px;color:#fff3b0;font-size:clamp(3rem,11vmin,7rem);font-weight:1000;font-style:italic;letter-spacing:-.05em;paint-order:stroke;stroke:#17100c;text-shadow:6px 6px 0 #17100c,10px 11px 0 #e21a00;`,
    [
      { transform: 'translate(-50%,-50%) skew(-12deg) scaleX(.08)', opacity: 0 },
      { offset: 0.22, transform: 'translate(-50%,-70%) skew(-12deg) scaleX(1.15)', opacity: 1 },
      { transform: `translate(-50%,calc(-50% - ${reach * 0.25}px)) skew(-12deg) scale(1.45)`, opacity: 0 },
    ],
    820,
    'cubic-bezier(.08,.9,.15,1)',
    'SMASH!',
  )
}

const metallicImpact = ({ layer, cx, cy, reach }: ImpactOrigin): void => {
  for (let ring = 0; ring < 5; ring++) {
    const size = reach * (0.34 + ring * 0.17)
    animateImpactPiece(
      layer,
      `left:${cx}px;top:${cy}px;width:${size}px;height:${size * 0.46}px;border:${10 - ring}px solid #ffd500;border-left-color:#fffbe0;border-right-color:#9a5a00;border-radius:50%;box-shadow:0 0 8px #fff,0 0 24px #ffb700,inset 0 0 12px #ffffff;`,
      [
        { transform: 'translate(-50%,-50%) perspective(600px) rotateX(68deg) scale(.08)', opacity: 1 },
        { offset: 0.55, transform: `translate(-50%,-50%) perspective(600px) rotateX(${ring % 2 === 0 ? 48 : 78}deg) scale(1.45)`, opacity: 1 },
        { transform: 'translate(-50%,-50%) perspective(600px) rotateX(68deg) scale(2.1)', opacity: 0 },
      ],
      850 + ring * 100,
      'cubic-bezier(.12,.72,.16,1)',
    )
  }

  for (let coin = 0; coin < 26; coin++) {
    const dx = (Math.random() - 0.5) * reach * 1.8
    const apex = -reach * (0.38 + Math.random() * 0.64)
    const fall = reach * (0.48 + Math.random() * 0.65)
    const size = 22 + Math.random() * 28
    animateImpactPiece(
      layer,
      `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;border:3px ridge #fff3a0;border-radius:50%;background:radial-gradient(circle at 32% 25%,#fffbd0 0 8%,#ffd91a 22%,#a96500 70%,#fff075 74% 82%,#6f4100 88%);color:#6f4100;font-size:${size * 0.5}px;font-weight:1000;line-height:${size - 5}px;text-align:center;box-shadow:0 0 12px #ffd400;`,
      [
        { transform: 'translate(-50%,-50%) perspective(500px) rotateY(0deg) scale(.2)', opacity: 0 },
        { offset: 0.12, transform: `translate(-50%,-50%) translate(${dx * 0.35}px,${apex}px) perspective(500px) rotateY(280deg) scale(1)`, opacity: 1 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${fall}px) perspective(500px) rotateY(${900 + Math.random() * 700}deg) rotateZ(${dx * 0.08}deg) scale(.75)`, opacity: 0 },
      ],
      1150 + Math.random() * 500,
      'cubic-bezier(.18,.7,.25,1)',
      '★',
    )
  }

  for (let shard = 0; shard < 24; shard++) {
    const angle = (Math.PI * 2 * shard) / 24 + Math.random() * 0.18
    const distance = reach * (0.55 + Math.random() * 0.55)
    animateImpactPiece(
      layer,
      `left:${cx}px;top:${cy}px;width:${5 + Math.random() * 10}px;height:${24 + Math.random() * 46}px;background:linear-gradient(90deg,#7a7a6b,#fffde5 38%,#e5b400 62%,#754000);clip-path:polygon(50% 0,100% 88%,65% 100%,0 72%);filter:drop-shadow(0 0 6px #fff4a0);`,
      [
        { transform: 'translate(-50%,-50%) scale(.15) rotate(0deg)', opacity: 0 },
        { offset: 0.16, transform: 'translate(-50%,-50%) scale(1.2) rotate(90deg)', opacity: 1 },
        { transform: `translate(-50%,-50%) translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance}px) perspective(400px) rotateZ(${480 + shard * 27}deg) rotateY(720deg)`, opacity: 0 },
      ],
      900 + Math.random() * 420,
      'cubic-bezier(.14,.78,.2,1)',
    )
  }

  animateImpactPiece(
    layer,
    `left:${cx}px;top:${cy}px;color:#ffe66a;font-size:clamp(3rem,10vmin,6.4rem);font-weight:1000;letter-spacing:.04em;background:linear-gradient(180deg,#fff 0%,#fff69a 20%,#cf8b00 48%,#fff7af 65%,#805000 100%);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 5px 0 #5b3900) drop-shadow(0 0 12px #ffd500);`,
    [
      { transform: 'translate(-50%,-50%) perspective(600px) rotateX(80deg) scale(.2)', opacity: 0 },
      { offset: 0.22, transform: 'translate(-50%,-65%) perspective(600px) rotateX(0deg) scale(1.2)', opacity: 1 },
      { offset: 0.65, transform: 'translate(-50%,-85%) perspective(600px) rotateY(12deg) scale(1)', opacity: 1 },
      { transform: `translate(-50%,calc(-50% - ${reach * 0.34}px)) perspective(600px) rotateY(-45deg) scale(.65)`, opacity: 0 },
    ],
    1350,
    'cubic-bezier(.12,.82,.2,1)',
    'CLANG!',
  )
}

const damselImpact = ({ layer, cx, cy, reach }: ImpactOrigin): void => {
  const bloomSize = reach * 1.4
  animateImpactPiece(
    layer,
    `left:${cx}px;top:${cy}px;color:#ff8fc7;font-size:${bloomSize}px;line-height:1;filter:drop-shadow(0 0 28px #ff87c5);`,
    [
      { transform: 'translate(-50%,-50%) scale(.05) rotate(-15deg)', opacity: 0 },
      { offset: 0.32, transform: 'translate(-50%,-50%) scale(.75) rotate(5deg)', opacity: 0.55 },
      { transform: 'translate(-50%,-50%) scale(1.3) rotate(12deg)', opacity: 0 },
    ],
    1150,
    'cubic-bezier(.18,.78,.3,1)',
    '♡',
  )

  const pretties = ['💕', '🎀', '♡', '✿', '🦋', '✨']
  for (let pretty = 0; pretty < 36; pretty++) {
    const startX = (Math.random() - 0.5) * reach * 0.28
    const drift = (Math.random() - 0.5) * reach * 1.7
    const rise = reach * (0.45 + Math.random() * 0.9)
    const sway = (pretty % 2 === 0 ? 1 : -1) * reach * (0.12 + Math.random() * 0.2)
    const glyph = pretties[pretty % pretties.length]!
    animateImpactPiece(
      layer,
      `left:${cx}px;top:${cy}px;color:${pretty % 2 === 0 ? '#ff78b9' : '#d8a4ff'};font-size:${22 + Math.random() * 34}px;line-height:1;filter:drop-shadow(0 0 9px #ffb7dc);`,
      [
        { transform: `translate(-50%,-50%) translateX(${startX}px) scale(.15) rotate(-18deg)`, opacity: 0 },
        { offset: 0.15, transform: `translate(-50%,-50%) translate(${startX + sway}px,${-rise * 0.2}px) scale(1.15) rotate(14deg)`, opacity: 1 },
        { offset: 0.55, transform: `translate(-50%,-50%) translate(${drift - sway}px,${-rise * 0.62}px) scale(.95) rotate(-12deg)`, opacity: 0.9 },
        { transform: `translate(-50%,-50%) translate(${drift}px,${-rise}px) scale(.65) rotate(22deg)`, opacity: 0 },
      ],
      1300 + Math.random() * 700,
      'cubic-bezier(.2,.65,.32,1)',
      glyph,
    )
  }

  for (let ribbon = 0; ribbon < 9; ribbon++) {
    const side = ribbon % 2 === 0 ? 1 : -1
    const color = ribbon % 3 === 0 ? '#ff4fa3' : ribbon % 3 === 1 ? '#c084fc' : '#ffc2df'
    animateImpactPiece(
      layer,
      `left:${cx}px;top:${cy}px;color:${color};font-size:${50 + Math.random() * 45}px;font-weight:1000;line-height:1;text-shadow:0 0 8px #fff;`,
      [
        { transform: 'translate(-50%,-50%) scale(.1) rotate(0deg)', opacity: 0 },
        { offset: 0.2, transform: `translate(-50%,-50%) translate(${side * reach * 0.18}px,${-reach * 0.18}px) scale(1) rotate(${side * 35}deg)`, opacity: 1 },
        { transform: `translate(-50%,-50%) translate(${side * reach * (0.55 + Math.random() * 0.25)}px,${-reach * (0.65 + Math.random() * 0.35)}px) scale(.55) rotate(${side * 290}deg)`, opacity: 0 },
      ],
      1450 + Math.random() * 400,
      'cubic-bezier(.18,.72,.3,1)',
      '〰',
    )
  }

  animateImpactPiece(
    layer,
    `left:${cx}px;top:${cy}px;color:#fff2fa;font-size:clamp(2.8rem,10vmin,6rem);font-weight:1000;font-family:cursive;white-space:nowrap;text-shadow:0 3px 0 #e84d9a,0 0 16px #ff9ccd,0 10px 25px rgba(104,35,88,.3);`,
    [
      { transform: 'translate(-50%,-50%) scale(.15) rotate(-8deg)', opacity: 0 },
      { offset: 0.24, transform: 'translate(-50%,-75%) scale(1.18) rotate(3deg)', opacity: 1 },
      { offset: 0.62, transform: 'translate(-50%,-92%) scale(.95) rotate(-2deg)', opacity: 1 },
      { transform: `translate(-50%,calc(-50% - ${reach * 0.42}px)) scale(.7) rotate(5deg)`, opacity: 0 },
    ],
    1500,
    'cubic-bezier(.16,.78,.28,1)',
    'Uh-oh! ♡',
  )
}

// Keep the effects outside the grid so they can cover the viewport without
// changing the board layout or intercepting the next tap.
const launchImpact = (index: number, type: number): void => {
  const hole = document.querySelector(`[data-whack-index="${index}"]`) as HTMLElement | null
  if (!hole) return

  const rect = hole.getBoundingClientRect()
  const origin: ImpactOrigin = {
    layer: getImpactLayer(),
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    reach: Math.max(180, Math.min(Math.min(window.innerWidth, window.innerHeight) * 0.55, 520)),
  }

  if (type === 2) angryImpact(origin)
  else if (type === 3) metallicImpact(origin)
  else if (type === 4) damselImpact(origin)
  else normalImpact(origin)
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
