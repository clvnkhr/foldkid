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
  tiltGravity: S.Boolean,
})
export type Model = typeof Model.Type

export const PointerDown = m('CounterPointerDown', { timeStamp: S.Number, button: PressedButton })
export const PressedIncrement = m('CounterPressedIncrement', { duration: S.Number, button: S.optionalKey(PressedButton) })
export const PressedDecrement = m('CounterPressedDecrement', { duration: S.Number, button: S.optionalKey(PressedButton) })
export const ClickedReset = m('CounterClickedReset')
export const SetDisplayMode = m('CounterSetDisplayMode', { value: DisplayMode })
export const SetTiltGravity = m('CounterSetTiltGravity', { value: S.Boolean })
export const SoundPlayed = m('CounterSoundPlayed')

export const Message = S.Union([PointerDown, PressedIncrement, PressedDecrement, ClickedReset, SetDisplayMode, SetTiltGravity, SoundPlayed])
export type Message = typeof Message.Type

export const init: Model = { count: 0, fontSize: 3, holding: false, pointerDownTime: 0, pressedButton: null, displayMode: 'number', tiltGravity: false }

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
      CounterSetTiltGravity: (msg) => [
        model.tiltGravity === msg.value ? model : { ...model, tiltGravity: msg.value },
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
  pointerId: number | null
}

interface BallDragState {
  ball: BallState
  offsetX: number
  offsetY: number
  lastX: number
  lastY: number
  lastTime: number
  velocityX: number
  velocityY: number
  hasVelocity: boolean
}

// A deliberately inelastic, fixed-step solver. Counter balls are decorative,
// so losing energy is more useful than preserving a physically perfect bounce:
// crowded piles should always settle rather than feed tiny collisions forever.
export const BASE_GRAVITY = 5850
const FIXED_DT = 1 / 120
const MAX_FRAME_DT = 0.1
const MAX_STEPS_PER_FRAME = 8
const COLLISION_ITERATIONS = 5
const AIR_DAMPING = 4
export const WALL_RESTITUTION = 0.72
const BALL_RESTITUTION = 0.58
const WALL_SLEEP_SPEED = 65
const MAX_FLING_SPEED = 5000
const FLING_SAMPLE_BLEND = 0.72
const FLING_RELEASE_GRACE_MS = 32
const FLING_RELEASE_DECAY_MS = 90
const SPAWN_INTERVAL = 0.14
const ORIENTATION_DEAD_ZONE = 0.03
const ORIENTATION_SMOOTHING = 0.18

type PermissionedDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}
type PermissionedDeviceMotionEvent = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

let orientationPermissionRequest: Promise<boolean> | undefined

export const requestCounterOrientationPermission = (): Promise<boolean> => {
  if (typeof DeviceOrientationEvent === 'undefined') return Promise.resolve(false)
  if (orientationPermissionRequest) return orientationPermissionRequest
  const orientationEvent = DeviceOrientationEvent as PermissionedDeviceOrientationEvent
  const orientationPermission = typeof orientationEvent.requestPermission === 'function'
    ? orientationEvent.requestPermission.call(orientationEvent).catch(() => 'denied' as const)
    : Promise.resolve('granted' as const)
  const motionEvent = typeof DeviceMotionEvent === 'undefined'
    ? undefined
    : DeviceMotionEvent as PermissionedDeviceMotionEvent
  const motionPermission = typeof motionEvent?.requestPermission === 'function'
    ? motionEvent.requestPermission.call(motionEvent).catch(() => 'denied' as const)
    : Promise.resolve('granted' as const)
  orientationPermissionRequest = Promise.all([orientationPermission, motionPermission])
    .then(([permission]) => permission === 'granted')
    .catch(() => {
      orientationPermissionRequest = undefined
      return false
    })
  return orientationPermissionRequest
}

