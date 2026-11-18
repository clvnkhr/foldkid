import { warmAudio } from '../audio'
import { canonicalCharacter, mergeCharacters, multiJoinPatterns, type CharacterJoinPattern } from './characterLabDomain'
import { CHARACTER_LAB_FIXED_STEP, CHARACTER_LAB_MAX_SPEED, constrainCharacterLabBody, stepCharacterLabPhysics, type CharacterLabBody } from './characterLabPhysics'

export interface CharacterLabRuntimeHandlers {
  readonly collision: (a: number, b: number, x: number, y: number, vx: number, vy: number, angle: number, revision: number) => void
  readonly groupCollision?: (ids: ReadonlyArray<number>, x: number, y: number, vx: number, vy: number, angle: number, revision: number) => void
  readonly tapped: (id: number, revision: number, x: number, y: number, vx: number, vy: number, angle: number) => void
}
interface Body extends CharacterLabBody {
  readonly element: HTMLElement
  readonly originalLeft: string
  readonly originalTop: string
  readonly originalTransform: string
}
interface ClientPoint { readonly clientX: number; readonly clientY: number }
interface ContactGraph {
  readonly key: string
  readonly neighbours: ReadonlyMap<number, ReadonlyArray<Body>>
  readonly clusters: Map<number, ReadonlyArray<Body>>
}
interface Contact {
  readonly body: Body
  readonly revision: number
  readonly startedAt: number
  readonly startX: number
  readonly startY: number
  readonly offsetX: number
  readonly offsetY: number
  readonly touchPointer: boolean
  x: number
  y: number
  time: number
  vx: number
  vy: number
  moved: boolean
  paired: boolean
  captureId?: number
}
const validId = (value: number): boolean => Number.isSafeInteger(value) && value >= 0
const numberAttribute = (element: Element, key: string, fallback: number): number => {
  const raw = element.getAttribute(key)
  if (raw === null || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}
const bounded = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))
const MAX_BODIES = 120

