import { Effect, Fiber, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSequenceLines, type LineMessage } from './sequenceWordsRuntime'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const fixture = () => {
  const board = document.createElement('div')
  board.dataset.sequenceToken = '4'; board.dataset.sequenceStatus = 'matching'
  board.innerHTML = '<svg><path data-sequence-line="0"></path><path data-sequence-drag></path></svg><button data-sequence-side="number" data-sequence-choice="0"><span data-sequence-anchor></span>1</button><button data-sequence-side="word" data-sequence-choice="0"><span data-sequence-anchor></span>first</button>'
  document.body.append(board)
  const [number, word] = [...board.querySelectorAll<HTMLButtonElement>('button')]
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 240))
  vi.spyOn(number!.querySelector('[data-sequence-anchor]')!, 'getBoundingClientRect').mockReturnValue(new DOMRect(95, 20, 10, 10))
  vi.spyOn(word!.querySelector('[data-sequence-anchor]')!, 'getBoundingClientRect').mockReturnValue(new DOMRect(295, 100, 10, 10))
  vi.spyOn(document, 'elementFromPoint').mockImplementation(x => x > 200 ? word! : number!)
  const messages: LineMessage[] = []
  const fiber = Effect.runFork(Stream.runForEach(mountSequenceLines(board), message => Effect.sync(() => { messages.push(message) })))
  return { board, number: number!, word: word!, messages, fiber }
}
const pointer = (target: Element, type: string, id: number, x: number, y: number, time: number, pointerType = 'touch') => {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, button: 0, clientX: x, clientY: y })
  Object.defineProperty(event, 'timeStamp', { value: time }); target.dispatchEvent(event); return event
}
const touch = (target: Element, type: string, id: number, x: number, y: number, time: number) => {
  const point = { identifier: id, target, clientX: x, clientY: y }
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'changedTouches', { value: { 0: point, length: 1, item: () => point } })
  Object.defineProperty(event, 'timeStamp', { value: time }); target.dispatchEvent(event); return event
}
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('Sequence Words line input and lifecycle', () => {
  it.each(['number', 'word'] as const)('draws a pointer connection starting from the %s side', async side => {
    const test = fixture()
    try {
      await tick()
      const start = side === 'number' ? test.number : test.word
      const x = side === 'number' ? 100 : 300
      const endX = side === 'number' ? 300 : 100
      pointer(start, 'pointerdown', 5, x, 25, 100, 'mouse')
      pointer(test.board, 'pointermove', 5, endX, 105, 300, 'mouse')
      expect(test.board.querySelector('[data-sequence-drag]')!.getAttribute('d')).toContain('C ')
      pointer(test.board, 'pointerup', 5, endX, 105, 400, 'mouse')
      await tick()
      expect(test.messages).toEqual([{ _tag: 'SequenceWordsConnect', number: 0, word: 0, token: 4 }])
      expect(test.board.querySelector('[data-sequence-drag]')!.hasAttribute('d')).toBe(false)
      expect(test.board.querySelector('[data-sequence-line]')!.getAttribute('d')).toBe('M 100 25 C 190 25, 210 105, 300 105')
    } finally { await Effect.runPromise(Fiber.interrupt(test.fiber)) }
  })

  it.each(['pointer-first', 'native-first'] as const)('deduplicates native signed touches and Pencil events (%s), including early clicks', async order => {
    const test = fixture()
    try {
      await tick()
      if (order === 'pointer-first') {
        pointer(test.number, 'pointerdown', 7, 100, 25, 100, 'pen'); touch(test.number, 'touchstart', -8, 100, 25, 110)
      } else {
        touch(test.number, 'touchstart', -8, 100, 25, 100); pointer(test.number, 'pointerdown', 7, 100, 25, 110, 'pen')
      }
      touch(test.word, 'touchmove', -8, 300, 105, 300)
      pointer(test.board, 'pointerup', 7, 300, 105, 400, 'pen')
      const early = new PointerEvent('click', { bubbles: true, cancelable: true, pointerType: 'pen', detail: 0 })
      test.number.dispatchEvent(early); expect(early.defaultPrevented).toBe(true)
      touch(test.word, 'touchend', -8, 300, 105, 410)
      const duplicate = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
      test.number.dispatchEvent(duplicate); expect(duplicate.defaultPrevented).toBe(true)
      await tick()
      expect(test.messages).toEqual([{ _tag: 'SequenceWordsConnect', number: 0, word: 0, token: 4 }])
    } finally { await Effect.runPromise(Fiber.interrupt(test.fiber)) }
  })

  it('supports touch-only tapping, avoids compatibility clicks and preserves keyboard activation', async () => {
    const test = fixture()
    const clicks = vi.fn(); test.number.addEventListener('click', clicks)
    try {
      await tick()
      touch(test.number, 'touchstart', -123, 100, 25, 100); touch(test.number, 'touchend', -123, 100, 25, 200)
      test.number.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
      test.number.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }))
      await tick()
      expect(test.messages).toEqual([{ _tag: 'SequenceWordsPick', side: 'number', choice: 0, token: 4 }])
      expect(clicks).toHaveBeenCalledOnce()
    } finally { await Effect.runPromise(Fiber.interrupt(test.fiber)) }
  })

  it('rejects cancelled and stale drags, then releases every listener on unmount', async () => {
    const test = fixture()
    try {
      await tick()
      pointer(test.number, 'pointerdown', 5, 100, 25, 100)
      pointer(test.board, 'pointercancel', 5, 300, 105, 200)
      pointer(test.number, 'pointerdown', 6, 100, 25, 300)
      test.board.dataset.sequenceToken = '5'
      pointer(test.board, 'pointerup', 6, 300, 105, 400)
      await tick()
      expect(test.messages).toEqual([])
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000)
      const staleClick = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
      test.number.dispatchEvent(staleClick); expect(staleClick.defaultPrevented).toBe(true)
      await Effect.runPromise(Fiber.interrupt(test.fiber))
      pointer(test.number, 'pointerdown', 7, 100, 25, 500); pointer(test.board, 'pointerup', 7, 300, 105, 600)
      await tick(); expect(test.messages).toEqual([])
    } finally { await Effect.runPromise(Fiber.interrupt(test.fiber)) }
  })
})