export const orientationGravity = (
  beta: number | null,
  gamma: number | null,
  screenAngle: number = 0,
): readonly [number, number] | undefined => {
  if (beta === null || gamma === null || !Number.isFinite(beta) || !Number.isFinite(gamma)) return undefined
  const radians = Math.PI / 180
  const betaRadians = Math.max(-90, Math.min(90, beta)) * radians
  const gammaRadians = Math.max(-90, Math.min(90, gamma)) * radians
  const deviceX = Math.sin(gammaRadians) * Math.cos(betaRadians)
  const deviceY = Math.sin(betaRadians)
  const angle = screenAngle * radians
  const screenX = deviceX * Math.cos(angle) - deviceY * Math.sin(angle)
  const screenY = deviceX * Math.sin(angle) + deviceY * Math.cos(angle)
  const magnitude = Math.hypot(screenX, screenY)
  return magnitude < ORIENTATION_DEAD_ZONE ? [0, 0] : [screenX, screenY]
}

const currentScreenAngle = (): number => {
  const angle = globalThis.screen?.orientation?.angle
  if (Number.isFinite(angle)) return angle
  const legacyAngle = (window as Window & { orientation?: number }).orientation
  return Number.isFinite(legacyAngle) ? legacyAngle! : 0
}

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

const MIN_BALL_RADIUS = 11
const MAX_BALL_RADIUS = 90

export const ballRadius = (fontSize: number): number => {
  const normalizedSize = (parseBallFontSize(fontSize.toString()) - 3) / 17
  return MIN_BALL_RADIUS + normalizedSize * (MAX_BALL_RADIUS - MIN_BALL_RADIUS)
}

const makeBall = (
  r: number,
  hue: number,
  w: number,
  h: number,
  gravityX: number,
  gravityY: number,
): Omit<BallState, 'el' | 'pointerId'> => {
  const randomX = r + Math.random() * Math.max(0, w - r * 2)
  const randomY = r + Math.random() * Math.max(0, h - r * 2)
  const gravityMagnitude = Math.hypot(gravityX, gravityY)
  return {
    x: gravityMagnitude < ORIENTATION_DEAD_ZONE
      ? randomX
      : Math.abs(gravityX) > Math.abs(gravityY)
        ? (gravityX > 0 ? r : Math.max(r, w - r))
        : randomX,
    y: gravityMagnitude < ORIENTATION_DEAD_ZONE
      ? randomY
      : Math.abs(gravityX) > Math.abs(gravityY)
        ? randomY
        : (gravityY > 0 ? r : Math.max(r, h - r)),
    vx: 0,
    vy: 0,
    hue,
    r,
  }
}

interface TickState {
  rendered: BallState[]
  drags: Map<number, BallDragState>
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
  gravityX: number
  gravityY: number
  tiltGravity: boolean
}

const constrainToBounds = (ball: BallState, w: number, h: number): void => {
  const minX = ball.r
  const maxX = Math.max(minX, w - ball.r)
  const minY = ball.r
  const maxY = Math.max(minY, h - ball.r)
  ball.x = Math.min(maxX, Math.max(minX, ball.x))
  ball.y = Math.min(maxY, Math.max(minY, ball.y))
}

export const dampedSpecularReflection = (
  vx: number,
  vy: number,
  normalX: number,
  normalY: number,
  damping: number = WALL_RESTITUTION,
): readonly [number, number] => {
  const normalLength = Math.hypot(normalX, normalY)
  if (normalLength === 0) return [vx, vy]
  const nx = normalX / normalLength
  const ny = normalY / normalLength
  const dot = vx * nx + vy * ny
  if (dot >= 0) return [vx, vy]
  return [
    (vx - 2 * dot * nx) * damping,
    (vy - 2 * dot * ny) * damping,
  ]
}