/** Owns transient physics and gestures; entity membership remains in the game model. */
export const createCharacterLabRuntime = (stage: HTMLElement, handlers: CharacterLabRuntimeHandlers): (() => void) => {
  const document = stage.ownerDocument
  const window = document.defaultView
  if (!window) return () => {}
  const now = (): number => window.performance.now()
  let motionQuery: MediaQueryList | undefined
  try { motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') } catch { /* Essential physics remains available without media queries. */ }
  const spinScale = (): number => motionQuery?.matches ? .35 : 1
  const bodies = new Map<number, Body>()
  const contacts = new Map<string, Contact>()
  const nativeOwners = new Map<number, string>()
  const recent = new WeakMap<HTMLElement, number>()
  const pending = new Map<number, number>()
  let revision = -1
  let width = 0
  let height = 0
  let stopped = false
  let frame: number | undefined
  let timeoutFrame = false
  let lastTime = now()
  let accumulator = 0
  let dirtySize = true
  let mutationObserver: MutationObserver | undefined
  let resizeObserver: ResizeObserver | undefined
  let contactGraph: ContactGraph | undefined
  const patternCounts = new WeakMap<CharacterJoinPattern, ReadonlyMap<string, number>>()

  const releaseCapture = (contact: Contact): void => {
    const pointerId = contact.captureId
    contact.captureId = undefined
    if (pointerId === undefined) return
    try { if (contact.body.element.hasPointerCapture(pointerId)) contact.body.element.releasePointerCapture(pointerId) } catch { /* Document listeners cover lost capture. */ }
  }
  const removeContact = (key: string, cancelled: boolean): Contact | undefined => {
    const contact = contacts.get(key)
    if (!contact) return undefined
    contacts.delete(key)
    for (const [id, owner] of nativeOwners) if (owner === key) nativeOwners.delete(id)
    contact.body.held = false
    contact.body.element.classList.remove('character-lab-piece--dragging')
    recent.set(contact.body.element, now())
    if (cancelled) { contact.body.vx = 0; contact.body.vy = 0; contact.body.spin = 0 }
    releaseCapture(contact)
    return contact
  }
  const cancelAll = (): void => { for (const key of [...contacts.keys()]) removeContact(key, true); nativeOwners.clear() }
  const paint = (body: Body): void => {
    body.element.style.transform = `translate3d(${body.x - body.r}px,${body.y - body.r}px,0) rotate(${body.angle}rad)`
  }
  const restoreStyles = (body: Body): void => {
    body.element.style.left = body.originalLeft
    body.element.style.top = body.originalTop
    body.element.style.transform = body.originalTransform
  }
  const measure = (): void => {
    if (!dirtySize) return
    dirtySize = false
    const rect = stage.getBoundingClientRect()
    const nextWidth = Number.isFinite(rect.width) ? Math.max(0, rect.width) : 0
    const nextHeight = Number.isFinite(rect.height) ? Math.max(0, rect.height) : 0
    if (nextWidth <= 0 || nextHeight <= 0) return
    for (const body of bodies.values()) {
      if (width > 0) body.x *= nextWidth / width
      if (height > 0) body.y *= nextHeight / height
      const diameter = body.element.offsetWidth || body.r * 2
      body.r = bounded(diameter / 2, 16, 64)
      constrainCharacterLabBody(body, nextWidth, nextHeight)
    }
    width = nextWidth
    height = nextHeight
  }
  const sync = (): void => {
    if (stopped) return
    contactGraph = undefined
    const nextRevision = numberAttribute(stage, 'data-character-lab-revision', -1)
    if (!validId(nextRevision)) { cancelAll(); bodies.clear(); pending.clear(); return }
    if (nextRevision !== revision) {
      cancelAll()
      for (const body of bodies.values()) restoreStyles(body)
      bodies.clear()
      pending.clear()
      revision = nextRevision
    }
    measure()
    if (width <= 0 || height <= 0) return
    const present = new Set<number>()
    for (const element of stage.querySelectorAll<HTMLElement>('.character-lab-piece[data-character-lab-id]')) {
      const id = numberAttribute(element, 'data-character-lab-id', -1)
      const character = element.getAttribute('data-character-lab-character')
      if (!validId(id) || !character || present.has(id) || present.size >= MAX_BODIES) continue
      present.add(id)
      const old = bodies.get(id)
      if (old?.element === element && old.character === character) continue
      if (old) for (const [key, contact] of contacts) if (contact.body === old) removeContact(key, true)
      const diameter = element.offsetWidth || element.getBoundingClientRect().width || 64
      const body: Body = {
        id, character, element, r: bounded(diameter / 2, 16, 64), held: false,
        originalLeft: old?.element === element ? old.originalLeft : element.style.left,
        originalTop: old?.element === element ? old.originalTop : element.style.top,
        originalTransform: old?.element === element ? old.originalTransform : element.style.transform,
        x: bounded(numberAttribute(element, 'data-x', .5), 0, 1) * width,
        y: bounded(numberAttribute(element, 'data-y', .08), 0, 1) * height,
        vx: bounded(numberAttribute(element, 'data-vx', 0), -CHARACTER_LAB_MAX_SPEED, CHARACTER_LAB_MAX_SPEED),
        vy: bounded(numberAttribute(element, 'data-vy', 0), -CHARACTER_LAB_MAX_SPEED, CHARACTER_LAB_MAX_SPEED),
        angle: numberAttribute(element, 'data-angle', 0) % (Math.PI * 2),
        spin: bounded(numberAttribute(element, 'data-spin', 0), -12, 12) * spinScale(),
        readyAt: now() + bounded(numberAttribute(element, 'data-merge-delay', 0), 0, 5000),
      }
      constrainCharacterLabBody(body, width, height)
      bodies.set(id, body)
      element.style.left = '0px'
      element.style.top = '0px'
      pending.delete(id)
      paint(body)
    }
    for (const [id, body] of bodies) if (!present.has(id)) {
      for (const [key, contact] of contacts) if (contact.body === body) removeContact(key, true)
      restoreStyles(body)
      bodies.delete(id)
      pending.delete(id)
    }
  }
  const pieceAt = (target: EventTarget | null): Body | undefined => {
    const element = target instanceof Element ? target.closest<HTMLElement>('.character-lab-piece[data-character-lab-id]') : null
    if (!element || !stage.contains(element) || element.matches(':disabled, [aria-disabled="true"]')) return undefined
    const body = bodies.get(numberAttribute(element, 'data-character-lab-id', -1))
    return body?.element === element && element.isConnected ? body : undefined
  }
  const local = (point: ClientPoint): { x: number; y: number } | undefined => {
    if (![point.clientX, point.clientY].every(Number.isFinite)) return undefined
    const rect = stage.getBoundingClientRect()
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }
  const ready = (body: Body, time: number): boolean => !pending.has(body.id) && time >= body.readyAt
  const canJoin = (a: Body, b: Body, time: number): boolean => a.id !== b.id && ready(a, time) && ready(b, time)
  const graphFor = (a: Body, ax: number, ay: number, time: number): ContactGraph => {
    const key = ax === a.x && ay === a.y ? 'physical' : `${a.id}:${ax}:${ay}`
    if (contactGraph?.key === key) return contactGraph
    const available = [...bodies.values()].filter(body => ready(body, time))
    const neighbours = new Map(available.map(body => [body.id, [] as Body[]]))
    for (let i = 0; i < available.length; i++) for (let j = i + 1; j < available.length; j++) {
      const first = available[i]!
      const second = available[j]!
      const x = (first === a ? ax : first.x) - (second === a ? ax : second.x)
      const y = (first === a ? ay : first.y) - (second === a ? ay : second.y)
      if (x * x + y * y <= (first.r + second.r + 4) ** 2) {
        neighbours.get(first.id)!.push(second)
        neighbours.get(second.id)!.push(first)
      }
    }
    contactGraph = { key, neighbours, clusters: new Map() }
    return contactGraph
  }
  const joinedGroup = (a: Body, b: Body, ax: number, ay: number, time: number): boolean => {
    if (!handlers.groupCollision) return false
    const patterns = multiJoinPatterns(a.character, b.character)
    if (patterns.length === 0) return false
    const graph = graphFor(a, ax, ay, time)
    let cluster = graph.clusters.get(a.id)
    if (!cluster) {
      const discovered = new Set([a.id])
      const connected = [a]
      for (const body of connected) for (const neighbour of graph.neighbours.get(body.id) ?? []) {
        if (discovered.has(neighbour.id)) continue
        discovered.add(neighbour.id)
        connected.push(neighbour)
      }
      cluster = connected
      for (const body of connected) graph.clusters.set(body.id, cluster)
    }
    const nearby = cluster.filter(body => ready(body, time))
    if (nearby.length < 3 || !nearby.includes(b)) return false
    const counts = new Map<string, number>()
    for (const body of nearby) {
      const character = canonicalCharacter(body.character)
      counts.set(character, (counts.get(character) ?? 0) + 1)
    }
    for (const pattern of patterns) {
      if (pattern.parts.length > nearby.length) continue
      let requiredCounts = patternCounts.get(pattern)
      if (!requiredCounts) {
        const frequencies = new Map<string, number>()
        for (const part of pattern.parts) frequencies.set(part, (frequencies.get(part) ?? 0) + 1)
        requiredCounts = frequencies
        patternCounts.set(pattern, requiredCounts)
      }
      let matches = true
      for (const [part, count] of requiredCounts) if ((counts.get(part) ?? 0) < count) { matches = false; break }
      if (!matches) continue
      const required = new Map(requiredCounts)
      const selected = [a, b]
      const ids = new Set([a.id, b.id])
      for (const body of selected) {
        const character = canonicalCharacter(body.character)
        required.set(character, (required.get(character) ?? 0) - 1)
      }
      while (selected.length < pattern.parts.length) {
        const next = nearby.find(body => !ids.has(body.id) && (required.get(canonicalCharacter(body.character)) ?? 0) > 0 &&
          graph.neighbours.get(body.id)?.some(neighbour => ids.has(neighbour.id)))
        if (!next) break
        ids.add(next.id)
        selected.push(next)
        const character = canonicalCharacter(next.character)
        required.set(character, required.get(character)! - 1)
      }
      if (selected.length !== pattern.parts.length) continue
      for (const body of selected) pending.set(body.id, time + 750)
      const average = (value: (body: Body) => number): number => selected.reduce((sum, body) => sum + value(body), 0) / selected.length
      handlers.groupCollision(selected.map(body => body.id), bounded(average(body => body === a ? ax : body.x) / width, 0, 1),
        bounded(average(body => body === a ? ay : body.y) / height, 0, 1), average(body => body.vx), average(body => body.vy), average(body => body.angle), revision)
      return true
    }
    return false
  }
  const merged = (a: Body, b: Body, ax = a.x, ay = a.y): boolean => {
    const time = now()
    if (width <= 0 || height <= 0 || !canJoin(a, b, time)) return false
    if (joinedGroup(a, b, ax, ay, time)) return true
    if (mergeCharacters(a.character, b.character) === undefined) return false
    pending.set(a.id, time + 750)
    pending.set(b.id, time + 750)
    handlers.collision(a.id, b.id, bounded((ax + b.x) / (2 * width), 0, 1), bounded((ay + b.y) / (2 * height), 0, 1), (a.vx + b.vx) / 2, (a.vy + b.vy) / 2, (a.angle + b.angle) / 2, revision)
    return true
  }
  const sweepDragged = (body: Body, fromX: number, fromY: number): void => {
    const dx = body.x - fromX
    const dy = body.y - fromY
    const length = dx * dx + dy * dy
    const hits: Array<{ body: Body; t: number; x: number; y: number }> = []
    const time = now()
    contactGraph = undefined
    for (const other of bodies.values()) {
      if (!canJoin(body, other, time) || mergeCharacters(body.character, other.character) === undefined &&
        (!handlers.groupCollision || multiJoinPatterns(body.character, other.character).length === 0)) continue
      const t = length === 0 ? 0 : bounded(((other.x - fromX) * dx + (other.y - fromY) * dy) / length, 0, 1)
      const x = fromX + t * dx
      const y = fromY + t * dy
      if ((other.x - x) ** 2 + (other.y - y) ** 2 <= (body.r + other.r) ** 2) hits.push({ body: other, t, x, y })
    }
    hits.sort((a, b) => a.t - b.t)
    for (const hit of hits) if (merged(body, hit.body, hit.x, hit.y)) break
  }
  const sameStart = (contact: Contact, body: Body, point: ClientPoint, time: number): boolean => contact.body === body &&
    Math.abs(contact.startedAt - time) <= 40 && Math.min(Math.hypot(contact.startX - point.clientX, contact.startY - point.clientY), Math.hypot(contact.x - point.clientX, contact.y - point.clientY)) <= 1
  const start = (key: string, point: ClientPoint, target: EventTarget | null, time: number, touchPointer: boolean, captureId?: number): boolean => {
    sync()
    const body = pieceAt(target)
    const position = local(point)
    if (!body || !position || contacts.has(key) || body.held || !Number.isFinite(time) || width <= 0 || height <= 0) return false
    const contact: Contact = {
      body, revision, startedAt: time, startX: point.clientX, startY: point.clientY,
      x: point.clientX, y: point.clientY, offsetX: position.x - body.x, offsetY: position.y - body.y,
      time, vx: 0, vy: 0, moved: false, paired: false, touchPointer,
    }
    body.held = true
    body.vx = 0
    body.vy = 0
    body.spin = 0
    body.element.classList.add('character-lab-piece--dragging')
    contacts.set(key, contact)
    if (captureId !== undefined) try { body.element.setPointerCapture(captureId); contact.captureId = captureId } catch { /* Document listeners keep pen/mouse drags alive. */ }
    return true
  }
  const move = (key: string, point: ClientPoint, time: number, sample = true): boolean => {
    sync()
    const contact = contacts.get(key)
    const position = local(point)
    if (!contact || !position || !Number.isFinite(time) || time < contact.time || contact.revision !== revision) return false
    const body = contact.body
    const fromX = body.x
    const fromY = body.y
    body.x = position.x - contact.offsetX
    body.y = position.y - contact.offsetY
    constrainCharacterLabBody(body, width, height)
    contact.moved ||= Math.hypot(point.clientX - contact.startX, point.clientY - contact.startY) > 10
    const elapsed = time - contact.time
    if (sample && elapsed > 0) {
      const sampleX = (body.x - fromX) * 1000 / elapsed
      const sampleY = (body.y - fromY) * 1000 / elapsed
      contact.vx = contact.vx * .3 + sampleX * .7
      contact.vy = contact.vy * .3 + sampleY * .7
      const speed = Math.hypot(contact.vx, contact.vy)
      if (speed > CHARACTER_LAB_MAX_SPEED) { contact.vx *= CHARACTER_LAB_MAX_SPEED / speed; contact.vy *= CHARACTER_LAB_MAX_SPEED / speed }
      body.vx = contact.vx
      body.vy = contact.vy
      body.spin = bounded((contact.offsetX * body.vy - contact.offsetY * body.vx) / (body.r * body.r) * .16, -9, 9) * spinScale()
      body.angle += ((body.x - fromX) * -contact.offsetY + (body.y - fromY) * contact.offsetX) / (body.r * body.r) * .12
      contact.time = time
    }
    contact.x = point.clientX
    contact.y = point.clientY
    sweepDragged(body, fromX, fromY)
    paint(body)
    return true
  }
  const tap = (body: Body): void => {
    if (width <= 0 || height <= 0 || pending.has(body.id)) return
    handlers.tapped(body.id, revision, bounded(body.x / width, 0, 1), bounded(body.y / height, 0, 1), body.vx, body.vy, body.angle)
  }
  const finish = (key: string, point: ClientPoint, time: number, cancelled: boolean): boolean => {
    sync()
    const contact = contacts.get(key)
    if (!contact) return false
    if (!cancelled) {
      move(key, point, time, false)
      const scale = Math.exp(-Math.max(0, time - contact.time - 32) / 90)
      contact.body.vx = contact.vx * scale
      contact.body.vy = contact.vy * scale
      try { warmAudio() } catch { /* Physics and splitting do not require audio. */ }
    }
    removeContact(key, cancelled)
    if (!cancelled && !contact.moved && contact.revision === revision && bodies.get(contact.body.id) === contact.body) tap(contact.body)
    return true
  }
  const pointerKey = (id: number): string => `pointer:${id}`
  const down = (event: PointerEvent): void => {
    if (event.button !== 0 || !validId(event.pointerId) || nativeOwners.has(event.pointerId)) return
    sync()
    const body = pieceAt(event.target)
    if (event.pointerType === 'touch' && body) {
      const native = [...contacts].find(([key, contact]) => key.startsWith('touch:') && !contact.paired && sameStart(contact, body, event, event.timeStamp))
      if (native) { native[1].paired = true; nativeOwners.set(event.pointerId, native[0]); event.preventDefault(); return }
    }
    if (start(pointerKey(event.pointerId), event, event.target, event.timeStamp, event.pointerType === 'touch', event.pointerType === 'touch' ? undefined : event.pointerId)) event.preventDefault()
  }
  const pointerMove = (event: PointerEvent): void => {
    if (nativeOwners.has(event.pointerId)) { event.preventDefault(); return }
    const key = pointerKey(event.pointerId)
    const contact = contacts.get(key)
    if (contact && !contact.touchPointer && (event.buttons & 1) === 0) { removeContact(key, true); return }
    if (move(key, event, event.timeStamp)) event.preventDefault()
  }
  const pointerFinish = (event: PointerEvent): void => {
    const owner = nativeOwners.get(event.pointerId)
    if (owner !== undefined) {
      if (event.type === 'pointercancel') finish(owner, event, event.timeStamp, true)
      else if (event.type === 'pointerup') nativeOwners.delete(event.pointerId)
      event.preventDefault()
      return
    }
    const key = pointerKey(event.pointerId)
    const contact = contacts.get(key)
    if (event.type === 'lostpointercapture' && contact?.touchPointer) return
    if (contact && !contact.touchPointer && event.type === 'pointerup' && (event.button !== 0 || (event.buttons & 1) !== 0)) return
    if (finish(key, event, event.timeStamp, event.type !== 'pointerup')) event.preventDefault()
  }
  const eachTouch = (event: TouchEvent, action: (key: string, touch: Touch) => boolean): void => {
    let handled = false
    const touches = event.changedTouches
    for (let index = 0; index < (touches?.length ?? 0); index++) {
      const touch = typeof touches.item === 'function' ? touches.item(index) : touches[index]
      if (touch && Number.isSafeInteger(touch.identifier) && action(`touch:${touch.identifier}`, touch)) handled = true
    }
    if (handled) event.preventDefault()
  }
  const touchStart = (event: TouchEvent): void => eachTouch(event, (key, point) => {
    sync()
    if (contacts.has(key)) return false
    const body = pieceAt(point.target)
    const pointer = body && [...contacts].find(([key, contact]) => key.startsWith('pointer:') && contact.touchPointer && !contact.paired && sameStart(contact, body, point, event.timeStamp))
    if (pointer) {
      contacts.delete(pointer[0])
      pointer[1].paired = true
      contacts.set(key, pointer[1])
      nativeOwners.set(Number(pointer[0].slice('pointer:'.length)), key)
      releaseCapture(pointer[1])
      return true
    }
    return start(key, point, point.target, event.timeStamp, false)
  })
  const touchMove = (event: TouchEvent): void => eachTouch(event, (key, point) => move(key, point, event.timeStamp))
  const touchFinish = (event: TouchEvent): void => eachTouch(event, (key, point) => finish(key, point, event.timeStamp, event.type !== 'touchend'))
  const click = (event: MouseEvent): void => {
    sync()
    const body = pieceAt(event.target)
    if (!body) return
    const releasedAt = recent.get(body.element)
    if (event.detail !== 0 && (releasedAt !== undefined && now() - releasedAt < 900 || [...contacts.values()].some(contact => contact.body === body))) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    try { warmAudio() } catch { /* Native keyboard activation remains usable without audio. */ }
    event.preventDefault()
    event.stopImmediatePropagation()
    tap(body)
  }
  const cancelFrame = (): void => {
    if (frame === undefined) return
    if (timeoutFrame) window.clearTimeout(frame)
    else window.cancelAnimationFrame?.(frame)
    frame = undefined
  }
  const schedule = (): void => {
    if (stopped || document.hidden || frame !== undefined) return
    if (typeof window.requestAnimationFrame === 'function') {
      timeoutFrame = false
      frame = window.requestAnimationFrame(loop)
    } else {
      timeoutFrame = true
      frame = window.setTimeout(() => loop(now()), 16)
    }
  }
  const loop = (time: number): void => {
    frame = undefined
    if (stopped || document.hidden) return
    if (!mutationObserver) sync()
    if (width <= 0 || height <= 0) { dirtySize = true; sync() }
    measure()
    for (const [id, until] of pending) if (time >= until) pending.delete(id)
    accumulator = Math.min(accumulator + Math.max(0, Math.min(.08, (time - lastTime) / 1000)), CHARACTER_LAB_FIXED_STEP * 8)
    lastTime = time
    const active = [...bodies.values()]
    while (accumulator >= CHARACTER_LAB_FIXED_STEP) {
      contactGraph = undefined
      if (width > 0 && height > 0) stepCharacterLabPhysics(active, width, height, CHARACTER_LAB_FIXED_STEP, (a, b) => merged(a as Body, b as Body))
      accumulator -= CHARACTER_LAB_FIXED_STEP
    }
    for (const body of active) paint(body)
    schedule()
  }
  const resized = (): void => { dirtySize = true }
  const visibility = (): void => {
    cancelAll()
    lastTime = now()
    accumulator = 0
    if (document.hidden) cancelFrame()
    else schedule()
  }
  // Build the shared catalogue index on entry, before the first live contact needs it.
  if (handlers.groupCollision) multiJoinPatterns('口', '口')
  sync()
  try { mutationObserver = new MutationObserver(sync); mutationObserver.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-character-lab-revision', 'data-character-lab-id', 'data-character-lab-character', 'data-x', 'data-y', 'data-vx', 'data-vy', 'data-angle', 'data-spin', 'data-merge-delay'] }) } catch { mutationObserver?.disconnect(); mutationObserver = undefined }
  try { resizeObserver = new ResizeObserver(resized); resizeObserver.observe(stage) } catch { resizeObserver?.disconnect(); resizeObserver = undefined }
  stage.addEventListener('pointerdown', down, { passive: false })
  stage.addEventListener('lostpointercapture', pointerFinish)
  stage.addEventListener('touchstart', touchStart, { passive: false })
  stage.addEventListener('click', click, { capture: true })
  document.addEventListener('pointermove', pointerMove, { capture: true, passive: false })
  document.addEventListener('pointerup', pointerFinish, { capture: true, passive: false })
  document.addEventListener('pointercancel', pointerFinish, { capture: true, passive: false })
  document.addEventListener('touchmove', touchMove, { capture: true, passive: false })
  document.addEventListener('touchend', touchFinish, { capture: true, passive: false })
  document.addEventListener('touchcancel', touchFinish, { capture: true, passive: false })
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('blur', cancelAll)
  window.addEventListener('resize', resized)
  schedule()
  return () => {
    if (stopped) return
    stopped = true
    cancelFrame()
    cancelAll()
    mutationObserver?.disconnect()
    resizeObserver?.disconnect()
    stage.removeEventListener('pointerdown', down)
    stage.removeEventListener('lostpointercapture', pointerFinish)
    stage.removeEventListener('touchstart', touchStart)
    stage.removeEventListener('click', click, true)
    document.removeEventListener('pointermove', pointerMove, true)
    document.removeEventListener('pointerup', pointerFinish, true)
    document.removeEventListener('pointercancel', pointerFinish, true)
    document.removeEventListener('touchmove', touchMove, true)
    document.removeEventListener('touchend', touchFinish, true)
    document.removeEventListener('touchcancel', touchFinish, true)
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('blur', cancelAll)
    window.removeEventListener('resize', resized)
    for (const body of bodies.values()) restoreStyles(body)
    bodies.clear()
    pending.clear()
  }
}
