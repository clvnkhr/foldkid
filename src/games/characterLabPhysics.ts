export interface CharacterLabBody {
  readonly id: number
  readonly character: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
  angle: number
  spin: number
  held: boolean
  readonly readyAt: number
}

export const CHARACTER_LAB_FIXED_STEP = 1 / 120
export const CHARACTER_LAB_MAX_SPEED = 1800
const GRAVITY = 2100
const RESTITUTION = .38
const FLOOR_SLEEP_SPEED = 65

export const constrainCharacterLabBody = (body: CharacterLabBody, width: number, height: number): void => {
  const radiusX = Math.min(body.r, width / 2)
  const radiusY = Math.min(body.r, height / 2)
  body.x = Math.max(radiusX, Math.min(Math.max(radiusX, width - radiusX), body.x))
  body.y = Math.max(radiusY, Math.min(Math.max(radiusY, height - radiusY), body.y))
}

const walls = (body: CharacterLabBody, width: number, height: number, dt: number): void => {
  const minX = Math.min(body.r, width / 2)
  const minY = Math.min(body.r, height / 2)
  const maxX = Math.max(minX, width - minX)
  const maxY = Math.max(minY, height - minY)
  if (body.x < minX || body.x > maxX) {
    const direction = body.x < minX ? 1 : -1
    body.x = direction === 1 ? minX : maxX
    if (body.vx * direction < 0) body.vx = Math.abs(body.vx) < FLOOR_SLEEP_SPEED ? 0 : -body.vx * RESTITUTION
    body.spin += body.vy / Math.max(1, body.r) * direction * .06
  }
  if (body.y < minY || body.y > maxY) {
    const direction = body.y < minY ? 1 : -1
    body.y = direction === 1 ? minY : maxY
    if (body.vy * direction < 0) body.vy = Math.abs(body.vy) < FLOOR_SLEEP_SPEED ? 0 : -body.vy * RESTITUTION
    if (direction === -1) {
      body.vx *= Math.exp(-7 * dt)
      body.spin *= Math.exp(-8 * dt)
      if (Math.abs(body.vx) < .25) body.vx = 0
      if (Math.abs(body.spin) < .025) body.spin = 0
    }
  }
}

/** Fixed-step circular contacts: linear impulses plus friction-driven spin. */
export const stepCharacterLabPhysics = (
  bodies: ReadonlyArray<CharacterLabBody>, width: number, height: number, dt: number,
  contacted: (a: CharacterLabBody, b: CharacterLabBody) => void = () => {},
): void => {
  if (![width, height, dt].every(Number.isFinite) || width <= 0 || height <= 0 || dt <= 0 || dt > .05) return
  for (const body of bodies) {
    if (body.held) continue
    body.vx *= Math.exp(-.55 * dt)
    body.vy = Math.min(CHARACTER_LAB_MAX_SPEED, (body.vy + GRAVITY * dt) * Math.exp(-.25 * dt))
    body.spin *= Math.exp(-1.1 * dt)
    body.x += body.vx * dt
    body.y += body.vy * dt
    body.angle = (body.angle + body.spin * dt) % (Math.PI * 2)
    walls(body, width, height, dt)
  }
  // Sixty pieces at most: a compact all-pairs pass avoids grid allocations.
  for (let iteration = 0; iteration < 4; iteration++) for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i]!
    const b = bodies[j]!
    let dx = b.x - a.x
    let dy = b.y - a.y
    const minimum = a.r + b.r
    let distance = Math.hypot(dx, dy)
    if (distance > minimum + .1) continue
    if (iteration === 0) contacted(a, b)
    if (distance < .00001) {
      const direction = ((a.id * 73856093 + b.id * 19349663) % 360) * Math.PI / 180
      dx = Math.cos(direction)
      dy = Math.sin(direction)
      distance = 1
    }
    const nx = dx / distance
    const ny = dy / distance
    const ia = a.held ? 0 : 1 / (a.r * a.r)
    const ib = b.held ? 0 : 1 / (b.r * b.r)
    const mass = ia + ib
    if (mass === 0) continue
    const correction = Math.max(0, minimum - distance) / mass
    a.x -= nx * correction * ia
    a.y -= ny * correction * ia
    b.x += nx * correction * ib
    b.y += ny * correction * ib
    const rvx = b.vx - a.vx
    const rvy = b.vy - a.vy
    const normal = rvx * nx + rvy * ny
    if (normal < 0) {
      const impulse = -(1 + RESTITUTION) * normal / mass
      a.vx -= impulse * nx * ia
      a.vy -= impulse * ny * ia
      b.vx += impulse * nx * ib
      b.vy += impulse * ny * ib
      const inverseInertiaA = a.held ? 0 : 2 / (a.r ** 4)
      const inverseInertiaB = b.held ? 0 : 2 / (b.r ** 4)
      const tangentVelocity = rvx * -ny + rvy * nx - a.spin * a.r - b.spin * b.r
      const tangentMass = mass + a.r * a.r * inverseInertiaA + b.r * b.r * inverseInertiaB
      const friction = Math.max(-impulse * .22, Math.min(impulse * .22, -tangentVelocity / tangentMass))
      a.vx -= friction * -ny * ia
      a.vy -= friction * nx * ia
      b.vx += friction * -ny * ib
      b.vy += friction * nx * ib
      a.spin = Math.max(-12, Math.min(12, a.spin - friction * a.r * inverseInertiaA))
      b.spin = Math.max(-12, Math.min(12, b.spin - friction * b.r * inverseInertiaB))
    }
    constrainCharacterLabBody(a, width, height)
    constrainCharacterLabBody(b, width, height)
  }
  for (const body of bodies) {
    if (body.held) continue
    const speed = Math.hypot(body.vx, body.vy)
    if (speed > CHARACTER_LAB_MAX_SPEED) { body.vx *= CHARACTER_LAB_MAX_SPEED / speed; body.vy *= CHARACTER_LAB_MAX_SPEED / speed }
    body.spin = Math.max(-12, Math.min(12, body.spin))
  }
}
