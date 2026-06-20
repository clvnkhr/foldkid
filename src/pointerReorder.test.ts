import { Effect, Fiber, Stream } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import { pointerReorder } from './pointerReorder'

type Message =
  | Readonly<{ _tag: 'start'; index: number }>
  | Readonly<{ _tag: 'drop'; index: number }>
  | Readonly<{ _tag: 'end' }>

const pointerEvent = (type: string): PointerEvent => {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent
  Object.defineProperties(event, {
    button: { value: 0 },
    pointerId: { value: 1 },
    clientX: { value: 24 },
    clientY: { value: 48 },
  })
  return event
}

describe('pointerReorder', () => {
  const originalElementFromPoint = document.elementFromPoint.bind(document)

  afterEach(() => {
    document.body.replaceChildren()
    document.elementFromPoint = originalElementFromPoint
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
})
