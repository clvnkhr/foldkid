interface WhiteboardOptions {
  color: () => string
  size: () => number
  onChange: () => void
  onFinish: () => void
}

interface Contact {
  clientX: number
  clientY: number
}

interface Stroke extends Contact {
  point: readonly [number, number] | null
  pointerId?: number
  startX: number
  startY: number
  startedAt: number
  lastTime: number
  paired: boolean
}

const sameStart = (stroke: Stroke, contact: Contact, time: number): boolean =>
  Math.hypot(stroke.startX - contact.clientX, stroke.startY - contact.clientY) <= 1 && Math.abs(stroke.startedAt - time) <= 40

export const attachWhiteboard = (canvas: HTMLCanvasElement, options: WhiteboardOptions): (() => void) => {
  const context = canvas.getContext('2d')
  if (!context) return () => {}
  const strokes = new Map<string, Stroke>()
  const touchPointers = new Set<string>()
  const pointerOwners = new Map<string, string>()
  const ownerDocument = canvas.ownerDocument
  context.lineCap = 'round'
  context.lineJoin = 'round'

  const point = (contact: Contact): readonly [number, number] | null => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || canvas.width <= 0 || canvas.height <= 0 ||
      ![rect.left, rect.top, rect.width, rect.height, contact.clientX, contact.clientY].every(Number.isFinite)) return null
    const scaleX = canvas.offsetWidth > 0 ? rect.width / canvas.offsetWidth : 1
    const scaleY = canvas.offsetHeight > 0 ? rect.height / canvas.offsetHeight : 1
    return [
      (contact.clientX - rect.left - canvas.clientLeft * scaleX) / ((canvas.clientWidth || rect.width) * scaleX) * canvas.width,
      (contact.clientY - rect.top - canvas.clientTop * scaleY) / ((canvas.clientHeight || rect.height) * scaleY) * canvas.height,
    ]
  }

  const segment = (from: readonly [number, number], to: readonly [number, number]): void => {
    context.strokeStyle = options.color()
    context.lineWidth = options.size()
    context.beginPath()
    context.moveTo(...from)
    context.lineTo(...to)
    context.stroke()
    options.onChange()
  }

  const start = (key: string, contact: Contact, time: number, pointerId?: number): boolean => {
    if (strokes.has(key)) return false
    const local = point(contact)
    if (!local) return false
    strokes.set(key, { clientX: contact.clientX, clientY: contact.clientY, point: local, pointerId,
      startX: contact.clientX, startY: contact.clientY, startedAt: time, lastTime: time, paired: false })
    segment(local, [local[0] + 0.01, local[1] + 0.01])
    if (pointerId !== undefined) {
      try { canvas.setPointerCapture(pointerId) } catch { /* Document listeners keep the stroke usable without capture. */ }
    }
    return true
  }

  const move = (key: string, contact: Contact, time: number): boolean => {
    const stroke = strokes.get(key)
    if (!stroke) return false
    if (time < stroke.lastTime) return true
    const local = point(contact)
    if (local) {
      const previous = stroke.point
      if (!previous) segment(local, [local[0] + 0.01, local[1] + 0.01])
      else if (previous[0] !== local[0] || previous[1] !== local[1]) segment(previous, local)
    }
    stroke.point = local
    stroke.clientX = contact.clientX
    stroke.clientY = contact.clientY
    stroke.lastTime = time
    return true
  }

  const releaseCapture = (stroke: Stroke): void => {
    if (stroke.pointerId === undefined) return
    try {
      if (canvas.hasPointerCapture(stroke.pointerId)) canvas.releasePointerCapture(stroke.pointerId)
    } catch { /* A cancelled contact may have already lost capture. */ }
  }

  const finish = (key: string, contact: Contact, time: number, cancelled: boolean): boolean => {
    const stroke = strokes.get(key)
    if (!stroke) return false
    if (!cancelled) move(key, contact, time)
    strokes.delete(key)
    touchPointers.delete(key)
    for (const [pointer, owner] of pointerOwners) if (owner === key) pointerOwners.delete(pointer)
    releaseCapture(stroke)
    if (!cancelled && strokes.size === 0) options.onFinish()
    return true
  }

  const pointerKey = (event: PointerEvent): string => `pointer:${event.pointerId}`
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    const key = pointerKey(event)
    // A TouchEvent constructor does not guarantee a native touch stream.
    // Fingers use document listeners until native events actually arrive.
    if (event.pointerType === 'touch') {
      const native = [...strokes].find(([id, stroke]) => id.startsWith('touch:') && !stroke.paired && sameStart(stroke, event, event.timeStamp))
      if (native) {
        native[1].paired = true
        pointerOwners.set(key, native[0])
        event.preventDefault()
        return
      }
    }
    if (start(key, event, event.timeStamp, event.pointerType === 'touch' ? undefined : event.pointerId)) {
      if (event.pointerType === 'touch') touchPointers.add(key)
      event.preventDefault()
    }
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (move(pointerKey(event), event, event.timeStamp)) event.preventDefault()
  }
  const onPointerFinish = (event: PointerEvent): void => {
    const key = pointerKey(event)
    const owner = pointerOwners.get(key)
    if (owner !== undefined) {
      if (event.type === 'pointercancel') finish(owner, event, event.timeStamp, true)
      else if (event.type === 'pointerup') pointerOwners.delete(key)
      event.preventDefault()
      return
    }
    if (finish(key, event, event.timeStamp, event.type !== 'pointerup')) event.preventDefault()
  }
  const eachTouch = (event: TouchEvent, action: (key: string, touch: Touch) => boolean): void => {
    let handled = false
    for (let index = 0; index < event.changedTouches.length; index++) {
      const touch = typeof event.changedTouches.item === 'function' ? event.changedTouches.item(index) : event.changedTouches[index]
      if (touch && action(`touch:${touch.identifier}`, touch)) handled = true
    }
    if (handled) event.preventDefault()
  }
  const onTouchStart = (event: TouchEvent): void => eachTouch(event, (key, touch) => {
    if (touch.target !== canvas || strokes.has(key)) return false
    const pointer = [...touchPointers].find(candidate => {
      const stroke = strokes.get(candidate)
      return stroke && sameStart(stroke, touch, event.timeStamp)
    })
    if (pointer) {
      const stroke = strokes.get(pointer)!
      strokes.delete(pointer)
      touchPointers.delete(pointer)
      stroke.paired = true
      strokes.set(key, stroke)
      pointerOwners.set(pointer, key)
      return true
    }
    return start(key, touch, event.timeStamp)
  })
  const onTouchMove = (event: TouchEvent): void => eachTouch(event, (key, touch) => move(key, touch, event.timeStamp))
  const onTouchFinish = (event: TouchEvent): void => eachTouch(event, (key, touch) => finish(key, touch, event.timeStamp, event.type === 'touchcancel'))
  const rebaseStrokes = (): void => {
    for (const stroke of strokes.values()) stroke.point = point(stroke)
  }
  const cancelStrokes = (): void => {
    const active = [...strokes.values()]
    strokes.clear()
    touchPointers.clear()
    pointerOwners.clear()
    active.forEach(releaseCapture)
  }
  const onVisibility = (): void => { if (ownerDocument.hidden) cancelStrokes() }
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(rebaseStrokes)
  resizeObserver?.observe(canvas)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('lostpointercapture', onPointerFinish)
  canvas.addEventListener('touchstart', onTouchStart, { passive: false })
  ownerDocument.addEventListener('pointermove', onPointerMove, true)
  ownerDocument.addEventListener('pointerup', onPointerFinish, true)
  ownerDocument.addEventListener('pointercancel', onPointerFinish, true)
  ownerDocument.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
  ownerDocument.addEventListener('touchend', onTouchFinish, { capture: true, passive: false })
  ownerDocument.addEventListener('touchcancel', onTouchFinish, { capture: true, passive: false })
  ownerDocument.addEventListener('scroll', rebaseStrokes, true)
  ownerDocument.addEventListener('visibilitychange', onVisibility)
  ownerDocument.defaultView?.addEventListener('blur', cancelStrokes)

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('lostpointercapture', onPointerFinish)
    canvas.removeEventListener('touchstart', onTouchStart)
    ownerDocument.removeEventListener('pointermove', onPointerMove, true)
    ownerDocument.removeEventListener('pointerup', onPointerFinish, true)
    ownerDocument.removeEventListener('pointercancel', onPointerFinish, true)
    ownerDocument.removeEventListener('touchmove', onTouchMove, true)
    ownerDocument.removeEventListener('touchend', onTouchFinish, true)
    ownerDocument.removeEventListener('touchcancel', onTouchFinish, true)
    ownerDocument.removeEventListener('scroll', rebaseStrokes, true)
    ownerDocument.removeEventListener('visibilitychange', onVisibility)
    ownerDocument.defaultView?.removeEventListener('blur', cancelStrokes)
    resizeObserver?.disconnect()
    cancelStrokes()
  }
}
