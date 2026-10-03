import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Effect, Fiber, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Draw from './draw'
import { attachWhiteboard } from './drawWhiteboard'

const drawStyles = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/draw.css'), 'utf8')

const predictions = (...values: string[]) =>
  values.map((value, index) => ({ value, score: 1 - index * 0.1 }))

const inkImage = (width: number, height: number, rects: ReadonlyArray<readonly [number, number, number, number]>): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (const [minX, minY, maxX, maxY] of rects) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        data[(y * width + x) * 4 + 3] = 255
      }
    }
  }
  return data
}

const inkWhere = (width: number, height: number, predicate: (x: number, y: number) => boolean): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (predicate(x, y)) data[(y * width + x) * 4 + 3] = 255
    }
  }
  return data
}

const slantedProjection = (x: number, y: number, degrees: number, centerY: number): number =>
  Math.round(x - Math.tan(degrees * Math.PI / 180) * (y - centerY))

const recognized = (
  model: Draw.Model,
  values: string[],
  overrides: Partial<Parameters<typeof Draw.BoardRecognized>[0]> = {},
) =>
  Draw.BoardRecognized({
    target: model.target,
    mode: model.recognitionMode,
    value: values[0] ?? '',
    score: 0.9,
    predictions: predictions(...values),
    debugImages: [{ label: 'debug', src: 'data:image/png;base64,', kind: 'image' }],
    boardImage: 'data:image/png;base64,board',
    ...overrides,
  })

