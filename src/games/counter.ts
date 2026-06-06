import { Effect, Match as M, Option as O, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { click, swoosh } from '../audio'
import { speak } from '../speech'
import { toCardinal } from 'n2words/en-US'
import { toCardinal as toCardinalDe } from 'n2words/de-DE'
import { toCardinal as toCardinalFr } from 'n2words/fr-FR'
import { toCardinal as toCardinalFa } from 'n2words/fa-IR'
import { toCardinal as toCardinalMs } from 'n2words/ms-MY'
import { toCardinal as toCardinalZh } from 'n2words/zh-Hans-CN'
import { toCardinal as toCardinalZhHant } from 'n2words/zh-Hant-TW'

const WORD_FN: Record<string, (n: number, opts: Record<string, boolean>) => string> = {
  en: toCardinal,
  de: toCardinalDe,
  fr: toCardinalFr,
  fa: toCardinalFa,
  ms: toCardinalMs,
  zh: toCardinalZh,
  'zh-HK': toCardinalZhHant,
}

const WORD_OPTS: Record<string, Record<string, boolean>> = {
  zh: { formal: false },
  'zh-HK': { formal: false },
}

export const numberToWord = (n: number, language: string = 'en'): string => {
  const fn = WORD_FN[language]
  if (!fn) return n.toString()
  try {
    let word = fn(n, WORD_OPTS[language] ?? {})
    if (language === 'ms' && word === 'sifar') word = 'kosong'
    return word
  } catch {
    return n.toString()
  }
}

export const Model = S.Struct({ count: S.Number, fontSize: S.Number, holding: S.Boolean, rate: S.Number, pitch: S.Number, displayMode: S.String })
export type Model = typeof Model.Type

export const PointerDown = m('CounterPointerDown')
export const PressedIncrement = m('CounterPressedIncrement', { duration: S.Number })
export const PressedDecrement = m('CounterPressedDecrement', { duration: S.Number })
export const ClickedReset = m('CounterClickedReset')
export const SetRate = m('CounterSetRate', { value: S.Number })
export const SetPitch = m('CounterSetPitch', { value: S.Number })
export const SetDisplayMode = m('CounterSetDisplayMode', { value: S.String })
export const SoundPlayed = m('CounterSoundPlayed')

export const Message = S.Union([PointerDown, PressedIncrement, PressedDecrement, ClickedReset, SetRate, SetPitch, SetDisplayMode, SoundPlayed])
export type Message = typeof Message.Type

export const init: Model = { count: 0, fontSize: 3, holding: false, rate: 0.85, pitch: 1.1, displayMode: 'number' }

const calcFontSize = (duration: number): number => {
  const s = duration / 1000
  return Math.min(20, Math.max(3, Math.round(3 + (s / 2) * 17)))
}

export const update = (
  model: Model,
  message: Message,
  language: string = 'en',
  muted: boolean = false,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      CounterPointerDown: () => [
        { ...model, holding: true },
        [],
      ],
      CounterPressedIncrement: (msg) => [
        { ...model, count: model.count + 1, fontSize: calcFontSize(msg.duration), holding: false },
        muted ? [] : [click(SoundPlayed()), speak(`${model.count + 1}`, SoundPlayed(), { rate: model.rate, pitch: model.pitch, lang: language })],
      ],
      CounterPressedDecrement: (msg) => [
        { ...model, count: model.count - 1, fontSize: calcFontSize(msg.duration), holding: false },
        muted ? [] : [click(SoundPlayed()), speak(`${model.count - 1}`, SoundPlayed(), { rate: model.rate, pitch: model.pitch, lang: language })],
      ],
      CounterClickedReset: () => [
        { ...model, count: 0 },
        muted ? [] : [swoosh(SoundPlayed()), speak('0', SoundPlayed(), { rate: model.rate, pitch: model.pitch, lang: language })],
      ],
      CounterSetRate: (msg) => [
        { ...model, rate: msg.value },
        [],
      ],
      CounterSetPitch: (msg) => [
        { ...model, pitch: msg.value },
        [],
      ],
      CounterSetDisplayMode: (msg) => [
        { ...model, displayMode: msg.value },
        [],
      ],
      CounterSoundPlayed: () => [model, []],
    }),
  )

const numberColor = (n: number): string => {
  const hue = (Math.abs(n) * 137.508) % 360
  if (n < 0) return `hsl(${(hue + 200) % 360}, 70%, 60%)`
  return `hsl(${hue}, 75%, 55%)`
}

let pointerDownTime = 0

