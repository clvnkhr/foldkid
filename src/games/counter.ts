import { Effect, Match as M, Queue, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { click, swoosh, warmAudio } from '../audio'
import { speak, type SpeechOptions } from '../speech'
import { t } from '../i18n'
import { numberToWord } from '../numberWords'

export { numberToWord } from '../numberWords'

export const DisplayMode = S.Union([S.Literal('number'), S.Literal('word'), S.Literal('both')])
const PressedButton = S.Union([S.Literal('inc'), S.Literal('dec')])
type PressedButton = typeof PressedButton.Type
const Press = S.Struct({ pointerId: S.Number, timeStamp: S.Number, button: PressedButton })
type Press = typeof Press.Type

export const Model = S.Struct({
  count: S.Number,
  fontSize: S.Number,
  holding: S.Boolean,
  pointerDownTime: S.Number,
  pressedButton: S.Union([PressedButton, S.Null]),
  presses: S.Array(Press),
  displayMode: DisplayMode,
  tiltGravity: S.Boolean,
})
export type Model = typeof Model.Type

export const PointerDown = m('CounterPointerDown', { timeStamp: S.Number, button: PressedButton, pointerId: S.optionalKey(S.Number) })
export const PressedIncrement = m('CounterPressedIncrement', { duration: S.Number, button: S.optionalKey(PressedButton), pointerId: S.optionalKey(S.Number) })
export const PressedDecrement = m('CounterPressedDecrement', { duration: S.Number, button: S.optionalKey(PressedButton), pointerId: S.optionalKey(S.Number) })
export const PressCancelled = m('CounterPressCancelled', { pointerId: S.Number })
export const ClickedReset = m('CounterClickedReset')
export const SetDisplayMode = m('CounterSetDisplayMode', { value: DisplayMode })
export const SetTiltGravity = m('CounterSetTiltGravity', { value: S.Boolean })
export const SoundPlayed = m('CounterSoundPlayed')

export const Message = S.Union([PointerDown, PressedIncrement, PressedDecrement, PressCancelled, ClickedReset, SetDisplayMode, SetTiltGravity, SoundPlayed])
export type Message = typeof Message.Type

export const init: Model = { count: 0, fontSize: 3, holding: false, pointerDownTime: 0, pressedButton: null, presses: [], displayMode: 'number', tiltGravity: false }

const calcFontSize = (duration: number): number => {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0
  const s = safeDuration / 1000
  return Math.min(20, Math.max(3, Math.round(3 + (s / 2) * 17)))
}

const withPresses = (model: Model, presses: readonly Press[]): Model => {
  const last = presses.at(-1)
  return { ...model, presses, holding: presses.length > 0, pressedButton: last?.button ?? null, pointerDownTime: last?.timeStamp ?? model.pointerDownTime }
}

const shouldCompletePress = (model: Model, button: PressedButton | undefined, pointerId: number | undefined, expected: PressedButton, duration: number): boolean => {
  if (!Number.isFinite(duration) || duration < 0) return false
  if (button !== undefined && button !== expected) return false
  if (pointerId === undefined && button === undefined) return true
  return model.presses.some(press => press.pointerId === (pointerId ?? 0) && press.button === expected)
}

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
      CounterPointerDown: (msg) => {
        const pointerId = msg.pointerId ?? 0
        if (!Number.isSafeInteger(pointerId) || !Number.isFinite(msg.timeStamp) || model.presses.some(press => press.pointerId === pointerId)) return [model, []]
        return [withPresses(model, [...model.presses, { pointerId, timeStamp: msg.timeStamp, button: msg.button }]), []]
      },
      CounterPressedIncrement: (msg) => [
        shouldCompletePress(model, msg.button, msg.pointerId, 'inc', msg.duration)
          ? { ...withPresses(model, model.presses.filter(press => press.pointerId !== (msg.pointerId ?? 0))), count: model.count + 1, fontSize: calcFontSize(msg.duration) }
          : model,
        shouldCompletePress(model, msg.button, msg.pointerId, 'inc', msg.duration) && !muted ? [click(SoundPlayed()), speak(numberToWord(model.count + 1, language), SoundPlayed(), { ...speech, lang: language })] : [],
      ],
      CounterPressedDecrement: (msg) => [
        shouldCompletePress(model, msg.button, msg.pointerId, 'dec', msg.duration)
          ? { ...withPresses(model, model.presses.filter(press => press.pointerId !== (msg.pointerId ?? 0))), count: model.count - 1, fontSize: calcFontSize(msg.duration) }
          : model,
        shouldCompletePress(model, msg.button, msg.pointerId, 'dec', msg.duration) && !muted ? [click(SoundPlayed()), speak(numberToWord(model.count - 1, language), SoundPlayed(), { ...speech, lang: language })] : [],
      ],
      CounterPressCancelled: (msg) => [withPresses(model, model.presses.filter(press => press.pointerId !== msg.pointerId)), []],
      CounterClickedReset: () => [
        { ...withPresses(model, []), count: 0 },
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
  captureElement: HTMLElement | null
  clientX: number
  clientY: number
  startTimeStamp: number
  nativePointerId?: number
  offsetX: number
  offsetY: number
  lastX: number
  lastY: number
  lastTime: number
  velocityX: number
  velocityY: number
  hasVelocity: boolean
}

interface BallDragPoint {
  id: number
  clientX: number
  clientY: number
  timeStamp: number
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

const cancelBallDrag = (state: TickState, ball: BallState): void => {
  if (ball.pointerId === null) return
  const pointerId = ball.pointerId
  const captureElement = state.drags.get(pointerId)?.captureElement
  state.drags.delete(pointerId)
  ball.pointerId = null
  ball.el.classList.remove('ball--dragging')
  try {
    if (captureElement?.hasPointerCapture(pointerId)) captureElement.releasePointerCapture(pointerId)
  } catch {
    // WebKit may have already discarded capture when a pointer is cancelled.
  }
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
      cancelBallDrag(state, ball)
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

          const localPoint = (point: BallDragPoint): { x: number; y: number } => {
            const bounds = parent.getBoundingClientRect()
            return { x: point.clientX - bounds.left, y: point.clientY - bounds.top }
          }
          const startDrag = (
            target: EventTarget | null,
            point: BallDragPoint,
            captureElement: HTMLElement | null,
          ): boolean => {
            const ballElement = target instanceof Element
              ? target.closest('.ball') as HTMLElement | null
              : null
            if (!ballElement) return false
            const ball = state.rendered.find(candidate => candidate.el === ballElement)
            if (!ball || ball.pointerId !== null) return false
            const local = localPoint(point)
            ball.pointerId = point.id
            ball.vx = 0
            ball.vy = 0
            ball.el.classList.add('ball--dragging')
            state.drags.set(point.id, {
              ball,
              captureElement,
              clientX: point.clientX,
              clientY: point.clientY,
              startTimeStamp: point.timeStamp,
              offsetX: local.x - ball.x,
              offsetY: local.y - ball.y,
              lastX: ball.x,
              lastY: ball.y,
              lastTime: point.timeStamp,
              velocityX: 0,
              velocityY: 0,
              hasVelocity: false,
            })
            if (captureElement) {
              try {
                captureElement.setPointerCapture(point.id)
              } catch {
                // Dragging still works while the pointer remains over the play area.
              }
            }
            return true
          }
          const moveHeldBall = (point: BallDragPoint, sampleVelocity: boolean = true): boolean => {
            const drag = state.drags.get(point.id)
            if (!drag) return false
            const local = localPoint(point)
            drag.clientX = point.clientX
            drag.clientY = point.clientY
            drag.ball.x = local.x - drag.offsetX
            drag.ball.y = local.y - drag.offsetY
            constrainToBounds(drag.ball, state.w, state.h)
            const elapsed = point.timeStamp - drag.lastTime
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
              drag.lastTime = point.timeStamp
              drag.ball.vx = drag.velocityX
              drag.ball.vy = drag.velocityY
            }
            drag.ball.el.style.transform = `translate3d(${drag.ball.x - drag.ball.r}px,${drag.ball.y - drag.ball.r}px,0)`
            return true
          }
          const finishDrag = (point: BallDragPoint, cancelled: boolean): boolean => {
            const drag = state.drags.get(point.id)
            if (!drag) return false
            if (!cancelled) {
              moveHeldBall(point, false)
              const idleTime = Math.max(0, point.timeStamp - drag.lastTime - FLING_RELEASE_GRACE_MS)
              const releaseScale = Math.exp(-idleTime / FLING_RELEASE_DECAY_MS)
              drag.ball.vx = drag.velocityX * releaseScale
              drag.ball.vy = drag.velocityY * releaseScale
            } else {
              drag.ball.vx = 0
              drag.ball.vy = 0
            }
            cancelBallDrag(state, drag.ball)
            for (const [alias, nativeId] of nativePointers) if (nativeId === point.id) nativePointers.delete(alias)
            return true
          }
          // Adopt native touches when they arrive. Merely exposing TouchEvent
          // does not mean a touchscreen sends that stream.
          const touchPointers = new Set<number>()
          const nativePointers = new Map<number, number>()
          const onPointerDown = (event: PointerEvent): void => {
            if (event.button !== 0) return
            const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.ball') : null
            if (!target) return
            if (event.pointerType === 'touch') {
              const aliased = nativePointers.get(event.pointerId)
              if (aliased !== undefined && state.drags.has(aliased)) return
              nativePointers.delete(event.pointerId)
              const native = [...state.drags].find(([id, drag]) => id < 0 && drag.nativePointerId === undefined && drag.ball.el === target && Math.hypot(drag.clientX - event.clientX, drag.clientY - event.clientY) <= 1 && Math.abs(drag.startTimeStamp - event.timeStamp) <= 40)
              if (native) { native[1].nativePointerId = event.pointerId; nativePointers.set(event.pointerId, native[0]); return }
            }
            if (startDrag(target, {
              id: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              timeStamp: event.timeStamp,
            }, event.pointerType === 'touch' ? null : target)) {
              if (event.pointerType === 'touch') touchPointers.add(event.pointerId)
              event.preventDefault()
            }
          }
          const onPointerMove = (event: PointerEvent): void => {
            if (moveHeldBall({
              id: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              timeStamp: event.timeStamp,
            })) event.preventDefault()
          }
          const onPointerFinish = (event: PointerEvent): void => {
            const nativeId = nativePointers.get(event.pointerId)
            if (nativeId !== undefined) {
              if (event.type === 'lostpointercapture') return
              nativePointers.delete(event.pointerId)
              if (event.type === 'pointercancel') finishDrag({ id: nativeId, clientX: event.clientX, clientY: event.clientY, timeStamp: event.timeStamp }, true)
              return
            }
            const handled = finishDrag({
              id: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              timeStamp: event.timeStamp,
            }, event.type !== 'pointerup')
            touchPointers.delete(event.pointerId)
            if (handled) event.preventDefault()
          }
          const touchId = (identifier: number): number => -identifier - 1
          const eachChangedTouch = (event: TouchEvent, fn: (touch: Touch) => boolean): boolean => {
            let handled = false
            for (let index = 0; index < event.changedTouches.length; index++) {
              const touch = event.changedTouches.item(index)
              if (touch && fn(touch)) handled = true
            }
            return handled
          }
          const touchPoint = (touch: Touch, event: TouchEvent): BallDragPoint => ({
            id: touchId(touch.identifier),
            clientX: touch.clientX,
            clientY: touch.clientY,
            timeStamp: event.timeStamp,
          })
          const onTouchStart = (event: TouchEvent): void => {
            if (eachChangedTouch(event, touch => {
              const ballElement = touch.target instanceof Element ? touch.target.closest('.ball') : null
              const pointerId = [...touchPointers].find(id => {
                const drag = state.drags.get(id)
                return drag?.ball.el === ballElement && Math.hypot(drag.clientX - touch.clientX, drag.clientY - touch.clientY) <= 1 && Math.abs(drag.startTimeStamp - event.timeStamp) <= 40
              })
              if (pointerId !== undefined) {
                const drag = state.drags.get(pointerId)!
                const id = touchId(touch.identifier)
                state.drags.delete(pointerId)
                touchPointers.delete(pointerId)
                state.drags.set(id, drag)
                drag.ball.pointerId = id
                drag.nativePointerId = pointerId
                nativePointers.set(pointerId, id)
                return true
              }
              return startDrag(touch.target, touchPoint(touch, event), null)
            })) {
              event.preventDefault()
            }
          }
          const onTouchMove = (event: TouchEvent): void => {
            if (eachChangedTouch(event, touch => moveHeldBall(touchPoint(touch, event)))) event.preventDefault()
          }
          const onTouchEnd = (event: TouchEvent): void => {
            if (eachChangedTouch(event, touch => finishDrag(touchPoint(touch, event), false))) event.preventDefault()
          }
          const onTouchCancel = (event: TouchEvent): void => {
            if (eachChangedTouch(event, touch => finishDrag(touchPoint(touch, event), true))) event.preventDefault()
          }
          const cancelDrags = (): void => {
            for (const drag of [...state.drags.values()]) {
              drag.ball.vx = 0
              drag.ball.vy = 0
              cancelBallDrag(state, drag.ball)
            }
            touchPointers.clear()
            nativePointers.clear()
          }
          const onVisibility = (): void => { if (parent.ownerDocument.hidden) cancelDrags() }
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
          parent.addEventListener('lostpointercapture', onPointerFinish)
          parent.ownerDocument.addEventListener('pointermove', onPointerMove, { capture: true, passive: false })
          parent.ownerDocument.addEventListener('pointerup', onPointerFinish, true)
          parent.ownerDocument.addEventListener('pointercancel', onPointerFinish, true)
          parent.addEventListener('touchstart', onTouchStart, { passive: false })
          parent.ownerDocument.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
          parent.ownerDocument.addEventListener('touchend', onTouchEnd, { capture: true, passive: false })
          parent.ownerDocument.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: false })
          parent.ownerDocument.addEventListener('visibilitychange', onVisibility)
          window.addEventListener('blur', cancelDrags)
          window.addEventListener('deviceorientation', onOrientation)
          const loop = (now: number) => {
            if (!state.running) return
            tick(state, parent, activeParticles, now)
            state.id = requestAnimationFrame(loop)
          }
          state.id = requestAnimationFrame(loop)
          return {
            parent, state, ro, mo, onPointerDown, onPointerMove, onPointerFinish,
            onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onOrientation, cancelDrags, onVisibility,
          }
        }),
        ({
          parent, state, ro, mo, onPointerDown, onPointerMove, onPointerFinish,
          onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onOrientation, cancelDrags, onVisibility,
        }) => Effect.sync(() => {
          state.running = false
          cancelAnimationFrame(state.id)
          ro.disconnect()
          mo.disconnect()
          parent.removeEventListener('pointerdown', onPointerDown)
          parent.removeEventListener('lostpointercapture', onPointerFinish)
          parent.ownerDocument.removeEventListener('pointermove', onPointerMove, true)
          parent.ownerDocument.removeEventListener('pointerup', onPointerFinish, true)
          parent.ownerDocument.removeEventListener('pointercancel', onPointerFinish, true)
          parent.removeEventListener('touchstart', onTouchStart)
          parent.ownerDocument.removeEventListener('touchmove', onTouchMove, true)
          parent.ownerDocument.removeEventListener('touchend', onTouchEnd, true)
          parent.ownerDocument.removeEventListener('touchcancel', onTouchCancel, true)
          parent.ownerDocument.removeEventListener('visibilitychange', onVisibility)
          window.removeEventListener('blur', cancelDrags)
          window.removeEventListener('deviceorientation', onOrientation)
          state.rendered.forEach(ball => {
            cancelBallDrag(state, ball)
            ball.el.remove()
          })
          activeParticles.forEach(particle => particle.remove())
          activeParticles.clear()
        }),
      )
      return yield* Effect.never
    }),
  )