describe('multitouch whiteboard', () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    cleanups.splice(0).reverse().forEach(cleanup => cleanup())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const whiteboard = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 100
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100)
    const segments: number[][] = []
    let start: number[] = []
    let end: number[] = []
    const context = {
      beginPath: vi.fn(),
      moveTo: vi.fn((x: number, y: number) => { start = [x, y] }),
      lineTo: vi.fn((x: number, y: number) => { end = [x, y] }),
      stroke: vi.fn(() => { segments.push([...start, ...end]) }),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,snapshot')
    const captures = new Set<number>()
    canvas.setPointerCapture = vi.fn(id => { captures.add(id) })
    canvas.hasPointerCapture = id => captures.has(id)
    canvas.releasePointerCapture = vi.fn(id => { captures.delete(id) })
    const onChange = vi.fn()
    const onFinish = vi.fn()
    const dispose = attachWhiteboard(canvas, { color: () => '#123456', size: () => 12, onChange, onFinish })
    document.body.append(canvas)
    cleanups.push(() => { dispose(); canvas.remove() })
    return { canvas, context, captures, segments, onChange, onFinish, dispose }
  }

  const pointer = (target: EventTarget, type: string, id: number, x: number, y: number, pointerType = 'pen', button = 0, timeStamp?: number): Event => {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: x, clientY: y, button })
    // Native event coordinates are getter properties, not spreadable records.
    Object.defineProperties(event, {
      clientX: { get: () => x, enumerable: false }, clientY: { get: () => y, enumerable: false },
    })
    if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    target.dispatchEvent(event)
    return event
  }

  const touch = (target: EventTarget, type: string, contacts: readonly { id: number; x: number; y: number; target: Element }[], timeStamp?: number, array = false): Event => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    const changed = contacts.map(contact => ({ identifier: contact.id, clientX: contact.x, clientY: contact.y, target: contact.target }))
    Object.defineProperty(event, 'changedTouches', { value: array ? changed : { length: changed.length, item: (index: number) => changed[index] ?? null } })
    if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    target.dispatchEvent(event)
    return event
  }

  it('keeps interleaved pointers in separate paths and finishes only after the last release', () => {
    const { canvas, context, segments, captures, onFinish } = whiteboard()
    pointer(canvas, 'pointerdown', 1, 10, 10)
    pointer(canvas, 'pointerdown', 2, 90, 70)
    pointer(document, 'pointermove', 1, 20, 15)
    pointer(document, 'pointermove', 2, 80, 65)
    pointer(document, 'pointerup', 1, 25, 20)
    expect(onFinish).not.toHaveBeenCalled()
    pointer(document, 'pointermove', 2, 70, 60)
    pointer(document, 'pointerup', 2, 65, 55)

    expect(segments.slice(2)).toEqual([
      [10, 10, 20, 15], [90, 70, 80, 65], [20, 15, 25, 20],
      [80, 65, 70, 60], [70, 60, 65, expect.closeTo(55)],
    ])
    expect(context.beginPath).toHaveBeenCalledTimes(segments.length)
    expect(context.strokeStyle).toBe('#123456')
    expect(context.lineWidth).toBe(12)
    expect(captures.size).toBe(0)
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('draws every changed native touch and ignores duplicate touch pointers and unrelated fingers', () => {
    const { canvas, segments, captures, onFinish } = whiteboard()
    const contacts = [
      { id: 3, x: 10, y: 10, target: canvas },
      { id: 4, x: 90, y: 70, target: canvas },
      { id: 5, x: 180, y: 90, target: document.body },
    ]
    pointer(canvas, 'pointerdown', 3, 10, 10, 'touch')
    expect(segments).toHaveLength(1)
    expect(touch(canvas, 'touchstart', contacts).defaultPrevented).toBe(true)
    expect(segments).toHaveLength(2)
    expect(captures.size).toBe(0)
    touch(document, 'touchmove', contacts.map(contact => ({ ...contact, x: contact.x + 10 })))
    touch(document, 'touchend', [{ ...contacts[0]!, x: 20 }])
    expect(onFinish).not.toHaveBeenCalled()
    touch(document, 'touchmove', [{ ...contacts[1]!, x: 70 }])
    touch(document, 'touchend', [{ ...contacts[1]!, x: 70 }])

    expect(segments.slice(2)).toEqual([[10, 10, 20, 10], [90, 70, 100, 70], [100, 70, 70, 70]])
    expect(onFinish).toHaveBeenCalledOnce()
    expect(touch(document, 'touchmove', [contacts[2]!]).defaultPrevented).toBe(false)
  })

  it.each([true, false])('supports touch pointers without native events when TouchEvent exists: %s', (hasConstructor) => {
    if (!hasConstructor) vi.stubGlobal('TouchEvent', undefined)
    const { canvas, segments, onFinish } = whiteboard()
    pointer(canvas, 'pointerdown', 1, 10, 10, 'touch')
    pointer(canvas, 'pointerdown', 2, 90, 70, 'touch')
    pointer(document, 'pointermove', 1, 20, 20, 'touch')
    pointer(document, 'pointermove', 2, 80, 60, 'touch')
    pointer(document, 'pointerup', 1, 20, 20, 'touch')
    pointer(document, 'pointerup', 2, 80, 60, 'touch')

    expect(segments.slice(2)).toEqual([[10, 10, 20, 20], [90, 70, 80, 60]])
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('adopts touch pointers without duplicating ink or interrupting a concurrent pen stroke', () => {
    const { canvas, segments, captures, onFinish } = whiteboard()
    pointer(canvas, 'pointerdown', 9, 150, 80)
    pointer(canvas, 'pointerdown', 1, 10, 10, 'touch')
    pointer(canvas, 'pointerdown', 2, 90, 70, 'touch')
    touch(canvas, 'touchstart', [{ id: 11, x: 10, y: 10, target: canvas }, { id: 12, x: 90, y: 70, target: canvas }])
    expect(segments).toHaveLength(3)
    expect([...captures]).toEqual([9])
    pointer(document, 'pointermove', 1, 20, 20, 'touch')
    pointer(document, 'pointerup', 2, 80, 60, 'touch')
    expect(segments).toHaveLength(3)
    touch(document, 'touchmove', [{ id: 11, x: 20, y: 20, target: canvas }, { id: 12, x: 80, y: 60, target: canvas }])
    pointer(document, 'pointermove', 9, 160, 90)
    touch(document, 'touchend', [{ id: 11, x: 20, y: 20, target: canvas }, { id: 12, x: 80, y: 60, target: canvas }])
    expect(onFinish).not.toHaveBeenCalled()
    pointer(document, 'pointerup', 9, 160, 90)

    expect(segments.slice(3)).toEqual([[10, 10, 20, 20], [90, 70, 80, 60], [150, 80, 160, 90]])
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('allows unmatched touch pointers to finish after another contact switches to native events', () => {
    const { canvas, segments, onFinish } = whiteboard()
    pointer(canvas, 'pointerdown', 1, 10, 10, 'touch')
    pointer(canvas, 'pointerdown', 2, 90, 70, 'touch')
    touch(canvas, 'touchstart', [{ id: 11, x: 10, y: 10, target: canvas }])
    touch(document, 'touchend', [{ id: 11, x: 20, y: 20, target: canvas }])
    expect(onFinish).not.toHaveBeenCalled()
    pointer(document, 'pointermove', 2, 80, 60, 'touch')
    pointer(document, 'pointerup', 2, 80, 60, 'touch')

    expect(segments.slice(2)).toEqual([[10, 10, 20, 20], [90, 70, 80, 60]])
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('accepts a pointer-only finger after another finger starts a native touch stream', () => {
    const { canvas, segments, onFinish } = whiteboard()
    touch(canvas, 'touchstart', [{ id: 11, x: 10, y: 10, target: canvas }])
    pointer(canvas, 'pointerdown', 2, 90, 70, 'touch')
    touch(document, 'touchend', [{ id: 11, x: 20, y: 20, target: canvas }])
    expect(onFinish).not.toHaveBeenCalled()
    pointer(document, 'pointermove', 2, 80, 60, 'touch')
    pointer(document, 'pointerup', 2, 80, 60, 'touch')

    expect(segments.slice(2)).toEqual([[10, 10, 20, 20], [90, 70, 80, 60]])
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it.each(['touchend', 'touchcancel'])('pairs native-first events without duplicate strokes on %s', end => {
    const { canvas, segments, onFinish } = whiteboard()
    touch(canvas, 'touchstart', [{ id: 11, x: 10, y: 10, target: canvas }], 100, true)
    pointer(canvas, 'pointerdown', 1, 10, 10, 'touch', 0, 101)
    pointer(document, 'pointermove', 1, 90, 70, 'touch', 0, 102)
    touch(document, 'touchmove', [{ id: 11, x: 20, y: 20, target: canvas }], 103, true)
    touch(document, end, [{ id: 11, x: 30, y: 30, target: canvas }], 104, true)
    pointer(document, 'pointerup', 1, 90, 70, 'touch', 0, 105)
    expect(segments).toEqual(end === 'touchend'
      ? [[10, 10, 10.01, 10.01], [10, 10, 20, 20], [20, 20, 30, 30]]
      : [[10, 10, 10.01, 10.01], [10, 10, 20, 20]])
    expect(onFinish).toHaveBeenCalledTimes(end === 'touchend' ? 1 : 0)
  })

  it('keeps later coincident pointers independent and ignores older native moves during adoption', () => {
    const { canvas, segments, onFinish } = whiteboard()
    touch(canvas, 'touchstart', [{ id: 11, x: 10, y: 10, target: canvas }], 100)
    pointer(canvas, 'pointerdown', 1, 10, 10, 'touch', 0, 200)
    pointer(document, 'pointermove', 1, 20, 20, 'touch', 0, 210)
    touch(document, 'touchend', [{ id: 11, x: 10, y: 10, target: canvas }], 220)
    expect(onFinish).not.toHaveBeenCalled()
    pointer(document, 'pointerup', 1, 20, 20, 'touch', 0, 230)
    expect(onFinish).toHaveBeenCalledOnce()
    expect(segments).toHaveLength(3)

    pointer(canvas, 'pointerdown', 2, 50, 50, 'touch', 0, 300)
    pointer(document, 'pointermove', 2, 60, 60, 'touch', 0, 320)
    touch(canvas, 'touchstart', [{ id: 12, x: 50, y: 50, target: canvas }], 301)
    touch(document, 'touchmove', [{ id: 12, x: 55, y: 55, target: canvas }], 310)
    touch(document, 'touchend', [{ id: 12, x: 70, y: 70, target: canvas }], 330)
    expect(segments.slice(3)).toEqual([[50, 50, 50.01, 50.01], [50, 50, 60, 60], [60, 60, 70, 70]])
    expect(onFinish).toHaveBeenCalledTimes(2)
  })

  it.each([true, false])('cancels native owners through their pointer alias and binds each native start once (native first: %s)', nativeFirst => {
    const { canvas, segments, onFinish } = whiteboard()
    const contact = { id: 11, x: 10, y: 10, target: canvas }
    if (nativeFirst) touch(canvas, 'touchstart', [contact], 100)
    pointer(canvas, 'pointerdown', 1, 10, 10, 'touch', 0, 101)
    if (!nativeFirst) touch(canvas, 'touchstart', [contact], 120)
    pointer(document, 'pointercancel', 1, 20, 20, 'touch', 0, 125)
    touch(document, 'touchend', [{ ...contact, x: 30, y: 30 }], 126)
    expect(segments).toHaveLength(1)
    expect(onFinish).not.toHaveBeenCalled()

    touch(canvas, 'touchstart', [{ ...contact, id: 12 }], 200)
    pointer(canvas, 'pointerdown', 2, 10, 10, 'touch', 0, 201)
    pointer(document, 'pointerup', 2, 10, 10, 'touch', 0, 202)
    pointer(canvas, 'lostpointercapture', 2, 10, 10, 'touch', 0, 203)
    pointer(canvas, 'pointerdown', 3, 10, 10, 'touch', 0, 204)
    expect(segments).toHaveLength(3)
    touch(document, 'touchend', [{ ...contact, id: 12 }], 205)
    expect(onFinish).not.toHaveBeenCalled()
    pointer(document, 'pointerup', 3, 20, 20, 'touch', 0, 206)
    expect(onFinish).toHaveBeenCalledOnce()
    expect(segments.at(-1)).toEqual([10, 10, 20, 20])
  })

  it('cancels only the affected contact and never recognizes a cancelled final release', () => {
    const { canvas, segments, onFinish } = whiteboard()
    pointer(canvas, 'pointerdown', 1, 10, 10)
    pointer(canvas, 'pointerdown', 2, 90, 70)
    pointer(document, 'pointercancel', 1, 150, 80)
    pointer(document, 'pointermove', 1, 160, 90)
    pointer(document, 'pointermove', 2, 80, 60)
    pointer(canvas, 'lostpointercapture', 2, 0, 0)
    pointer(document, 'pointerup', 2, 40, 40)

    expect(segments.slice(2)).toEqual([[90, 70, 80, 60]])
    expect(onFinish).not.toHaveBeenCalled()
    touch(canvas, 'touchstart', [{ id: 3, x: 10, y: 10, target: canvas }])
    touch(document, 'touchcancel', [{ id: 3, x: 150, y: 90, target: canvas }])
    expect(segments).toHaveLength(4)
    expect(onFinish).not.toHaveBeenCalled()
  })

  it('keeps drawing outside the board if capture fails and ignores secondary mouse and pen buttons', () => {
    const { canvas, segments, onFinish } = whiteboard()
    canvas.setPointerCapture = () => { throw new Error('Capture unavailable') }
    canvas.releasePointerCapture = () => { throw new Error('Already released') }
    pointer(canvas, 'pointerdown', 9, 10, 10, 'mouse', 2)
    pointer(canvas, 'pointerdown', 10, 10, 10, 'pen', 1)
    pointer(canvas, 'pointerdown', 11, 10, 10, 'pen', 2)
    expect(segments).toHaveLength(0)
    pointer(canvas, 'pointerdown', 1, 10, 10, 'mouse')
    pointer(document, 'pointermove', 1, 220, 10, 'mouse')
    pointer(document, 'pointerup', 1, 230, 10, 'mouse')
    expect(segments.slice(1)).toEqual([[10, 10, expect.closeTo(220), 10], [expect.closeTo(220), 10, expect.closeTo(230), 10]])
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('completes pointer and native touch strokes before child handlers stop propagation', () => {
    const { canvas, captures, segments, onFinish } = whiteboard()
    const stop = (event: Event): void => { event.stopPropagation() }
    canvas.addEventListener('pointermove', stop)
    canvas.addEventListener('pointerup', stop)
    canvas.addEventListener('touchmove', stop)
    canvas.addEventListener('touchend', stop)
    pointer(canvas, 'pointerdown', 1, 10, 10)
    pointer(canvas, 'pointermove', 1, 20, 20)
    pointer(canvas, 'pointerup', 1, 20, 20)
    touch(canvas, 'touchstart', [{ id: 11, x: 90, y: 70, target: canvas }])
    touch(canvas, 'touchmove', [{ id: 11, x: 80, y: 60, target: canvas }])
    touch(canvas, 'touchend', [{ id: 11, x: 80, y: 60, target: canvas }])
    expect(captures.size).toBe(0)
    expect(segments).toEqual([[10, 10, 10.01, 10.01], [10, 10, 20, 20], [90, 70, 90.01, 70.01], [90, 70, 80, 60]])
    expect(onFinish).toHaveBeenCalledTimes(2)
  })

  it('rebases every active stroke after resize without drawing a connecting jump', () => {
    let resized: (() => void) | undefined
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized = callback }
      observe() {}
      disconnect = disconnect
    })
    const { canvas, segments, dispose } = whiteboard()
    pointer(canvas, 'pointerdown', 1, 20, 20)
    pointer(canvas, 'pointerdown', 2, 100, 60)
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 400, 200)
    resized!()
    pointer(document, 'pointermove', 1, 40, 40)
    pointer(document, 'pointermove', 2, 120, 80)

    expect(segments.slice(2)).toEqual([[10, 10, 20, 20], [50, 30, 60, 40]])
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
    resized!()
    pointer(document, 'pointermove', 1, 60, 60)
    expect(segments).toHaveLength(4)
    dispose()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('releases captures and removes all listeners on cleanup', () => {
    const { canvas, segments, captures, dispose, onFinish } = whiteboard()
    pointer(canvas, 'pointerdown', 1, 10, 10)
    pointer(canvas, 'pointerdown', 2, 90, 70)
    dispose()
    expect(captures.size).toBe(0)
    pointer(document, 'pointermove', 1, 20, 20)
    pointer(document, 'pointerup', 2, 80, 60)
    pointer(canvas, 'pointerdown', 3, 50, 50)
    touch(canvas, 'touchstart', [{ id: 4, x: 50, y: 50, target: canvas }])
    expect(segments).toHaveLength(2)
    expect(onFinish).not.toHaveBeenCalled()
  })

  it.each(['blur', 'hidden'])('cancels every active contact without recognition when interrupted by %s', interruption => {
    const { canvas, segments, captures, onFinish } = whiteboard()
    pointer(canvas, 'pointerdown', 1, 10, 10)
    touch(canvas, 'touchstart', [{ id: 2, x: 90, y: 70, target: canvas }])
    expect(captures.size).toBe(1)
    if (interruption === 'blur') window.dispatchEvent(new Event('blur'))
    else {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
      document.dispatchEvent(new Event('visibilitychange'))
    }
    expect(captures.size).toBe(0)
    pointer(document, 'pointermove', 1, 20, 20)
    pointer(document, 'pointerup', 1, 30, 30)
    touch(document, 'touchmove', [{ id: 2, x: 80, y: 60, target: canvas }])
    touch(document, 'touchend', [{ id: 2, x: 70, y: 50, target: canvas }])
    expect(segments).toHaveLength(2)
    expect(onFinish).not.toHaveBeenCalled()
    pointer(canvas, 'pointerdown', 3, 40, 40)
    pointer(document, 'pointerup', 3, 40, 40)
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('maps touches to the drawing surface inside the board border', () => {
    const { canvas, segments } = whiteboard()
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 220, 120)
    Object.defineProperties(canvas, {
      clientLeft: { value: 10 }, clientTop: { value: 10 },
      clientWidth: { value: 200 }, clientHeight: { value: 100 },
      offsetWidth: { value: 220 }, offsetHeight: { value: 120 },
    })
    pointer(canvas, 'pointerdown', 1, 10, 10)
    pointer(document, 'pointermove', 1, 210, 110)

    expect(segments[0]).toEqual([0, 0, 0.01, 0.01])
    expect(segments[1]).toEqual([0, 0, 200, 100])
  })

  it('does nothing when the drawing API or board geometry is unavailable', () => {
    const { canvas, segments, dispose, onChange, onFinish } = whiteboard()
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
    pointer(canvas, 'pointerdown', 1, 20, 20)
    expect(segments).toHaveLength(0)
    dispose()
    vi.mocked(canvas.getContext).mockReturnValue(null)
    const cleanup = attachWhiteboard(canvas, { color: () => '#000', size: () => 10, onChange, onFinish })
    expect(() => cleanup()).not.toThrow()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('recognizes a snapshot after all fingers release and discards it when new ink arrives', async () => {
    const { canvas, dispose } = whiteboard()
    dispose()
    canvas.dataset.freeMode = 'true'
    const pending: ((value: { value: string; score: number; predictions: { value: string; score: number }[]; debugImages: [] }) => void)[] = []
    const recognize = vi.fn((_snapshot: HTMLCanvasElement, _mode: Draw.RecognitionMode, _targetLength?: number) => new Promise<{ value: string; score: number; predictions: { value: string; score: number }[]; debugImages: [] }>(resolve => pending.push(resolve)))
    const messages: Draw.Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(Draw.__drawTest.mountWhiteboard('A', recognize)(canvas), message => Effect.sync(() => { messages.push(message) })))
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      touch(canvas, 'touchstart', [{ id: 1, x: 10, y: 10, target: canvas }, { id: 2, x: 90, y: 70, target: canvas }])
      touch(document, 'touchend', [{ id: 1, x: 10, y: 10, target: canvas }])
      expect(recognize).not.toHaveBeenCalled()
      touch(document, 'touchend', [{ id: 2, x: 90, y: 70, target: canvas }])
      expect(recognize).toHaveBeenCalledOnce()
      expect(recognize.mock.calls[0]?.[0]).not.toBe(canvas)
      touch(canvas, 'touchstart', [{ id: 3, x: 40, y: 40, target: canvas }])
      pending[0]!({ value: 'old', score: 1, predictions: [], debugImages: [] })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages).toEqual([])
      touch(document, 'touchend', [{ id: 3, x: 40, y: 40, target: canvas }])
      pending[1]!({ value: 'new', score: 1, predictions: [], debugImages: [] })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages).toEqual([Draw.BoardRecognized({ target: 'A', mode: 'model', value: 'new', score: 1, predictions: [], debugImages: [], boardImage: 'data:image/png;base64,snapshot' })])
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
    }
  })

  it('drops recognition after a mode change or unmount and safely reports recognition failure', async () => {
    const { canvas, dispose } = whiteboard()
    dispose()
    canvas.dataset.freeMode = 'true'
    const pending: { resolve: (value: null) => void; reject: (reason: Error) => void }[] = []
    const recognize = () => new Promise<null>((resolve, reject) => { pending.push({ resolve, reject }) })
    const messages: Draw.Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(Draw.__drawTest.mountWhiteboard('A', recognize)(canvas), message => Effect.sync(() => { messages.push(message) })))
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      pointer(canvas, 'pointerdown', 1, 10, 10)
      pointer(document, 'pointerup', 1, 10, 10)
      canvas.dataset.recognitionMode = 'template'
      pending[0]!.reject(new Error('Old mode failed'))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages).toEqual([])
      pointer(canvas, 'pointerdown', 2, 20, 20)
      pointer(document, 'pointerup', 2, 20, 20)
      pending[1]!.reject(new Error('Recognizer unavailable'))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages).toEqual([Draw.RecognitionFailed()])
      pointer(canvas, 'pointerdown', 3, 30, 30)
      pointer(document, 'pointerup', 3, 30, 30)
      await Effect.runPromise(Fiber.interrupt(fiber))
      pending[2]!.reject(new Error('Unmounted board failed'))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages).toHaveLength(1)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
    }
  })

  it.each(['ink', 'mode', 'unmount'])('discards an asynchronous Submit snapshot after %s changes', async change => {
    const { canvas, dispose } = whiteboard()
    dispose()
    canvas.id = 'draw-board'
    const fiber = Effect.runFork(Stream.runDrain(Draw.__drawTest.mountWhiteboard('A')(canvas)))
    let complete: ((value: { value: string; score: number; predictions: []; debugImages: [] }) => void) | undefined
    const recognize = vi.fn(() => new Promise<{ value: string; score: number; predictions: []; debugImages: [] }>(resolve => { complete = resolve }))
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      const pending = Draw.__drawTest.recognizeCurrentBoard('A', 'model', recognize)
      expect(recognize.mock.calls[0]?.length).toBe(3)
      expect((recognize.mock.calls[0] as unknown[] | undefined)?.[0]).not.toBe(canvas)
      if (change === 'ink') pointer(canvas, 'pointerdown', 1, 10, 10)
      if (change === 'mode') {
        canvas.dataset.recognitionMode = 'template'
        await new Promise(resolve => setTimeout(resolve, 0))
        canvas.dataset.recognitionMode = 'model'
      }
      if (change === 'unmount') await Effect.runPromise(Fiber.interrupt(fiber))
      complete!({ value: 'A', score: 1, predictions: [], debugImages: [] })
      expect(await pending).toEqual(Draw.RecognitionFailed())
      if (change === 'ink') pointer(document, 'pointercancel', 1, 10, 10)
      const current = Draw.__drawTest.recognizeCurrentBoard('A', 'model', async () => ({ value: 'A', score: 1, predictions: [], debugImages: [] }))
      expect(await current).toEqual(change === 'unmount' ? Draw.RecognitionFailed() : Draw.BoardRecognized({ target: 'A', mode: 'model', value: 'A', score: 1, predictions: [], debugImages: [], boardImage: 'data:image/png;base64,snapshot' }))
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
    }
  })

  it('accepts only the newest recognition request for unchanged ink across automatic and manual recognition', async () => {
    const { canvas, dispose } = whiteboard()
    dispose()
    canvas.id = 'draw-board'
    canvas.dataset.freeMode = 'true'
    const result = (value: string) => ({ value, score: 1, predictions: [], debugImages: [] })
    const pending: ((value: ReturnType<typeof result>) => void)[] = []
    const recognize = (_snapshot: HTMLCanvasElement, _mode: Draw.RecognitionMode, _targetLength?: number) => new Promise<ReturnType<typeof result>>(resolve => { pending.push(resolve) })
    const messages: Draw.Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(Draw.__drawTest.mountWhiteboard('A', recognize)(canvas), message => Effect.sync(() => { messages.push(message) })))
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      pointer(canvas, 'pointerdown', 1, 10, 10)
      pointer(document, 'pointerup', 1, 10, 10)
      const submitted = Draw.__drawTest.recognizeCurrentBoard('A', 'model', recognize)
      pending[1]!(result('submitted'))
      expect(await submitted).toEqual(Draw.BoardRecognized({ ...result('submitted'), target: 'A', mode: 'model', boardImage: 'data:image/png;base64,snapshot' }))
      pending[0]!(result('automatic'))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages).toEqual([])

      const older = Draw.__drawTest.recognizeCurrentBoard('A', 'model', recognize)
      const newer = Draw.__drawTest.recognizeCurrentBoard('A', 'model', recognize)
      pending[3]!(result('newer'))
      expect(await newer).toEqual(Draw.BoardRecognized({ ...result('newer'), target: 'A', mode: 'model', boardImage: 'data:image/png;base64,snapshot' }))
      pending[2]!(result('older'))
      expect(await older).toEqual(Draw.RecognitionFailed())
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })
})

