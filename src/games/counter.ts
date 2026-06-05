import { Effect, Match as M, Option as O, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { click, swoosh } from '../audio'
import { speak } from '../speech'

export const Model = S.Struct({ count: S.Number, fontSize: S.Number, holding: S.Boolean, rate: S.Number, pitch: S.Number, language: S.String, showSettings: S.Boolean })
export type Model = typeof Model.Type

export const PointerDown = m('CounterPointerDown')
export const PressedIncrement = m('CounterPressedIncrement', { duration: S.Number })
export const PressedDecrement = m('CounterPressedDecrement', { duration: S.Number })
export const ClickedReset = m('CounterClickedReset')
export const ClickedSettings = m('CounterClickedSettings')
export const DismissSettings = m('CounterDismissSettings')
export const SetRate = m('CounterSetRate', { value: S.Number })
export const SetPitch = m('CounterSetPitch', { value: S.Number })
export const SetLanguage = m('CounterSetLanguage', { value: S.String })
export const SoundPlayed = m('CounterSoundPlayed')

export const Message = S.Union([PointerDown, PressedIncrement, PressedDecrement, ClickedReset, ClickedSettings, DismissSettings, SetRate, SetPitch, SetLanguage, SoundPlayed])
export type Message = typeof Message.Type

export const init: Model = { count: 0, fontSize: 3, holding: false, rate: 0.85, pitch: 1.1, language: 'en', showSettings: false }

const calcFontSize = (duration: number): number => {
  const s = duration / 1000
  return Math.min(20, Math.max(3, Math.round(3 + (s / 2) * 17)))
}

export const update = (
  model: Model,
  message: Message,
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
        [click(SoundPlayed()), speak(`${model.count + 1}`, SoundPlayed(), { rate: model.rate, pitch: model.pitch, lang: model.language })],
      ],
      CounterPressedDecrement: (msg) => [
        { ...model, count: model.count - 1, fontSize: calcFontSize(msg.duration), holding: false },
        [click(SoundPlayed()), speak(`${model.count - 1}`, SoundPlayed(), { rate: model.rate, pitch: model.pitch, lang: model.language })],
      ],
      CounterClickedReset: () => [
        { ...model, count: 0 },
        [swoosh(SoundPlayed()), speak('0', SoundPlayed(), { rate: model.rate, pitch: model.pitch, lang: model.language })],
      ],
      CounterClickedSettings: () => [
        { ...model, showSettings: !model.showSettings },
        [],
      ],
      CounterDismissSettings: () => [
        { ...model, showSettings: false },
        [],
      ],
      CounterSetRate: (msg) => [
        { ...model, rate: msg.value },
        [],
      ],
      CounterSetPitch: (msg) => [
        { ...model, pitch: msg.value },
        [],
      ],
      CounterSetLanguage: (msg) => [
        { ...model, language: msg.value },
        [],
      ],
      CounterSoundPlayed: () => [model, []],
    }),
  )

const round = (n: number, d: number = 1): number => +n.toFixed(d)

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

const ballRadius = (fontSize: number): number => fontSize + 8

const GRAVITY_DT = GRAVITY / 60
const SPAWN_INTERVAL = 6

const makeBall = (r: number, hue: number): Omit<BallState, 'el'> => ({
  x: r + Math.random() * 200,
  y: -(r * 2 + Math.random() * 100),
  vx: (Math.random() - 0.5) * 80,
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

  // remove excess immediately
  while (rendered.length > target) {
    const b = rendered.pop()
    if (b) b.el.remove()
  }

  // spawn gradually
  const spawnCounter = parseInt(parent.getAttribute('data-spawn') ?? '0')
  if (rendered.length < target) {
    const next = spawnCounter + 1
    parent.setAttribute('data-spawn', next.toString())
    if (next >= SPAWN_INTERVAL) {
      parent.setAttribute('data-spawn', '0')
      const b = makeBall(r, Date.now() % 360)
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

export const view = (model: Model) => {
  const h = html<Message>()

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
        h.div([h.Class('buttons')], [
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
          h.button(
            [h.OnClick(ClickedSettings()), h.Class('btn btn-secondary')],
            ['⚙'],
          ),
        ]),
        h.div([h.Class('display-area'), h.Style({ position: 'relative', overflow: 'hidden' })], [
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
          h.p([h.Class(model.holding ? 'number holding' : model.count < 0 ? 'number negative' : 'number'), h.Style({ color: numberColor(model.count), fontSize: `${model.fontSize}rem`, position: 'relative', zIndex: '2' }), h.Key(model.count.toString())], [model.count.toString()]),
        ]),
      ]),
      ...(model.showSettings
        ? [
          h.div([h.Class('settings-panel')], [
            h.div([h.Class('settings-header')], [
              h.h2([], ['Speech Settings']),
              h.button(
                [h.OnClick(DismissSettings()), h.Class('settings-close')],
                ['✕'],
              ),
            ]),
            h.div([h.Class('setting-row')], [
              h.label([], ['Rate']),
              h.div([h.Class('slider-row')], [
                h.input([
                  h.Type('range'),
                  h.Min('0.2'),
                  h.Max('3'),
                  h.Step('0.1'),
                  h.Value(model.rate.toString()),
                  h.OnInput((v) => SetRate({ value: parseFloat(v) })),
                ]),
                h.span([], [round(model.rate).toString()]),
              ]),
            ]),
            h.div([h.Class('setting-row')], [
              h.label([], ['Pitch']),
              h.div([h.Class('slider-row')], [
                h.input([
                  h.Type('range'),
                  h.Min('0.2'),
                  h.Max('4'),
                  h.Step('0.1'),
                  h.Value(model.pitch.toString()),
                  h.OnInput((v) => SetPitch({ value: parseFloat(v) })),
                ]),
                h.span([], [round(model.pitch).toString()]),
              ]),
            ]),
            h.div([h.Class('setting-row')], [
              h.label([], ['Lang']),
              h.div([h.Class('lang-buttons')], [
                ...[
                  ['en', 'English'] as const,
                  ['zh', '中文'] as const,
                  ['fr', 'Français'] as const,
                  ['de', 'Deutsch'] as const,
                  ['fa', 'فارسی'] as const,
                  ['ms', 'Bahasa Malaysia'] as const,
                  ['zh-HK', '廣東話'] as const,
                ].map(([val, label]) =>
                  h.button(
                    [
                      h.Class(val === model.language ? 'btn btn-primary' : 'btn btn-secondary'),
                      h.OnClick(SetLanguage({ value: val })),
                    ],
                    [label],
                  ),
                ),
              ]),
            ]),
            h.p([h.Class('settings-note')], ['Voice availability depends on your device & browser.']),
          ]),
        ]
        : []),
    ],
  )
}