export const mountCounterPresses = (element: Element): Stream.Stream<Message> =>
  Stream.callback<Message>(queue => Effect.gen(function* () {
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const root = element as HTMLElement
        const presses = new Map<number, { button: PressedButton; element: HTMLElement; timeStamp: number; captured: boolean; pointerId: number; touchPointer: boolean; touchInput: boolean; clientX: number; clientY: number; nativePointerId?: number }>()
        const nativePointers = new Map<number, number>()
        const suppressClicks = new Map<HTMLElement, { time: number; touch: boolean }>()
        const start = (pointerId: number, target: EventTarget | null, timeStamp: number, capture: boolean, touchPointer = false, clientX = 0, clientY = 0): boolean => {
          if (!(target instanceof Element) || presses.has(pointerId)) return false
          const buttonElement = target.closest<HTMLElement>('[data-counter-button]')
          const button = buttonElement?.dataset.counterButton
          if (!buttonElement || !root.contains(buttonElement) || (button !== 'inc' && button !== 'dec')) return false
          let captured = false
          if (capture) {
            try { buttonElement.setPointerCapture(pointerId); captured = true } catch { /* Document listeners keep uncaptured presses alive. */ }
          }
          presses.set(pointerId, { button, element: buttonElement, timeStamp, captured, pointerId, touchPointer, touchInput: !capture, clientX, clientY })
          Queue.offerUnsafe(queue, PointerDown({ pointerId, timeStamp, button }))
          return true
        }
        const finish = (pointerId: number, timeStamp: number, cancelled: boolean): boolean => {
          const press = presses.get(pointerId)
          if (!press) return false
          presses.delete(pointerId)
          for (const [alias, nativeId] of nativePointers) if (nativeId === pointerId) nativePointers.delete(alias)
          suppressClicks.set(press.element, { time: Date.now(), touch: press.touchInput })
          if (press.captured) {
            try { if (press.element.hasPointerCapture(press.pointerId)) press.element.releasePointerCapture(press.pointerId) } catch { /* WebKit may already have released capture. */ }
          }
          if (cancelled) Queue.offerUnsafe(queue, PressCancelled({ pointerId: press.pointerId }))
          else {
            warmAudio()
            const payload = { pointerId: press.pointerId, duration: Math.max(0, timeStamp - press.timeStamp), button: press.button }
            Queue.offerUnsafe(queue, press.button === 'inc' ? PressedIncrement(payload) : PressedDecrement(payload))
          }
          return true
        }
        const onPointerDown = (event: PointerEvent): void => {
          if (event.button !== 0) return
          if (event.pointerType === 'touch') {
            if (nativePointers.has(event.pointerId)) return
            const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-counter-button]') : null
            const native = [...presses].find(([id, press]) => id < 0 && press.nativePointerId === undefined && press.element === button && Math.hypot(press.clientX - event.clientX, press.clientY - event.clientY) <= 1 && Math.abs(press.timeStamp - event.timeStamp) <= 40)
            if (native) { native[1].nativePointerId = event.pointerId; nativePointers.set(event.pointerId, native[0]); return }
          }
          if ((event.pointerType === 'mouse' || event.pointerType === 'pen') && event.target instanceof Element) {
            const button = event.target.closest<HTMLElement>('[data-counter-button]')
            if (button) suppressClicks.delete(button)
          }
          start(event.pointerId, event.target, event.timeStamp, event.pointerType !== 'touch', event.pointerType === 'touch', event.clientX, event.clientY)
        }
        const onPointerFinish = (event: PointerEvent): void => {
          const nativeId = nativePointers.get(event.pointerId)
          if (nativeId !== undefined) {
            if (event.type === 'lostpointercapture') return
            nativePointers.delete(event.pointerId)
            if (event.type !== 'pointerup') finish(nativeId, event.timeStamp, true)
            return
          }
          if (finish(event.pointerId, event.timeStamp, event.type !== 'pointerup') && event.pointerType === 'touch') event.preventDefault()
        }
        const eachTouch = (event: TouchEvent, fn: (touch: Touch) => boolean): boolean => {
          let handled = false
          for (let index = 0; index < event.changedTouches.length; index++) {
            const touch = event.changedTouches.item(index)
            if (touch && fn(touch)) handled = true
          }
          return handled
        }
        const onTouchStart = (event: TouchEvent): void => {
          eachTouch(event, touch => {
            const id = -touch.identifier - 1
            if (presses.has(id)) return false
            const button = touch.target instanceof Element ? touch.target.closest<HTMLElement>('[data-counter-button]') : null
            const pointer = [...presses].find(([, press]) => press.touchPointer && press.element === button && Math.hypot(press.clientX - touch.clientX, press.clientY - touch.clientY) <= 1 && Math.abs(press.timeStamp - event.timeStamp) <= 40)
            if (pointer) {
              presses.delete(pointer[0])
              presses.set(id, { ...pointer[1], touchPointer: false, nativePointerId: pointer[0] })
              nativePointers.set(pointer[0], id)
              return true
            }
            return start(id, touch.target, event.timeStamp, false, false, touch.clientX, touch.clientY)
          })
        }
        const onTouchFinish = (event: TouchEvent): void => {
          if (eachTouch(event, touch => finish(-touch.identifier - 1, event.timeStamp, event.type === 'touchcancel'))) event.preventDefault()
        }
        const onClick = (event: MouseEvent): void => {
          const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-counter-button]') : null
          const capabilities = (event as MouseEvent & { sourceCapabilities?: { firesTouchEvents: boolean } }).sourceCapabilities
          const release = button && suppressClicks.get(button)
          const pendingTouch = button && [...presses.values()].some(press => press.element === button && press.touchInput)
          if (event.detail > 0 && ((pendingTouch && capabilities?.firesTouchEvents !== false) || (release && (!release.touch || capabilities?.firesTouchEvents !== false) && Date.now() - release.time < 800))) {
            event.preventDefault()
            event.stopImmediatePropagation()
          } else if (button) warmAudio()
        }
        const cancelAll = (): void => { for (const pointerId of [...presses.keys()]) finish(pointerId, 0, true) }
        const onVisibility = (): void => { if (root.ownerDocument.hidden) cancelAll() }
        root.addEventListener('pointerdown', onPointerDown)
        root.addEventListener('lostpointercapture', onPointerFinish)
        root.ownerDocument.addEventListener('pointerup', onPointerFinish, { capture: true, passive: false })
        root.ownerDocument.addEventListener('pointercancel', onPointerFinish, true)
        root.addEventListener('touchstart', onTouchStart, { passive: true })
        root.ownerDocument.addEventListener('touchend', onTouchFinish, { capture: true, passive: false })
        root.ownerDocument.addEventListener('touchcancel', onTouchFinish, { capture: true, passive: false })
        root.addEventListener('click', onClick, { capture: true })
        window.addEventListener('blur', cancelAll)
        root.ownerDocument.addEventListener('visibilitychange', onVisibility)
        return { onPointerDown, onPointerFinish, onTouchStart, onTouchFinish, onClick, cancelAll, onVisibility }
      }),
      ({ onPointerDown, onPointerFinish, onTouchStart, onTouchFinish, onClick, cancelAll, onVisibility }) => Effect.sync(() => {
        element.removeEventListener('pointerdown', onPointerDown as EventListener)
        element.removeEventListener('lostpointercapture', onPointerFinish as EventListener)
        element.ownerDocument.removeEventListener('pointerup', onPointerFinish, true)
        element.ownerDocument.removeEventListener('pointercancel', onPointerFinish, true)
        element.removeEventListener('touchstart', onTouchStart as EventListener)
        element.ownerDocument.removeEventListener('touchend', onTouchFinish, true)
        element.ownerDocument.removeEventListener('touchcancel', onTouchFinish, true)
        element.removeEventListener('click', onClick as EventListener, { capture: true })
        window.removeEventListener('blur', cancelAll)
        element.ownerDocument.removeEventListener('visibilitychange', onVisibility)
        cancelAll()
      }),
    )
    return yield* Effect.never
  }))

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()

  const displayText = (): string => {
    if (model.displayMode === 'word') return numberToWord(model.count, language)
    if (model.displayMode === 'both') return `${model.count} · ${numberToWord(model.count, language)}`
    return model.count.toString()
  }

  const btnAttrs = (msg: Message, btn: PressedButton) => [
    h.Class(`btn btn-primary counter-size-btn${model.presses.some(press => press.button === btn) ? ' counter-size-btn--charging' : ''}`),
    h.Attribute('aria-pressed', String(model.presses.some(press => press.button === btn))),
    h.Attribute('data-counter-button', btn),
    h.Attribute('data-multitouch-owned', 'true'),
    h.OnClick(msg),
  ] as const

  return h.div(
    [h.Class('page counter-page')],
    [
      h.div([h.Class('card counter-card')], [
        h.h1([h.Class('title')], [t('counterTitle', language)]),
        h.div([h.Class('buttons counter-actions'), h.OnMount({ name: 'counterPresses', f: mountCounterPresses })], [
          h.button(
            btnAttrs(PressedDecrement({ duration: 0 }), 'dec'),
            ['-1'],
          ),
          h.button(
            [h.OnClick(ClickedReset()), h.Class('btn btn-secondary')],
            [t('reset', language)],
          ),
          h.button(
            btnAttrs(PressedIncrement({ duration: 0 }), 'inc'),
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