describe('Draw', () => {
  it('init creates the first drawing prompt state', () => {
    const model = Draw.init()

    expect(model.target).toBe('0')
    expect(model.round).toBe(0)
    expect(model.score).toBe(0)
    expect(model.success).toBe(false)
    expect(model.topN).toBe(Draw.DEFAULT_TOP_N)
    expect(model.recognitionMode).toBe(Draw.DEFAULT_RECOGNITION_MODE)
    expect(model.targetOrderMode).toBe(Draw.DEFAULT_TARGET_ORDER_MODE)
    expect(model.freeMode).toBe(false)
    expect(model.includeSingle).toBe(true)
    expect(model.includePairs).toBe(true)
    expect(model.includeNumbers).toBe(true)
    expect(model.includeLetters).toBe(true)
    expect(model.inkColor).toBe(Draw.INK_COLORS[0])
    expect(model.brushSize).toBe(Draw.DEFAULT_BRUSH_SIZE)
  })

  it('target pool includes singles, number pairs, and letter pairs', () => {
    expect(Draw.TARGETS).toContain('0')
    expect(Draw.TARGETS).toContain('A')
    expect(Draw.TARGETS).toContain('99')
    expect(Draw.TARGETS).toContain('AZ')
    expect(Draw.TARGETS).toContain('qt')
  })

  it('target pool can be limited by length and character type', () => {
    expect(Draw.targetPoolFor({ includeSingle: true, includePairs: false, includeNumbers: true, includeLetters: false })).toEqual(expect.arrayContaining(['0', '9']))
    expect(Draw.targetPoolFor({ includeSingle: true, includePairs: false, includeNumbers: true, includeLetters: false })).not.toContain('A')
    expect(Draw.targetPoolFor({ includeSingle: false, includePairs: true, includeNumbers: false, includeLetters: true })).toContain('AZ')
    expect(Draw.targetPoolFor({ includeSingle: false, includePairs: true, includeNumbers: false, includeLetters: true })).not.toContain('99')
  })

  it('target pool falls back to all targets when all categories are off', () => {
    expect(Draw.targetPoolFor({ includeSingle: false, includePairs: false, includeNumbers: false, includeLetters: false })).toEqual(Draw.TARGETS)
  })

  it('ordered target pool starts 0-9, then 10-99, A-Z, and AA-ZZ', () => {
    const pool = Draw.targetPoolFor({
      includeSingle: true,
      includePairs: true,
      includeNumbers: true,
      includeLetters: true,
      targetOrderMode: 'ordered',
    })

    expect(pool.slice(0, 10)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(pool.slice(10, 100)).toEqual(Array.from({ length: 90 }, (_, index) => (index + 10).toString()))
    expect(pool.slice(100, 126)).toEqual('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))
    expect(pool.slice(126, 132)).toEqual(['AA', 'AB', 'AC', 'AD', 'AE', 'AF'])
    expect(pool.indexOf('00')).toBeGreaterThan(pool.indexOf('ZZ'))
    expect(pool.indexOf('a')).toBeGreaterThan(pool.indexOf('ZZ'))
  })

  it('ordered target pool respects category toggles', () => {
    const pool = Draw.targetPoolFor({
      includeSingle: false,
      includePairs: true,
      includeNumbers: true,
      includeLetters: false,
      targetOrderMode: 'ordered',
    })

    expect(pool.slice(0, 3)).toEqual(['10', '11', '12'])
    expect(pool).not.toContain('0')
    expect(pool).not.toContain('A')
  })

  it('normalizes top N into the supported range', () => {
    expect(Draw.normalizeTopN(undefined)).toBe(Draw.DEFAULT_TOP_N)
    expect(Draw.normalizeTopN(-10)).toBe(Draw.MIN_TOP_N)
    expect(Draw.normalizeTopN(99)).toBe(Draw.MAX_TOP_N)
    expect(Draw.normalizeTopN(2.6)).toBe(3)
  })

  it('sets ink color from the palette and falls back for invalid colors', () => {
    const [colored] = Draw.update(Draw.init(), Draw.SetInkColor({ value: Draw.INK_COLORS[3] }))
    const [fallback] = Draw.update(colored, Draw.SetInkColor({ value: '#ffffff' }))

    expect(colored.inkColor).toBe(Draw.INK_COLORS[3])
    expect(fallback.inkColor).toBe(Draw.INK_COLORS[0])
  })

  it('keeps palette colors literal while adapting only the default marker in dark mode', () => {
    const light = document.createElement('div')
    const dark = document.createElement('div')
    const lightCanvas = document.createElement('canvas')
    const darkCanvas = document.createElement('canvas')
    dark.className = 'dark'
    light.append(lightCanvas)
    dark.append(darkCanvas)

    for (const color of Draw.INK_COLORS.slice(1)) {
      lightCanvas.dataset.inkColor = color
      darkCanvas.dataset.inkColor = color
      expect(Draw.__drawTest.strokeColorForCanvas(lightCanvas)).toBe(color)
      expect(Draw.__drawTest.strokeColorForCanvas(darkCanvas)).toBe(color)
    }

    lightCanvas.dataset.inkColor = Draw.INK_COLORS[0]
    darkCanvas.dataset.inkColor = Draw.INK_COLORS[0]
    expect(Draw.__drawTest.strokeColorForCanvas(lightCanvas)).toBe(Draw.INK_COLORS[0])
    expect(Draw.__drawTest.strokeColorForCanvas(darkCanvas)).toBe('#fff')
  })

  it('does not invert the dark drawing surfaces', () => {
    expect(drawStyles).not.toContain('filter:invert')
    expect(drawStyles).toContain('.dark .draw-board{background:#161616')
    expect(drawStyles).toContain('.dark .draw-win-img{background:#161616')
    expect(drawStyles).toContain('.dark .draw-debug-img{background:#161616')
  })

  it('sets brush thickness within the supported range', () => {
    const [thick] = Draw.update(Draw.init(), Draw.SetBrushSize({ value: 31.4 }))
    const [tooSmall] = Draw.update(thick, Draw.SetBrushSize({ value: -1 }))
    const [tooLarge] = Draw.update(tooSmall, Draw.SetBrushSize({ value: 99 }))

    expect(thick.brushSize).toBe(31)
    expect(tooSmall.brushSize).toBe(Draw.MIN_BRUSH_SIZE)
    expect(tooLarge.brushSize).toBe(Draw.MAX_BRUSH_SIZE)
  })

  it('pool toggles repair an excluded current target', () => {
    const model = { ...Draw.init(), target: 'A', includeSingle: true, includePairs: false, includeNumbers: true, includeLetters: true }
    const [next] = Draw.update(model, Draw.SetIncludeLetters({ value: false }))

    expect(next.includeLetters).toBe(false)
    expect(Draw.targetPoolFor(next)).toContain(next.target)
    expect(next.target).not.toBe('A')
    expect(next.clearCount).toBe(1)
  })

  it('pool toggles keep an allowed current target without remounting', () => {
    const model = { ...Draw.init(), target: '7', includeSingle: true, includePairs: true, includeNumbers: true, includeLetters: true, clearCount: 4 }
    const [next] = Draw.update(model, Draw.SetIncludeLetters({ value: false }))

    expect(next.target).toBe('7')
    expect(next.clearCount).toBe(4)
    expect(next.includeLetters).toBe(false)
  })

  it('submit creates a recognizer command for the current target and mode', () => {
    const model = { ...Draw.init(), target: 'A', recognitionMode: 'template' as const }
    const [next, cmds] = Draw.update(model, Draw.SubmitBoard())

    expect(next).toBe(model)
    expect(cmds).toHaveLength(1)
    expect(cmds[0]?.name).toBe('DrawSubmitBoard')
    expect(cmds[0]?.args).toStrictEqual({ target: 'A', mode: 'template' })
  })

  it('accepts the target when it appears inside top N predictions', () => {
    const model = { ...Draw.init(), target: 'A', topN: 3 }
    const [next, cmds] = Draw.update(model, recognized(model, ['B', 'C', 'A', 'D'], {
      debugImages: [
        { label: 'raw board', src: 'raw', kind: 'image' },
        { label: 'cropped and centered', src: 'cropped', kind: 'image' },
      ],
    }))

    expect(next.success).toBe(true)
    expect(next.score).toBe(1)
    expect(next.lastGuess).toBe('B')
    expect(next.lastPredictions.map(prediction => prediction.value)).toEqual(['B', 'C', 'A', 'D'])
    expect(next.lastBoardImage).toBe('data:image/png;base64,board')
    expect(next.winningImage).toBe('cropped')
    expect(cmds).toHaveLength(0)
  })

  it('rejects the target when it is outside top N predictions', () => {
    const model = { ...Draw.init(), target: 'A', topN: 2 }
    const [next, cmds] = Draw.update(model, recognized(model, ['B', 'C', 'A']))

    expect(next.success).toBe(false)
    expect(next.score).toBe(0)
    expect(next.lastGuess).toBe('B')
    expect(cmds).toHaveLength(0)
  })

  it('counts l, I, and 1 as near-match successes', () => {
    const model = { ...Draw.init(), target: 'l', topN: 1 }
    const [next] = Draw.update(model, recognized(model, ['1']))

    expect(next.success).toBe(true)
    expect(next.score).toBe(1)
  })

  it('counts o, O, and 0 as near-match successes', () => {
    const model = { ...Draw.init(), target: 'O', topN: 1 }
    const [next] = Draw.update(model, recognized(model, ['0']))

    expect(next.success).toBe(true)
    expect(next.score).toBe(1)
  })

  it('accepts a matching two-character target', () => {
    const model = { ...Draw.init(), target: 'AB', topN: 1 }
    const [next] = Draw.update(model, recognized(model, ['AB']))

    expect(next.success).toBe(true)
    expect(next.score).toBe(1)
  })

  it('accepts near matches inside a two-character target', () => {
    const model = { ...Draw.init(), target: 'O1', topN: 1 }
    const [next] = Draw.update(model, recognized(model, ['0l']))

    expect(next.success).toBe(true)
    expect(next.score).toBe(1)
  })

  it('accepts pair targets when each side contains the required char in top N', () => {
    const model = { ...Draw.init(), target: 'AB', topN: 3 }
    const [next] = Draw.update(model, recognized(model, ['XY', 'XZ', 'YZ'], {
      components: [
        predictions('X', 'A', 'C', 'D'),
        predictions('Y', 'Z', 'B', 'E'),
      ],
    }))

    expect(next.success).toBe(true)
    expect(next.score).toBe(1)
  })

  it('rejects pair targets when either side is outside top N', () => {
    const model = { ...Draw.init(), target: 'AB', topN: 2 }
    const [next] = Draw.update(model, recognized(model, ['AB'], {
      components: [
        predictions('A', 'C'),
        predictions('X', 'Y', 'B'),
      ],
    }))

    expect(next.success).toBe(false)
    expect(next.score).toBe(0)
  })

  it('still accepts non-split pair predictions through the combined top N list', () => {
    const model = { ...Draw.init(), target: 'AB', topN: 2 }
    const [next] = Draw.update(model, recognized(model, ['XY', 'AB']))

    expect(next.success).toBe(true)
    expect(next.score).toBe(1)
  })

  it('ignores stale recognition results for another mode or target', () => {
    const model = { ...Draw.init(), target: 'A', recognitionMode: 'model' as const }
    const [wrongMode] = Draw.update(model, recognized(model, ['A'], { mode: 'template' }))
    const [wrongTarget] = Draw.update(model, recognized(model, ['A'], { target: 'B' }))

    expect(wrongMode).toBe(model)
    expect(wrongTarget).toBe(model)
  })

  it('ignores recognition after a prompt-mode success until next round', () => {
    const model = { ...Draw.init(), target: 'A', success: true, score: 1 }
    const [next] = Draw.update(model, recognized(model, ['A']))

    expect(next).toBe(model)
  })

  it('free mode reports the best guess without scoring or checking the target', () => {
    const model = { ...Draw.init(), target: 'A', freeMode: true, topN: 3 }
    const [next, cmds] = Draw.update(model, recognized(model, ['B', 'C'], { target: 'stale-target' }))

    expect(next.success).toBe(false)
    expect(next.score).toBe(0)
    expect(next.lastGuess).toBe('B')
    expect(next.lastConfidence).toBe(0.9)
    expect(next.lastPredictions.map(prediction => prediction.value)).toEqual(['B', 'C'])
    expect(next.lastBoardImage).toBe('data:image/png;base64,board')
    expect(cmds).toHaveLength(0)
  })

  it('free mode can report a split multi-character guess', () => {
    const model = { ...Draw.init(), freeMode: true }
    const [next] = Draw.update(model, recognized(model, ['AB', 'A8']))

    expect(next.lastGuess).toBe('AB')
    expect(next.lastPredictions.map(prediction => prediction.value)).toEqual(['AB', 'A8'])
    expect(next.success).toBe(false)
    expect(next.score).toBe(0)
  })

  it('can split a two-glyph drawing along an angled blank separator', () => {
    const data = inkWhere(120, 80, (x, y) => {
      if (y < 16 || y > 64) return false
      const projected = slantedProjection(x, y, 20, 40)
      return (projected >= 18 && projected <= 46) || (projected >= 56 && projected <= 84)
    })

    expect(Draw.__drawTest.findLeftRightSplit(data, 120, 80)).toBeNull()
    const split = Draw.__drawTest.findLeftRightSplit(data, 120, 80, true)

    expect(split).not.toBeNull()
    expect(split?.left.bounds.minX).toBeLessThan(split?.right.bounds.minX ?? 0)
    expect(split?.left.separator?.side).toBe('left')
    expect(split?.right.separator?.side).toBe('right')
  })

  it('does not split a solid single glyph shape with angled separators', () => {
    const data = inkImage(120, 80, [[20, 15, 80, 65]])

    expect(Draw.__drawTest.findLeftRightSplit(data, 120, 80, true)).toBeNull()
  })

  it('toggling free mode clears the current board state', () => {
    const model = {
      ...Draw.init(),
      success: true,
      lastGuess: 'A',
      lastPredictions: predictions('A'),
      debugImages: [{ label: 'old', src: '', kind: 'prediction' as const, value: 'A' }],
      lastBoardImage: 'data:image/png;base64,board',
      winningImage: 'cropped',
      clearCount: 1,
    }
    const [next, cmds] = Draw.update(model, Draw.SetFreeMode({ value: true }))

    expect(next.freeMode).toBe(true)
    expect(next.success).toBe(false)
    expect(next.lastGuess).toBe('')
    expect(next.lastPredictions).toHaveLength(0)
    expect(next.debugImages).toHaveLength(0)
    expect(next.lastBoardImage).toBe('')
    expect(next.winningImage).toBe('')
    expect(next.clearCount).toBe(2)
    expect(cmds).toHaveLength(0)
  })

  it('switching mode clears predictions and reprocesses the last board image', () => {
    const model = {
      ...Draw.init(),
      target: 'A',
      lastGuess: 'B',
      lastConfidence: 0.4,
      lastPredictions: predictions('B'),
      debugImages: [{ label: 'old', src: '', kind: 'prediction' as const, value: 'B' }],
      lastBoardImage: 'data:image/png;base64,board',
    }
    const [next, cmds] = Draw.update(model, Draw.SetRecognitionMode({ value: 'template' }))

    expect(next.recognitionMode).toBe('template')
    expect(next.lastGuess).toBe('')
    expect(next.lastConfidence).toBe(0)
    expect(next.lastPredictions).toHaveLength(0)
    expect(next.debugImages).toHaveLength(0)
    expect(cmds).toHaveLength(1)
    expect(cmds[0]?.name).toBe('DrawReprocessBoard')
    expect(cmds[0]?.args).toStrictEqual({ target: 'A', mode: 'template', boardImage: 'data:image/png;base64,board' })
  })

  it('clear removes diagnostics and remounts the board without changing the target', () => {
    const model = {
      ...Draw.init(),
      target: 'A',
      lastGuess: 'B',
      lastConfidence: 0.4,
      lastPredictions: predictions('B'),
      debugImages: [{ label: 'old', src: '', kind: 'prediction' as const, value: 'B' }],
      lastBoardImage: 'data:image/png;base64,board',
      clearCount: 2,
    }
    const [next, cmds] = Draw.update(model, Draw.ClearBoard())

    expect(next.target).toBe('A')
    expect(next.clearCount).toBe(3)
    expect(next.lastGuess).toBe('')
    expect(next.lastPredictions).toHaveLength(0)
    expect(next.debugImages).toHaveLength(0)
    expect(next.lastBoardImage).toBe('')
    expect(cmds).toHaveLength(0)
  })

  it('next advances to a random target and clears the captured board image', () => {
    const model = { ...Draw.init(), target: 'A', success: true, lastBoardImage: 'data:image/png;base64,board', winningImage: 'cropped' }
    const [next, cmds] = Draw.update(model, Draw.NextRound())

    expect(next.round).toBe(1)
    expect(Draw.TARGETS).toContain(next.target)
    expect(next.target).not.toBe('A')
    expect(next.success).toBe(false)
    expect(next.lastBoardImage).toBe('')
    expect(next.winningImage).toBe('')
    expect(next.clearCount).toBe(1)
    expect(cmds).toHaveLength(0)
  })

  it('skip advances to a random target and clears the captured board image', () => {
    const model = { ...Draw.init(), target: 'A', lastBoardImage: 'data:image/png;base64,board' }
    const [next, cmds] = Draw.update(model, Draw.SkipTarget())

    expect(next.round).toBe(1)
    expect(Draw.TARGETS).toContain(next.target)
    expect(next.target).not.toBe('A')
    expect(next.lastBoardImage).toBe('')
    expect(cmds).toHaveLength(0)
  })

  it('shuffle chooses a different target and clears the board state', () => {
    const model = {
      ...Draw.init(),
      target: 'A',
      lastGuess: 'B',
      lastPredictions: predictions('B'),
      debugImages: [{ label: 'old', src: '', kind: 'prediction' as const, value: 'B' }],
      lastBoardImage: 'data:image/png;base64,board',
      clearCount: 1,
    }
    const [next, cmds] = Draw.update(model, Draw.ShuffleTarget())

    expect(Draw.TARGETS).toContain(next.target)
    expect(next.target).not.toBe('A')
    expect(next.round).toBe(1)
    expect(next.clearCount).toBe(2)
    expect(next.lastGuess).toBe('')
    expect(next.lastPredictions).toHaveLength(0)
    expect(next.debugImages).toHaveLength(0)
    expect(next.lastBoardImage).toBe('')
    expect(cmds).toHaveLength(0)
  })

  it('ordered mode advances through the requested sequence', () => {
    const base = { ...Draw.init(), targetOrderMode: 'ordered' as const }
    const [afterNine] = Draw.update({ ...base, target: '9' }, Draw.NextRound())
    const [afterNinetyNine] = Draw.update({ ...base, target: '99' }, Draw.NextRound())
    const [afterZ] = Draw.update({ ...base, target: 'Z' }, Draw.NextRound())
    const [afterAz] = Draw.update({ ...base, target: 'AZ' }, Draw.NextRound())

    expect(afterNine.target).toBe('10')
    expect(afterNinetyNine.target).toBe('A')
    expect(afterZ.target).toBe('AA')
    expect(afterAz.target).toBe('BA')
  })

  it('shuffle button follows ordered mode when enabled', () => {
    const model = { ...Draw.init(), targetOrderMode: 'ordered' as const, target: '9' }
    const [next] = Draw.update(model, Draw.ShuffleTarget())

    expect(next.target).toBe('10')
    expect(next.round).toBe(1)
  })

  it('sets the target order mode', () => {
    const [next, cmds] = Draw.update(Draw.init(), Draw.SetTargetOrderMode({ value: 'ordered' }))

    expect(next.targetOrderMode).toBe('ordered')
    expect(cmds).toHaveLength(0)
  })
})