const resolveWallCollisions = (ball: BallState, w: number, h: number): void => {
  const minX = ball.r
  const maxX = Math.max(minX, w - ball.r)
  const minY = ball.r
  const maxY = Math.max(minY, h - ball.r)
  let hitX = false
  let hitY = false
  let normalX = 0
  let normalY = 0
  if (maxX === minX) {
    ball.x = minX
    ball.vx = 0
  } else if (ball.x < minX) {
    ball.x = minX
    hitX = ball.vx < 0
    normalX = 1
  } else if (ball.x > maxX) {
    ball.x = maxX
    hitX = ball.vx > 0
    normalX = -1
  }
  if (maxY === minY) {
    ball.y = minY
    ball.vy = 0
  } else if (ball.y < minY) {
    ball.y = minY
    hitY = ball.vy < 0
    normalY = 1
  } else if (ball.y > maxY) {
    ball.y = maxY
    hitY = ball.vy > 0
    normalY = -1
  }
  const bounceX = hitX && Math.abs(ball.vx) >= WALL_SLEEP_SPEED
  const bounceY = hitY && Math.abs(ball.vy) >= WALL_SLEEP_SPEED
  if (bounceX !== bounceY) {
    ;[ball.vx, ball.vy] = dampedSpecularReflection(ball.vx, ball.vy, bounceX ? normalX : 0, bounceY ? normalY : 0)
  } else if (bounceX && bounceY) {
    ball.vx = (bounceX ? -ball.vx : ball.vx) * WALL_RESTITUTION
    ball.vy = (bounceY ? -ball.vy : ball.vy) * WALL_RESTITUTION
  }
  if (hitX && !bounceX) ball.vx = 0
  if (hitY && !bounceY) ball.vy = 0
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
  // A held ball is controlled by the pointer, so collisions move the loose
  // ball out of its way without pulling the held one away from the finger.
  const inverseMassA = a.pointerId === null ? 1 / (a.r * a.r) : 0
  const inverseMassB = b.pointerId === null ? 1 / (b.r * b.r) : 0
  if (inverseMassA + inverseMassB === 0) return
  const correction = overlap / (inverseMassA + inverseMassB)

  a.x -= nx * correction * inverseMassA
  a.y -= ny * correction * inverseMassA
  b.x += nx * correction * inverseMassB
  b.y += ny * correction * inverseMassB

  const relativeVelocityX = b.vx - a.vx
  const relativeVelocityY = b.vy - a.vy
  const normalVelocity = relativeVelocityX * nx + relativeVelocityY * ny
  if (normalVelocity >= 0) return
  const impulse = -(1 + BALL_RESTITUTION) * normalVelocity / (inverseMassA + inverseMassB)
  a.vx -= impulse * inverseMassA * nx
  a.vy -= impulse * inverseMassA * ny
  b.vx += impulse * inverseMassB * nx
  b.vy += impulse * inverseMassB * ny
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
      if (ball.pointerId === null) resolveWallCollisions(ball, w, h)
    }
  }
}

const simulate = (balls: BallState[], w: number, h: number, gravityX: number, gravityY: number): void => {
  const damping = Math.exp(-AIR_DAMPING * FIXED_DT)

  for (const ball of balls) {
    if (ball.pointerId !== null) continue
    ball.vx = (ball.vx + gravityX * BASE_GRAVITY * FIXED_DT) * damping
    ball.vy = (ball.vy + gravityY * BASE_GRAVITY * FIXED_DT) * damping
    ball.x += ball.vx * FIXED_DT
    ball.y += ball.vy * FIXED_DT
    resolveWallCollisions(ball, w, h)
  }

  solveCollisions(balls, w, h)
}

const addBall = (state: TickState, parent: HTMLElement, negative: boolean): void => {
  const direction = negative ? -1 : 1
  const gravityX = state.gravityX * direction
  const gravityY = state.gravityY * direction
  const r = ballRadius(state.fontSize)
  const ball = makeBall(r, state.nextHue, state.w, state.h, gravityX, gravityY)
  state.nextHue = (state.nextHue + 137.508) % 360
  const element = document.createElement('div')
  element.className = `ball${negative ? ' neg' : ''}`
  const size = ball.r * 2
  element.style.width = `${size}px`
  element.style.height = `${size}px`
  element.style.background = ballGradient(ball.hue, negative)
  parent.appendChild(element)
  state.rendered.push({ ...ball, el: element, pointerId: null })
}

const cancelBallDrag = (state: TickState, parent: HTMLElement, ball: BallState): void => {
  if (ball.pointerId === null) return
  const pointerId = ball.pointerId
  state.drags.delete(pointerId)
  ball.pointerId = null
  ball.el.classList.remove('ball--dragging')
  if (parent.hasPointerCapture(pointerId)) parent.releasePointerCapture(pointerId)
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
    if (ball) {
      cancelBallDrag(state, parent, ball)
      poof(ball.el, activeParticles)
    }
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
  const direction = negative ? -1 : 1
  const gravityX = state.gravityX * direction
  const gravityY = state.gravityY * direction
  while (state.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    simulate(state.rendered, state.w, state.h, gravityX, gravityY)
    state.accumulator -= FIXED_DT
    steps++
  }

  for (const ball of state.rendered) {
    ball.el.style.transform = `translate3d(${ball.x - ball.r}px,${ball.y - ball.r}px,0)`
  }
}

