import { Effect, Match as M, Option as O, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { click, swoosh } from '../audio'
import { speak, type SpeechOptions } from '../speech'
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

export const DisplayMode = S.Union([S.Literal('number'), S.Literal('word'), S.Literal('both')])
const PressedButton = S.Union([S.Literal('inc'), S.Literal('dec')])
type PressedButton = typeof PressedButton.Type

export const Model = S.Struct({
  count: S.Number,
  fontSize: S.Number,
  holding: S.Boolean,
  pointerDownTime: S.Number,
  pressedButton: S.Union([PressedButton, S.Null]),
  displayMode: DisplayMode,
})
export type Model = typeof Model.Type

export const PointerDown = m('CounterPointerDown', { timeStamp: S.Number, button: PressedButton })
export const PressedIncrement = m('CounterPressedIncrement', { duration: S.Number, button: S.optionalKey(PressedButton) })
export const PressedDecrement = m('CounterPressedDecrement', { duration: S.Number, button: S.optionalKey(PressedButton) })
export const ClickedReset = m('CounterClickedReset')
export const SetDisplayMode = m('CounterSetDisplayMode', { value: DisplayMode })
export const SoundPlayed = m('CounterSoundPlayed')

export const Message = S.Union([PointerDown, PressedIncrement, PressedDecrement, ClickedReset, SetDisplayMode, SoundPlayed])
export type Message = typeof Message.Type

export const init: Model = { count: 0, fontSize: 3, holding: false, pointerDownTime: 0, pressedButton: null, displayMode: 'number' }

const calcFontSize = (duration: number): number => {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0
  const s = safeDuration / 1000
  return Math.min(20, Math.max(3, Math.round(3 + (s / 2) * 17)))
}

const shouldCompletePress = (model: Model, button: PressedButton | undefined): boolean =>
  button === undefined || model.pressedButton === button

export const parseBallCount = (value: string | null): number => {
  if (!value) return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.trunc(parsed)
}

export const parseBallFontSize = (value: string | null): number => {
  if (!value) return 3
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 3
  return Math.min(20, Math.max(3, parsed))
}

export const update = (
  model: Model,
  message: Message,
  language: string = 'en',
  muted: boolean = false,
  speech: SpeechOptions = {},
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      CounterPointerDown: (msg) => [
        { ...model, holding: true, pointerDownTime: msg.timeStamp, pressedButton: msg.button },
        [],
      ],
      CounterPressedIncrement: (msg) => [
        shouldCompletePress(model, msg.button)
          ? { ...model, count: model.count + 1, fontSize: calcFontSize(msg.duration), holding: false, pressedButton: null }
          : model,
        shouldCompletePress(model, msg.button) && !muted ? [click(SoundPlayed()), speak(numberToWord(model.count + 1, language), SoundPlayed(), { ...speech, lang: language })] : [],
      ],
      CounterPressedDecrement: (msg) => [
        shouldCompletePress(model, msg.button)
          ? { ...model, count: model.count - 1, fontSize: calcFontSize(msg.duration), holding: false, pressedButton: null }
          : model,
        shouldCompletePress(model, msg.button) && !muted ? [click(SoundPlayed()), speak(numberToWord(model.count - 1, language), SoundPlayed(), { ...speech, lang: language })] : [],
      ],
      CounterClickedReset: () => [
        { ...model, count: 0 },
        muted ? [] : [swoosh(SoundPlayed()), speak(numberToWord(0, language), SoundPlayed(), { ...speech, lang: language })],
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

// A deliberately inelastic, fixed-step solver. Counter balls are decorative,
// so losing energy is more useful than preserving a physically perfect bounce:
// crowded piles should always settle rather than feed tiny collisions forever.
const GRAVITY = 3900
const FIXED_DT = 1 / 120
const MAX_FRAME_DT = 0.1
const MAX_STEPS_PER_FRAME = 8
const COLLISION_ITERATIONS = 5
const AIR_DAMPING = 4
const REST_EPSILON = 0.01
const SPAWN_INTERVAL = 0.14

const poof = (el: HTMLElement, activeParticles: Set<HTMLElement>): void => {
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

const makeBall = (
  r: number,
  hue: number,
  w: number,
  h: number,
  gravityDirection: number,
): Omit<BallState, 'el'> => ({
  x: r + Math.random() * Math.max(0, w - r * 2),
  y: gravityDirection > 0 ? r : Math.max(r, h - r),
  vx: 0,
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
  spawnElapsed: number
  lastTime: number
  accumulator: number
  nextHue: number
}

const constrainToBounds = (ball: BallState, w: number, h: number): void => {
  const minX = ball.r
  const maxX = Math.max(minX, w - ball.r)
  const minY = ball.r
  const maxY = Math.max(minY, h - ball.r)
  ball.x = Math.min(maxX, Math.max(minX, ball.x))
  ball.y = Math.min(maxY, Math.max(minY, ball.y))
}

const resolveCollision = (a: BallState, b: BallState, aIndex: number, bIndex: number): void => {
  let dx = b.x - a.x
  let dy = b.y - a.y
  const minDistance = a.r + b.r
  let distanceSquared = dx * dx + dy * dy
  if (distanceSquared >= minDistance * minDistance) return

  if (distanceSquared < 0.000001) {
    const angle = ((aIndex * 73856093 + bIndex * 19349663) % 360) * Math.PI / 180
    dx = Math.cos(angle)
    dy = Math.sin(angle)
    distanceSquared = 1
  }

  const distance = Math.sqrt(distanceSquared)
  const overlap = minDistance - distance
  const nx = dx / distance
  const ny = dy / distance
  const inverseMassA = 1 / (a.r * a.r)
  const inverseMassB = 1 / (b.r * b.r)
  const correction = overlap / (inverseMassA + inverseMassB)

  a.x -= nx * correction * inverseMassA
  a.y -= ny * correction * inverseMassA
  b.x += nx * correction * inverseMassB
  b.y += ny * correction * inverseMassB
}

const solveCollisions = (balls: BallState[], w: number, h: number): void => {
  const maxRadius = balls.reduce((max, ball) => Math.max(max, ball.r), 1)
  const cellSize = maxRadius * 2

  for (let iteration = 0; iteration < COLLISION_ITERATIONS; iteration++) {
    const grid = new Map<string, number[]>()
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i]
      if (!ball) continue
      const column = Math.floor(ball.x / cellSize)
      const row = Math.floor(ball.y / cellSize)
      const key = `${column}:${row}`
      const cell = grid.get(key)
      if (cell) cell.push(i)
      else grid.set(key, [i])
    }

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i]
      if (!ball) continue
      const column = Math.floor(ball.x / cellSize)
      const row = Math.floor(ball.y / cellSize)
      for (let y = row - 1; y <= row + 1; y++) {
        for (let x = column - 1; x <= column + 1; x++) {
          const neighbours = grid.get(`${x}:${y}`)
          if (!neighbours) continue
          for (const j of neighbours) {
            if (j <= i) continue
            const other = balls[j]
            if (other) resolveCollision(ball, other, i, j)
          }
        }
      }
      constrainToBounds(ball, w, h)
    }
  }
}

const simulate = (balls: BallState[], w: number, h: number, gravityDirection: number): void => {
  const previousX = new Float64Array(balls.length)
  const previousY = new Float64Array(balls.length)
  const damping = Math.exp(-AIR_DAMPING * FIXED_DT)

  for (let i = 0; i < balls.length; i++) {
    const ball = balls[i]
    if (!ball) continue
    previousX[i] = ball.x
    previousY[i] = ball.y
    ball.vx *= damping
    ball.vy = (ball.vy + gravityDirection * GRAVITY * FIXED_DT) * damping
    ball.x += ball.vx * FIXED_DT
    ball.y += ball.vy * FIXED_DT
    constrainToBounds(ball, w, h)
  }

  solveCollisions(balls, w, h)

  for (let i = 0; i < balls.length; i++) {
    const ball = balls[i]
    if (!ball) continue
    ball.vx = (ball.x - previousX[i]!) / FIXED_DT * damping
    ball.vy = (ball.y - previousY[i]!) / FIXED_DT * damping

    const restingAtGravityWall = gravityDirection > 0
      ? ball.y >= h - ball.r - REST_EPSILON
      : ball.y <= ball.r + REST_EPSILON
    if (restingAtGravityWall) ball.vy = 0
    if (Math.abs(ball.vx) < REST_EPSILON) ball.vx = 0
    if (Math.abs(ball.vy) < REST_EPSILON) ball.vy = 0
  }
}

const addBall = (state: TickState, parent: HTMLElement, negative: boolean): void => {
  const gravityDirection = negative ? -1 : 1
  const r = ballRadius(state.fontSize)
  const ball = makeBall(r, state.nextHue, state.w, state.h, gravityDirection)
  state.nextHue = (state.nextHue + 137.508) % 360
  const element = document.createElement('div')
  element.className = `ball${negative ? ' neg' : ''}`
  const size = ball.r * 2
  element.style.width = `${size}px`
  element.style.height = `${size}px`
  element.style.background = ballGradient(ball.hue, negative)
  parent.appendChild(element)
  state.rendered.push({ ...ball, el: element })
}

const tick = (state: TickState, parent: HTMLElement, activeParticles: Set<HTMLElement>, now: number): void => {
  const elapsed = Math.min(MAX_FRAME_DT, Math.max(0, (now - state.lastTime) / 1000))
  state.lastTime = now

  if (state.dirty) {
    state.dirty = false
    const rect = parent.getBoundingClientRect()
    state.w = rect.width
    state.h = rect.height
    for (const ball of state.rendered) constrainToBounds(ball, state.w, state.h)
  }

  const target = Math.abs(state.target)
  const negative = state.target < 0
  while (state.rendered.length > target) {
    const ball = state.rendered.pop()
    if (ball) poof(ball.el, activeParticles)
  }

  state.spawnElapsed += elapsed
  let spawned = 0
  while (state.rendered.length < target && state.spawnElapsed >= SPAWN_INTERVAL && spawned < 2) {
    state.spawnElapsed -= SPAWN_INTERVAL
    addBall(state, parent, negative)
    spawned++
  }
  if (state.rendered.length >= target) state.spawnElapsed = 0

  state.accumulator = Math.min(state.accumulator + elapsed, FIXED_DT * MAX_STEPS_PER_FRAME)
  let steps = 0
  const gravityDirection = negative ? -1 : 1
  while (state.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    simulate(state.rendered, state.w, state.h, gravityDirection)
    state.accumulator -= FIXED_DT
    steps++
  }

  for (const ball of state.rendered) {
    ball.el.style.transform = `translate3d(${ball.x - ball.r}px,${ball.y - ball.r}px,0)`
  }
}

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()

  const displayText = (): string => {
    if (model.displayMode === 'word') return numberToWord(model.count, language)
    if (model.displayMode === 'both') return `${model.count} · ${numberToWord(model.count, language)}`
    return model.count.toString()
  }

  const btnAttrs = (msg: (d: number, btn: 'inc' | 'dec') => Message, btn: 'inc' | 'dec') => [
    h.Class('btn btn-primary'),
    h.OnPointerDown((_pt, _btn, _sx, _sy, ts) => {
      return O.some(PointerDown({ timeStamp: ts, button: btn }))
    }),
    h.OnPointerUp((_sx, _sy, _pt, ts) => {
      return O.some(msg(ts - model.pointerDownTime, btn))
    }),
    h.OnPointerLeave(() => {
      if (model.pressedButton !== btn) return O.none()
      const d = performance.now() - model.pointerDownTime
      return O.some(msg(d, btn))
    }),
  ] as const

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.h1([h.Class('title')], [t('counterTitle', language)]),
        h.div([h.Class('buttons counter-actions')], [
          h.button(
            btnAttrs((d, btn) => PressedDecrement({ duration: d, button: btn }), 'dec'),
            ['-1'],
          ),
          h.button(
            [h.OnClick(ClickedReset()), h.Class('btn btn-secondary')],
            [t('reset', language)],
          ),
          h.button(
            btnAttrs((d, btn) => PressedIncrement({ duration: d, button: btn }), 'inc'),
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
                  const activeParticles = new Set<HTMLElement>()
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
                        spawnElapsed: SPAWN_INTERVAL,
                        lastTime: performance.now(),
                        accumulator: 0,
                        nextHue: 0,
                      }
                      const ro = new ResizeObserver(() => { state.dirty = true })
                      ro.observe(parent)
                      const mo = new MutationObserver(() => {
                        state.target = parseBallCount(parent.getAttribute('data-count'))
                        state.fontSize = parseBallFontSize(parent.getAttribute('data-fontsize'))
                      })
                      mo.observe(parent, { attributes: true, attributeFilter: ['data-count', 'data-fontsize'] })
                      const loop = (now: number) => {
                        if (!state.running) return
                        tick(state, parent, activeParticles, now)
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
