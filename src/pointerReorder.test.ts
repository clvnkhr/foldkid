import { Effect, Fiber, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pointerReorder } from './pointerReorder'

type Message =
  | Readonly<{ _tag: 'start'; index: number }>
  | Readonly<{ _tag: 'drop'; index: number }>
  | Readonly<{ _tag: 'end' }>

const pointerEvent = (type: string, pointerId = 1, clientX = 24): PointerEvent => {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent
  Object.defineProperties(event, {
    button: { value: 0 },
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: 48 },
  })
  return event
}

describe('pointerReorder', () => {
  const originalElementFromPoint = document.elementFromPoint.bind(document)

  afterEach(() => {
    document.body.replaceChildren()
    document.elementFromPoint = originalElementFromPoint
    vi.restoreAllMocks()
  })

  it('emits start and drop messages from a handle drag', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="item" data-drag-index="0"><span class="handle"></span></div>
      <div class="item" data-drag-index="1"><span class="handle"></span></div>
    `
    document.body.appendChild(root)

    const firstHandle = root.querySelector('.handle')
    const secondItem = root.querySelector('[data-drag-index="1"]')
    if (!(firstHandle instanceof HTMLElement) || !(secondItem instanceof HTMLElement)) {
      throw new Error('missing drag fixture elements')
    }

    document.elementFromPoint = () => secondItem

    const messages: Message[] = []
    const action = pointerReorder<Message>({
      name: 'testPointerReorder',
      itemSelector: '.item',
      handleSelector: '.handle',
      start: index => ({ _tag: 'start', index }),
      drop: index => ({ _tag: 'drop', index }),
      end: () => ({ _tag: 'end' }),
    })
    const fiber = Effect.runFork(
      Stream.runForEach(action.f(root), message => Effect.sync(() => {
        messages.push(message)
      })),
    )

    await new Promise(resolve => setTimeout(resolve, 0))
    firstHandle.dispatchEvent(pointerEvent('pointerdown'))
    root.dispatchEvent(pointerEvent('pointerup'))
    await new Promise(resolve => setTimeout(resolve, 0))
    await Effect.runPromise(Fiber.interrupt(fiber))

    expect(messages).toEqual([
      { _tag: 'start', index: 0 },
      { _tag: 'drop', index: 1 },
    ])
  })

  it('ignores other fingers and completes the owned drop through document listeners without capture', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="item" data-drag-index="0"><span class="handle"></span></div><div class="item" data-drag-index="1"><span class="handle"></span></div>'
    document.body.append(root)
    const handles = [...root.querySelectorAll<HTMLElement>('.handle')]
    const target = root.querySelector('[data-drag-index="1"]')!
    document.elementFromPoint = () => target
    root.setPointerCapture = () => { throw new Error('capture unavailable') }
    const messages: Message[] = []
    const action = pointerReorder<Message>({
      name: 'testPointerReorder', itemSelector: '.item', handleSelector: '.handle',
      start: index => ({ _tag: 'start', index }), drop: index => ({ _tag: 'drop', index }), end: () => ({ _tag: 'end' }),
    })
    const fiber = Effect.runFork(Stream.runForEach(action.f(root), message => Effect.sync(() => { messages.push(message) })))
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      handles[0]!.dispatchEvent(pointerEvent('pointerdown', 1))
      handles[1]!.dispatchEvent(pointerEvent('pointerdown', 2))
      document.dispatchEvent(pointerEvent('pointerup', 2))
      document.dispatchEvent(pointerEvent('pointercancel', 2))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages).toEqual([{ _tag: 'start', index: 0 }])
      document.dispatchEvent(pointerEvent('pointerup', 1))
      document.dispatchEvent(pointerEvent('pointerup', 1))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages).toEqual([{ _tag: 'start', index: 0 }, { _tag: 'drop', index: 1 }])
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
    }
  })

  it('ends cancellation without dropping and removes listeners and captures on interruption', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="item" data-drag-index="0"><span class="handle"></span></div>'
    document.body.append(root)
    const handle = root.querySelector<HTMLElement>('.handle')!
    const release = vi.fn()
    root.releasePointerCapture = release
    root.setPointerCapture = vi.fn()
    document.elementFromPoint = () => root.querySelector('.item')
    const messages: Message[] = []
    const action = pointerReorder<Message>({
      name: 'testPointerReorder', itemSelector: '.item', handleSelector: '.handle',
      start: index => ({ _tag: 'start', index }), drop: index => ({ _tag: 'drop', index }), end: () => ({ _tag: 'end' }),
    })
    const fiber = Effect.runFork(Stream.runForEach(action.f(root), message => Effect.sync(() => { messages.push(message) })))
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      handle.dispatchEvent(pointerEvent('pointerdown', 1))
      root.dispatchEvent(pointerEvent('lostpointercapture', 1))
      document.dispatchEvent(pointerEvent('pointerup', 1))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages).toEqual([{ _tag: 'start', index: 0 }, { _tag: 'end' }])
      handle.dispatchEvent(pointerEvent('pointerdown', 2))
      await new Promise(resolve => setTimeout(resolve, 0))
      await Effect.runPromise(Fiber.interrupt(fiber))
      expect(release).toHaveBeenCalledWith(1)
      expect(release).toHaveBeenCalledWith(2)
      document.dispatchEvent(pointerEvent('pointerup', 2))
      handle.dispatchEvent(pointerEvent('pointerdown', 3))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages).toHaveLength(3)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
    }
  })

  const action = () => pointerReorder<Message>({
    name: 'testPointerReorder', itemSelector: '.item', handleSelector: '.handle',
    start: index => ({ _tag: 'start', index }), drop: index => ({ _tag: 'drop', index }), end: () => ({ _tag: 'end' }),
  })

  it('stops a drag handle click before it reaches its clickable game card', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="item" data-drag-index="0"><span class="handle">drag</span></div>'
    document.body.append(root)
    const card = root.querySelector<HTMLElement>('.item')!
    const handle = root.querySelector<HTMLElement>('.handle')!
    const navigate = vi.fn()
    card.addEventListener('click', navigate)
    const fiber = Effect.runFork(Stream.runDrain(action().f(root)))
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      handle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
      expect(navigate).not.toHaveBeenCalled()
      card.click()
      expect(navigate).toHaveBeenCalledOnce()
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })

  it('completes the owned release before a child handler stops its bubbling', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="item" data-drag-index="0"><span class="handle"></span></div>'
    const outside = document.createElement('button')
    document.body.append(root, outside)
    outside.addEventListener('pointerup', event => event.stopPropagation())
    document.elementFromPoint = () => root.querySelector('.item')
    root.setPointerCapture = () => { throw new Error('capture unavailable') }
    const messages: Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(action().f(root), message => Effect.sync(() => { messages.push(message) })))
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      root.querySelector('.handle')!.dispatchEvent(pointerEvent('pointerdown'))
      outside.dispatchEvent(pointerEvent('pointerup'))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages).toEqual([{ _tag: 'start', index: 0 }, { _tag: 'drop', index: 0 }])
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })

  for (const interruption of ['blur', 'hidden document', 'closed panel', 'hidden panel'] as const) {
    it(`ends reorder once on ${interruption}, releases capture, and accepts a fresh drag`, async () => {
      const panel = document.createElement('div')
      panel.className = 'settings-panel'
      const root = document.createElement('div')
      root.innerHTML = '<div class="item" data-drag-index="0"><span class="handle"></span></div>'
      panel.append(root)
      document.body.append(panel)
      const handle = root.querySelector('.handle')!
      const release = vi.fn()
      root.releasePointerCapture = release
      document.elementFromPoint = () => root.querySelector('.item')
      const messages: Message[] = []
      const fiber = Effect.runFork(Stream.runForEach(action().f(root), message => Effect.sync(() => { messages.push(message) })))
      try {
        await new Promise(resolve => setTimeout(resolve, 0))
        handle.dispatchEvent(pointerEvent('pointerdown', 1))
        if (interruption === 'blur') window.dispatchEvent(new Event('blur'))
        else if (interruption === 'hidden document') {
          const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
          document.dispatchEvent(new Event('visibilitychange'))
          hidden.mockRestore()
        } else if (interruption === 'closed panel') panel.style.display = 'none'
        else panel.hidden = true
        await new Promise(resolve => setTimeout(resolve, 0))
        document.dispatchEvent(pointerEvent('pointerup', 1))
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(messages).toEqual([{ _tag: 'start', index: 0 }, { _tag: 'end' }])
        expect(release).toHaveBeenCalledExactlyOnceWith(1)
        panel.style.display = ''
        panel.hidden = false
        handle.dispatchEvent(pointerEvent('pointerdown', 2))
        document.dispatchEvent(pointerEvent('pointerup', 2))
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(messages.slice(2)).toEqual([{ _tag: 'start', index: 0 }, { _tag: 'drop', index: 0 }])
      } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
    })
  }

  it('rejects malformed indices and pointer IDs, and cancels invalid release coordinates', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="item"><span class="handle"></span></div>'
    document.body.append(root)
    const item = root.querySelector('.item')!
    const handle = root.querySelector('.handle')!
    const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(item)
    const messages: Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(action().f(root), message => Effect.sync(() => { messages.push(message) })))
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      for (const index of ['', '1junk', '1.5', '-1', 'Infinity']) {
        item.setAttribute('data-drag-index', index)
        handle.dispatchEvent(pointerEvent('pointerdown', 1))
      }
      item.setAttribute('data-drag-index', '0')
      handle.dispatchEvent(pointerEvent('pointerdown', Number.NaN))
      handle.dispatchEvent(pointerEvent('pointerdown', 1))
      document.dispatchEvent(pointerEvent('pointerup', 1, Number.NaN))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(hit).not.toHaveBeenCalled()
      expect(messages).toEqual([{ _tag: 'start', index: 0 }, { _tag: 'end' }])
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })
})