export const mountCounterBalls = (element: Element): Stream.Stream<never> =>
  Stream.callback<never>(() =>
    Effect.gen(function* () {
      const activeParticles = new Set<HTMLElement>()
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const parent = element as HTMLElement
          const rect = parent.getBoundingClientRect()
          const state: TickState = {
            rendered: [],
            drags: new Map(),
            running: true,
            id: 0,
            w: rect.width,
            h: rect.height,
            target: parseBallCount(parent.getAttribute('data-count')),
            fontSize: parseBallFontSize(parent.getAttribute('data-fontsize')),
            dirty: true,
            spawnElapsed: SPAWN_INTERVAL,
            lastTime: performance.now(),
            accumulator: 0,
            nextHue: 0,
            gravityX: 0,
            gravityY: 1,
            tiltGravity: parent.getAttribute('data-tilt-gravity') === 'true',
          }
          const ro = new ResizeObserver(() => { state.dirty = true })
          ro.observe(parent)
          const mo = new MutationObserver(() => {
            state.target = parseBallCount(parent.getAttribute('data-count'))
            state.fontSize = parseBallFontSize(parent.getAttribute('data-fontsize'))
            state.tiltGravity = parent.getAttribute('data-tilt-gravity') === 'true'
            if (!state.tiltGravity) {
              state.gravityX = 0
              state.gravityY = 1
            }
          })
          mo.observe(parent, { attributes: true, attributeFilter: ['data-count', 'data-fontsize', 'data-tilt-gravity'] })

          const localPoint = (event: PointerEvent): { x: number; y: number } => {
            const bounds = parent.getBoundingClientRect()
            return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
          }
          const moveHeldBall = (event: PointerEvent, sampleVelocity: boolean = true): void => {
            const drag = state.drags.get(event.pointerId)
            if (!drag) return
            const point = localPoint(event)
            drag.ball.x = point.x - drag.offsetX
            drag.ball.y = point.y - drag.offsetY
            constrainToBounds(drag.ball, state.w, state.h)
            const elapsed = event.timeStamp - drag.lastTime
            if (sampleVelocity && elapsed > 0) {
              const sampleX = (drag.ball.x - drag.lastX) * 1000 / elapsed
              const sampleY = (drag.ball.y - drag.lastY) * 1000 / elapsed
              drag.velocityX = drag.hasVelocity
                ? drag.velocityX * (1 - FLING_SAMPLE_BLEND) + sampleX * FLING_SAMPLE_BLEND
                : sampleX
              drag.velocityY = drag.hasVelocity
                ? drag.velocityY * (1 - FLING_SAMPLE_BLEND) + sampleY * FLING_SAMPLE_BLEND
                : sampleY
              const speed = Math.hypot(drag.velocityX, drag.velocityY)
              if (speed > MAX_FLING_SPEED) {
                const scale = MAX_FLING_SPEED / speed
                drag.velocityX *= scale
                drag.velocityY *= scale
              }
              drag.hasVelocity = true
              drag.lastX = drag.ball.x
              drag.lastY = drag.ball.y
              drag.lastTime = event.timeStamp
              drag.ball.vx = drag.velocityX
              drag.ball.vy = drag.velocityY
            }
            drag.ball.el.style.transform = `translate3d(${drag.ball.x - drag.ball.r}px,${drag.ball.y - drag.ball.r}px,0)`
            event.preventDefault()
          }
          const onPointerDown = (event: PointerEvent): void => {
            if (event.pointerType === 'mouse' && event.button !== 0) return
            const target = (event.target as Element | null)?.closest('.ball') as HTMLElement | null
            if (!target) return
            const ball = state.rendered.find(candidate => candidate.el === target)
            if (!ball || ball.pointerId !== null) return
            const point = localPoint(event)
            ball.pointerId = event.pointerId
            ball.vx = 0
            ball.vy = 0
            ball.el.classList.add('ball--dragging')
            state.drags.set(event.pointerId, {
              ball,
              offsetX: point.x - ball.x,
              offsetY: point.y - ball.y,
              lastX: ball.x,
              lastY: ball.y,
              lastTime: event.timeStamp,
              velocityX: 0,
              velocityY: 0,
              hasVelocity: false,
            })
            parent.setPointerCapture?.(event.pointerId)
            event.preventDefault()
          }
          const onPointerMove = (event: PointerEvent): void => moveHeldBall(event)
          const finishDrag = (event: PointerEvent): void => {
            const drag = state.drags.get(event.pointerId)
            if (!drag) return
            if (event.type === 'pointerup') {
              moveHeldBall(event, false)
              const idleTime = Math.max(0, event.timeStamp - drag.lastTime - FLING_RELEASE_GRACE_MS)
              const releaseScale = Math.exp(-idleTime / FLING_RELEASE_DECAY_MS)
              drag.ball.vx = drag.velocityX * releaseScale
              drag.ball.vy = drag.velocityY * releaseScale
            } else {
              drag.ball.vx = 0
              drag.ball.vy = 0
            }
            cancelBallDrag(state, parent, drag.ball)
            event.preventDefault()
          }
          const onOrientation = (event: DeviceOrientationEvent): void => {
            if (!state.tiltGravity) return
            const gravity = orientationGravity(event.beta, event.gamma, currentScreenAngle())
            if (!gravity) return
            const nextX = state.gravityX * (1 - ORIENTATION_SMOOTHING) + gravity[0] * ORIENTATION_SMOOTHING
            const nextY = state.gravityY * (1 - ORIENTATION_SMOOTHING) + gravity[1] * ORIENTATION_SMOOTHING
            state.gravityX = Math.abs(nextX) < ORIENTATION_DEAD_ZONE ? 0 : nextX
            state.gravityY = Math.abs(nextY) < ORIENTATION_DEAD_ZONE ? 0 : nextY
          }
          parent.addEventListener('pointerdown', onPointerDown)
          parent.addEventListener('pointermove', onPointerMove)
          parent.addEventListener('pointerup', finishDrag)
          parent.addEventListener('pointercancel', finishDrag)
          window.addEventListener('deviceorientation', onOrientation)
          const loop = (now: number) => {
            if (!state.running) return
            tick(state, parent, activeParticles, now)
            state.id = requestAnimationFrame(loop)
          }
          state.id = requestAnimationFrame(loop)
          return { parent, state, ro, mo, onPointerDown, onPointerMove, finishDrag, onOrientation }
        }),
        ({ parent, state, ro, mo, onPointerDown, onPointerMove, finishDrag, onOrientation }) => Effect.sync(() => {
          state.running = false
          cancelAnimationFrame(state.id)
          ro.disconnect()
          mo.disconnect()
          parent.removeEventListener('pointerdown', onPointerDown)
          parent.removeEventListener('pointermove', onPointerMove)
          parent.removeEventListener('pointerup', finishDrag)
          parent.removeEventListener('pointercancel', finishDrag)
          window.removeEventListener('deviceorientation', onOrientation)
          state.rendered.forEach(ball => {
            cancelBallDrag(state, parent, ball)
            ball.el.remove()
          })
          activeParticles.forEach(particle => particle.remove())
          activeParticles.clear()
        }),
      )
      return yield* Effect.never
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()

  const displayText = (): string => {
    if (model.displayMode === 'word') return numberToWord(model.count, language)
    if (model.displayMode === 'both') return `${model.count} · ${numberToWord(model.count, language)}`
    return model.count.toString()
  }

  const btnAttrs = (msg: (d: number, btn: 'inc' | 'dec') => Message, btn: 'inc' | 'dec') => [
    h.Class(`btn btn-primary counter-size-btn${model.pressedButton === btn ? ' counter-size-btn--charging' : ''}`),
    h.Attribute('aria-pressed', String(model.pressedButton === btn)),
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
    [h.Class('page counter-page')],
    [
      h.div([h.Class('card counter-card')], [
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
            h.Attribute('data-tilt-gravity', String(model.tiltGravity)),
            h.OnMount({
              name: 'counterBalls',
              f: mountCounterBalls,
            }),
          ], []),
          h.p([h.Class(model.holding ? 'number holding' : model.count < 0 ? 'number negative' : 'number'), h.Style({ color: numberColor(model.count), fontSize: `${model.fontSize}rem`, position: 'relative', zIndex: '2' }), h.Key(model.count.toString())], [displayText()]),
        ]),
      ]),
    ],
  )
}