// BALL PHYSICS //

interface BallState {
  x: number
  y: number
  vx: number
  vy: number
  hue: number
  r: number
  el: HTMLElement
}

const GRAVITY = 980
const BOUNCE = 0.5
const FRICTION = 0.995
const BALL_BOUNCE = 0.3
const WALL_FRICTION = 0.85

const poof = (el: HTMLElement): void => {
  const rect = el.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const color = el.style.backgroundColor || '#667eea'
  const s = rect.width / 16
  el.remove()

  for (let i = 0; i < 6; i++) {
    const p = document.createElement('div')
    const ps = (3 + Math.random() * 5) * s
    const angle = (Math.PI * 2 * i) / 6 + (Math.random() - 0.5) * 0.6
    const dist = (25 + Math.random() * 35) * s
    p.style.cssText = [
      `position:fixed`,
      `left:${cx - ps / 2}px`,
      `top:${cy - ps / 2}px`,
      `width:${ps}px`,
      `height:${ps}px`,
      `border-radius:50%`,
      `background:${color}`,
      `pointer-events:none`,
      `z-index:1000`,
    ].join(';')
    document.body.appendChild(p)
    p.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * dist}px,${Math.sin(angle) * dist}px) scale(0.2)`, opacity: 0 },
    ], { duration: 300 + Math.random() * 100, easing: 'ease-out', fill: 'forwards' })
      .onfinish = () => p.remove()
  }
}

const ballRadius = (fontSize: number): number => fontSize + 8

const GRAVITY_DT = GRAVITY / 60
const SPAWN_INTERVAL = 6

const makeBall = (r: number, hue: number, containerW?: number): Omit<BallState, 'el'> => ({
  x: containerW ? r + Math.random() * (containerW - r * 2) : r + Math.random() * 200,
  y: -(r * 2 + Math.random() * 100),
  vx: (Math.random() - 0.5) * 300,
  vy: 0,
  hue,
  r,
})

const tick = (rendered: BallState[], parent: HTMLElement): void => {
  const dt = 1 / 60
  const rect = parent.getBoundingClientRect()
  const w = rect.width
  const h = rect.height

  // read target and sync count gradually
  const targetStr = parent.getAttribute('data-count')
  const rawTarget = targetStr ? parseInt(targetStr) : 0
  const negative = rawTarget < 0
  const target = Math.abs(rawTarget)
  const fs = parseFloat(parent.getAttribute('data-fontsize') ?? '3')
  const r = ballRadius(fs)

  // remove excess with particle poof
  while (rendered.length > target) {
    const b = rendered.pop()
    if (b) poof(b.el)
  }

  // spawn gradually
  const spawnCounter = parseInt(parent.getAttribute('data-spawn') ?? '0')
  if (rendered.length < target) {
    const next = spawnCounter + 1
    parent.setAttribute('data-spawn', next.toString())
    if (next >= SPAWN_INTERVAL) {
      parent.setAttribute('data-spawn', '0')
      const b = makeBall(r, Date.now() % 360, w)
      if (negative) {
        b.y = h + b.r + Math.random() * 80
        b.vy = -(Math.random() * 80 + 60)
        b.hue = (b.hue + 180) % 360
      }
      const d = document.createElement('div')
      d.className = `ball${negative ? ' neg' : ''}`
      const size = b.r * 2
      d.style.width = `${size}px`
      d.style.height = `${size}px`
      d.style.backgroundColor = numberColor(b.hue)
      parent.appendChild(d)
      rendered.push({ ...b, el: d })
    }
  } else {
    parent.setAttribute('data-spawn', '0')
  }

  // physics
  for (let i = 0; i < rendered.length; i++) {
    const b = rendered[i]
    if (!b) continue
    b.vy += (negative ? -1 : 1) * GRAVITY * dt
    b.vx *= FRICTION
    b.x += b.vx * dt
    b.y += b.vy * dt
    if (b.x < b.r) { b.x = b.r; b.vx = -b.vx * BOUNCE * WALL_FRICTION; b.vy *= WALL_FRICTION }
    if (b.x > w - b.r) { b.x = w - b.r; b.vx = -b.vx * BOUNCE * WALL_FRICTION; b.vy *= WALL_FRICTION }
    if (negative) {
      if (b.y - b.r < 0) {
        b.y = b.r
        b.vy = -b.vy * BOUNCE
        b.vx *= WALL_FRICTION
        if (b.vy > 0 && b.vy < GRAVITY_DT) b.vy = 0
      }
    } else if (b.y > h - b.r) {
      b.y = h - b.r
      b.vy = -b.vy * BOUNCE
      b.vx *= WALL_FRICTION
      if (b.vy < 0 && -b.vy < GRAVITY_DT) b.vy = 0
    }
  }

  // spatial hash grid for collision
  const cellSize = 80
  const grid = new Map<number, number[]>()
  for (let i = 0; i < rendered.length; i++) {
    const b = rendered[i]
    if (!b) continue
    const cx = (b.x / cellSize) | 0
    const cy = (b.y / cellSize) | 0
    const key = cx * 10000 + cy
    const cell = grid.get(key)
    if (cell) cell.push(i)
    else grid.set(key, [i])
  }

  for (let i = 0; i < rendered.length; i++) {
    const a = rendered[i]
    if (!a) continue
    const cx = (a.x / cellSize) | 0
    const cy = (a.y / cellSize) | 0
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const key = (cx + ox) * 10000 + (cy + oy)
        const cell = grid.get(key)
        if (!cell) continue
        for (const j of cell) {
          if (j <= i) continue
          const b = rendered[j]
          if (!b) continue
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const minDist = a.r + b.r
          if (dist < minDist && dist > 0.001) {
            const nx = dx / dist
            const ny = dy / dist
            const overlap = minDist - dist
            a.x -= nx * overlap / 2
            a.y -= ny * overlap / 2
            b.x += nx * overlap / 2
            b.y += ny * overlap / 2
            const dvx = a.vx - b.vx
            const dvy = a.vy - b.vy
            const dvn = dvx * nx + dvy * ny
            if (dvn > 0) {
              a.vx -= dvn * nx * BALL_BOUNCE
              a.vy -= dvn * ny * BALL_BOUNCE
              b.vx += dvn * nx * BALL_BOUNCE
              b.vy += dvn * ny * BALL_BOUNCE
            }
          }
        }
      }
    }
  }

  for (const b of rendered) {
    b.el.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0)`
  }
}

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()

  const displayText = (): string => {
    if (model.displayMode === 'word') return numberToWord(model.count, language)
    if (model.displayMode === 'both') return `${model.count} · ${numberToWord(model.count, language)}`
    return model.count.toString()
  }

  const btnAttrs = (msg: (d: number) => Message) => [
    h.Class('btn btn-primary'),
    h.OnPointerDown((_pt, _btn, _sx, _sy, ts) => {
      pointerDownTime = ts
      return O.some(PointerDown())
    }),
    h.OnPointerUp((_sx, _sy, _pt, ts) =>
      O.some(msg(ts - pointerDownTime)),
    ),
  ] as const

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.h1([h.Class('title')], ['Counter']),
        h.div([h.Class('buttons counter-actions')], [
          h.button(
            btnAttrs((d) => PressedDecrement({ duration: d })),
            ['-1'],
          ),
          h.button(
            [h.OnClick(ClickedReset()), h.Class('btn btn-secondary')],
            ['Reset'],
          ),
          h.button(
            btnAttrs((d) => PressedIncrement({ duration: d })),
            ['+1'],
          ),
        ]),
        h.div([h.Class('display-area'), h.Style({ position: 'relative' })], [
          h.div([
            h.Class('balls-container'),
            h.Attribute('data-count', model.count.toString()),
            h.Attribute('data-fontsize', model.fontSize.toString()),
            h.OnMount({
              name: 'counterBalls',
              f: (element) => Stream.callback<never>(_queue =>
                Effect.gen(function* () {
                  yield* Effect.acquireRelease(
                    Effect.sync(() => {
                      const parent = element as HTMLElement
                      const rendered: BallState[] = []
                      const state = { running: true, id: 0 }
                      const loop = () => {
                        if (!state.running) return
                        tick(rendered, parent)
                        state.id = requestAnimationFrame(loop)
                      }
                      state.id = requestAnimationFrame(loop)
                      return { rendered, state }
                    }),
                    ({ rendered, state }) => Effect.sync(() => {
                      state.running = false
                      cancelAnimationFrame(state.id)
                      rendered.forEach(b => b.el.remove())
                    }),
                  )
                  return yield* Effect.never
                }),
              ),
            }),
          ], []),
          h.p([h.Class(model.holding ? 'number holding' : model.count < 0 ? 'number negative' : 'number'), h.Style({ color: numberColor(model.count), fontSize: `${model.fontSize}rem`, position: 'relative', zIndex: '2' }), h.Key(model.count.toString())], [displayText()]),
        ]),
      ]),
    ],
  )
}
