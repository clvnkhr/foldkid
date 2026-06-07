import { Effect, Match as M, Option as O, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { click, swoosh } from '../audio'
import { speak } from '../speech'
import { t } from '../i18n'
import { toCardinal } from 'n2words/en-US'
import { toCardinal as toCardinalDe } from 'n2words/de-DE'
import { toCardinal as toCardinalFr } from 'n2words/fr-FR'
import { toCardinal as toCardinalFa } from 'n2words/fa-IR'
import { toCardinal as toCardinalMs } from 'n2words/ms-MY'
import { toCardinal as toCardinalZh } from 'n2words/zh-Hans-CN'
import { toCardinal as toCardinalZhHant } from 'n2words/zh-Hant-TW'
import { toCardinal as toCardinalJa } from 'n2words/ja-JP'

const WORD_FN: Record<string, (n: number, opts: Record<string, boolean>) => string> = {
  en: toCardinal,
  de: toCardinalDe,
  fr: toCardinalFr,
  fa: toCardinalFa,
  ms: toCardinalMs,
  zh: toCardinalZh,
  'zh-HK': toCardinalZhHant,
  ja: toCardinalJa,
}

const WORD_OPTS: Record<string, Record<string, boolean>> = {
  zh: { formal: false },
  'zh-HK': { formal: false },
}

const zhStripLeadingOne = (s: string): string => s.startsWith('一十') ? s.slice(1) : s

export const numberToWord = (n: number, language: string = 'en'): string => {
  const fn = WORD_FN[language]
  if (!fn) return n.toString()
  try {
    let word = fn(n, WORD_OPTS[language] ?? {})
    if (language === 'ms' && word === 'sifar') word = 'kosong'
    if (language === 'zh' || language === 'zh-HK') word = zhStripLeadingOne(word)
    return word
  } catch {
    return n.toString()
  }
}

const DisplayMode = S.Union([S.Literal('number'), S.Literal('word'), S.Literal('both')])

export const Model = S.Struct({
  count: S.Number,
  fontSize: S.Number,
  holding: S.Boolean,
  rate: S.Number,
  pitch: S.Number,
  displayMode: DisplayMode,
})
export type Model = typeof Model.Type

export const PointerDown = m('CounterPointerDown')
export const PressedIncrement = m('CounterPressedIncrement', { duration: S.Number })
export const PressedDecrement = m('CounterPressedDecrement', { duration: S.Number })
export const ClickedReset = m('CounterClickedReset')
export const SetRate = m('CounterSetRate', { value: S.Number })
export const SetPitch = m('CounterSetPitch', { value: S.Number })
export const SetDisplayMode = m('CounterSetDisplayMode', { value: DisplayMode })
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
        muted ? [] : [click(SoundPlayed()), speak(numberToWord(model.count + 1, language), SoundPlayed(), { rate: model.rate, pitch: model.pitch, lang: language })],
      ],
      CounterPressedDecrement: (msg) => [
        { ...model, count: model.count - 1, fontSize: calcFontSize(msg.duration), holding: false },
        muted ? [] : [click(SoundPlayed()), speak(numberToWord(model.count - 1, language), SoundPlayed(), { rate: model.rate, pitch: model.pitch, lang: language })],
      ],
      CounterClickedReset: () => [
        { ...model, count: 0 },
        muted ? [] : [swoosh(SoundPlayed()), speak(numberToWord(0, language), SoundPlayed(), { rate: model.rate, pitch: model.pitch, lang: language })],
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

const ballHue = (n: number): [number, number, number] => {
  const hue = (Math.abs(n) * 137.508) % 360
  if (n < 0) return [(hue + 200) % 360, 70, 60]
  return [hue, 75, 55]
}

const numberColor = (n: number): string => {
  const [h, s, l] = ballHue(n)
  return `hsl(${h}, ${s}%, ${l}%)`
}

const ballGradient = (hue: number, negative: boolean): string => {
  const h = negative ? (hue + 200) % 360 : hue
  const s = negative ? 70 : 75
  const l = negative ? 60 : 55
  return [
    `radial-gradient(circle at 35% 35%,`,
    `hsl(${h}, ${s}%, ${Math.min(100, l + 28)}%) 0%,`,
    `hsl(${h}, ${s}%, ${l}%) 45%,`,
    `hsl(${h}, ${s + 5}%, ${Math.max(0, l - 14)}%) 100%)`,
  ].join(' ')
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

const activeParticles = new Set<HTMLElement>()

const poof = (el: HTMLElement): void => {
  const rect = el.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const color = el.style.background || el.style.backgroundColor || '#667eea'
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
    activeParticles.add(p)
    document.body.appendChild(p)
    const anim = p.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * dist}px,${Math.sin(angle) * dist}px) scale(0.2)`, opacity: 0 },
    ], { duration: 300 + Math.random() * 100, easing: 'ease-out', fill: 'forwards' })
    const done = () => { activeParticles.delete(p); p.remove() }
    anim.onfinish = done
    anim.finished.then(done).catch(done)
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

interface TickState {
  rendered: BallState[]
  running: boolean
  id: number
  w: number
  h: number
  target: number
  fontSize: number
  dirty: boolean
  spawnCounter: number
  settleTimer: number
  frozen: boolean
}

const tick = (state: TickState, parent: HTMLElement): void => {
  const dt = 1 / 60
  const { rendered } = state
  const w = state.w
  const h = state.h
  const negative = state.target < 0
  const target = Math.abs(state.target)
  const r = ballRadius(state.fontSize)

  if (state.dirty) {
    state.dirty = false
    const rect = parent.getBoundingClientRect()
    state.w = rect.width
    state.h = rect.height
  }

  while (rendered.length > target) {
    const b = rendered.pop()
    if (b) poof(b.el)
  }

  if (rendered.length < target) {
    state.spawnCounter++
    if (state.spawnCounter >= SPAWN_INTERVAL) {
      state.spawnCounter = 0
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
      d.style.background = ballGradient(b.hue, negative)
      parent.appendChild(d)
      rendered.push({ ...b, el: d })
    }
  } else {
    state.spawnCounter = 0
  }

  if (rendered.length === target) {
    state.settleTimer++
  } else {
    state.settleTimer = 0
    state.frozen = false
  }

  if (state.settleTimer >= 2100) {
    state.frozen = true
  }

  if (!state.frozen) {
    const prevX = new Float64Array(rendered.length)
    const prevY = new Float64Array(rendered.length)
    for (let i = 0; i < rendered.length; i++) {
      const b = rendered[i]
      prevX[i] = b.x
      prevY[i] = b.y
    }

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

    for (let i = 0; i < rendered.length; i++) {
      const a = rendered[i]
      if (!a) continue
      for (let j = i + 1; j < rendered.length; j++) {
        const b = rendered[j]
        if (!b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const minDist = a.r + b.r
        const distSq = dx * dx + dy * dy
        if (distSq >= minDist * minDist) continue
        const dist = Math.sqrt(distSq)
        if (dist <= 0 || !isFinite(dist)) continue
        const overlap = minDist - dist
        if (overlap < 1 && a.vx * a.vx + a.vy * a.vy + b.vx * b.vx + b.vy * b.vy < 4) continue
        const nx = dx / dist
        const ny = dy / dist
        const massA = a.r * a.r * a.r
        const massB = b.r * b.r * b.r
        const totalMass = massA + massB
        const pushWeight = overlap / totalMass
        a.x -= nx * pushWeight * massB
        a.y -= ny * pushWeight * massB
        b.x += nx * pushWeight * massA
        b.y += ny * pushWeight * massA
        const dvx = a.vx - b.vx
        const dvy = a.vy - b.vy
        const dvn = dvx * nx + dvy * ny
        const impulse = (1 + BALL_BOUNCE) * massA * massB * dvn / totalMass
        const fa = impulse / massA
        const fb = impulse / massB
        a.vx -= fa * nx
        a.vy -= fa * ny
        b.vx += fb * nx
        b.vy += fb * ny
      }
    }

    if (state.settleTimer > 300) {
      const t = Math.min((state.settleTimer - 300) / 1800, 1)
      const maxDisp = 10 * (1 - t)
      for (let i = 0; i < rendered.length; i++) {
        const b = rendered[i]
        if (!b) continue
        const dx = b.x - prevX[i]
        const dy = b.y - prevY[i]
        const distSq = dx * dx + dy * dy
        if (distSq > maxDisp * maxDisp) {
          const dist = Math.sqrt(distSq)
          const scale = maxDisp / dist
          b.x = prevX[i] + dx * scale
          b.y = prevY[i] + dy * scale
        }
      }
    }
  }

  for (let i = 0; i < rendered.length; i++) {
    const b = rendered[i]
    if (b) b.el.style.transform = `translate3d(${b.x - b.r}px,${b.y - b.r}px,0)`
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
        h.h1([h.Class('title')], [t('counterTitle', language)]),
        h.div([h.Class('buttons counter-actions')], [
          h.button(
            btnAttrs((d) => PressedDecrement({ duration: d })),
            ['-1'],
          ),
          h.button(
            [h.OnClick(ClickedReset()), h.Class('btn btn-secondary')],
            [t('reset', language)],
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
                      const rect = parent.getBoundingClientRect()
                      const state: TickState = {
                        rendered: [],
                        running: true,
                        id: 0,
                        w: rect.width,
                        h: rect.height,
                        target: model.count,
                        fontSize: model.fontSize,
                        dirty: true,
                        spawnCounter: 0,
                        settleTimer: 0,
                        frozen: false,
                      }
                      const ro = new ResizeObserver(() => { state.dirty = true })
                      ro.observe(parent)
                      const mo = new MutationObserver(() => {
                        const cs = parent.getAttribute('data-count')
                        state.target = cs ? parseInt(cs) : 0
                        const fs = parent.getAttribute('data-fontsize')
                        state.fontSize = fs ? parseFloat(fs) : 3
                      })
                      mo.observe(parent, { attributes: true, attributeFilter: ['data-count', 'data-fontsize'] })
                      const loop = () => {
                        if (!state.running) return
                        tick(state, parent)
                        state.id = requestAnimationFrame(loop)
                      }
                      state.id = requestAnimationFrame(loop)
                      return { state, ro, mo }
                    }),
                    ({ state, ro, mo }) => Effect.sync(() => {
                      state.running = false
                      cancelAnimationFrame(state.id)
                      ro.disconnect()
                      mo.disconnect()
                      state.rendered.forEach(b => b.el.remove())
                      activeParticles.forEach(el => el.remove())
                      activeParticles.clear()
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
