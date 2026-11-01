import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { mountTarotDeck, moveTarotCardToSlot, reshuffleTarotPile, type TarotDrawMessage } from './tarotRuntime'

vi.mock('../audio', () => ({ warmAudio: vi.fn() }))
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const pointer = (target: EventTarget, type: string, pointerId = 1, x = 20, y = 30, pointerType = 'pen') => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId, clientX: x, clientY: y, pointerType, button: 0 })
  target.dispatchEvent(event)
}
const touch = (target: EventTarget, type: string, identifier = 7, x = 20, y = 30) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { changedTouches: [{ identifier, clientX: x, clientY: y }] })
  target.dispatchEvent(event)
}
const run = async (test: (deck: HTMLButtonElement, messages: TarotDrawMessage[]) => Promise<void>) => {
  const deck = document.createElement('button')
  deck.dataset.tarotToken = '4'
  const area = document.createElement('div')
  area.className = 'tarot-deck-area'
  area.append(deck)
  document.body.append(area)
  const messages: TarotDrawMessage[] = []
  const fiber = Effect.runFork(Stream.runForEach(mountTarotDeck(deck), message => Effect.sync(() => { messages.push(message) })))
  try { await tick(); await test(deck, messages) } finally { await Effect.runPromise(Fiber.interrupt(fiber)); area.remove() }
}

describe('Tarot deck gesture ownership', () => {
  it('pulls a card on Pencil or mouse release, suppressing the following compatibility click', async () => run(async (deck, messages) => {
    pointer(deck, 'pointerdown')
    pointer(document, 'pointermove', 1, 60, -50)
    expect(deck.style.getPropertyValue('--tarot-drag-y')).toBe('-80px')
    pointer(document, 'pointerup', 1, 60, -50)
    deck.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }))
    await tick()
    expect(messages).toEqual([{ _tag: 'TarotDrawRequested', token: 4 }])
    expect(deck.style.getPropertyValue('--tarot-drag-y')).toBe('')
    deck.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    deck.click()
    await tick()
    expect(messages).toHaveLength(2)
  }))

  it('uses the native touch fallback once, even when touch pointer events are also emitted', async () => run(async (deck, messages) => {
    pointer(deck, 'pointerdown', 9, 20, 30, 'touch')
    touch(deck, 'touchstart')
    touch(document, 'touchmove', 7, 25, -80)
    pointer(document, 'pointerup', 9, 25, -80, 'touch')
    touch(document, 'touchend', 7, 25, -80)
    deck.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
    await tick()
    expect(messages).toHaveLength(1)
  }))

  it('supports pointer-only touch devices and native-first paired events', async () => run(async (deck, messages) => {
    pointer(deck, 'pointerdown', 2, 20, 30, 'touch')
    pointer(document, 'pointermove', 2, 20, -40, 'touch')
    pointer(document, 'pointerup', 2, 20, -40, 'touch')
    deck.click()
    await tick()
    expect(messages).toHaveLength(1)
    touch(deck, 'touchstart', 8)
    pointer(deck, 'pointerdown', 9, 20, 30, 'touch')
    touch(document, 'touchend', 8)
    pointer(document, 'pointerup', 9, 20, 30, 'touch')
    deck.click()
    await tick()
    expect(messages).toHaveLength(2)
  }))

  it('cancels paired touches through either event family and swallows a late click after blur', async () => run(async (deck, messages) => {
    pointer(deck, 'pointerdown', 9, 20, 30, 'touch')
    touch(deck, 'touchstart', 7)
    pointer(document, 'pointercancel', 9, 20, 30, 'touch')
    touch(document, 'touchend', 7)
    deck.click()
    touch(deck, 'touchstart', 8)
    pointer(deck, 'pointerdown', 10, 20, 30, 'touch')
    touch(document, 'touchcancel', 8)
    pointer(document, 'pointerup', 10, 20, 30, 'touch')
    deck.click()
    pointer(deck, 'pointerdown')
    window.dispatchEvent(new Event('blur'))
    pointer(document, 'pointerup')
    deck.click()
    await tick()
    expect(messages).toEqual([])
  }))

  it('keeps an incoming drag above the pile, and cleans its active class on every finish path', async () => run(async (deck, messages) => {
    const area = deck.closest<HTMLElement>('.tarot-deck-area')!
    pointer(deck, 'pointerdown')
    expect(area.classList.contains('tarot-deck-area--dragging')).toBe(true)
    pointer(document, 'pointerup')
    expect(area.classList.contains('tarot-deck-area--dragging')).toBe(false)
    pointer(deck, 'pointerdown')
    pointer(document, 'pointermove', 1, 220, 30)
    expect(area.classList.contains('tarot-deck-area--dragging')).toBe(true)
    expect(deck.style.getPropertyValue('--tarot-drag-x')).toBe('200px')
    pointer(document, 'pointercancel')
    expect(area.classList.contains('tarot-deck-area--dragging')).toBe(false)
    expect(deck.style.getPropertyValue('--tarot-drag-x')).toBe('')
    touch(deck, 'touchstart')
    window.dispatchEvent(new Event('blur'))
    expect(area.classList.contains('tarot-deck-area--dragging')).toBe(false)
    pointer(deck, 'pointerdown')
    deck.dataset.tarotToken = '5'
    await tick()
    expect(area.classList.contains('tarot-deck-area--dragging')).toBe(false)
    pointer(document, 'pointerup')
    await tick()
    expect(messages).toHaveLength(1)
  }))

  it('ignores an early click and multiple compatibility clicks in either paired touch order', async () => run(async (deck, messages) => {
    pointer(deck, 'pointerdown', 9, 20, 30, 'touch')
    touch(deck, 'touchstart', 7)
    pointer(document, 'pointerup', 9, 20, 30, 'touch')
    deck.click()
    await tick()
    expect(messages).toEqual([])
    touch(document, 'touchend', 7)
    deck.click()
    deck.click()
    await tick()
    expect(messages).toHaveLength(1)
    touch(deck, 'touchstart', 8)
    pointer(deck, 'pointerdown', 10, 20, 30, 'touch')
    deck.click()
    touch(document, 'touchend', 8)
    pointer(document, 'pointerup', 10, 20, 30, 'touch')
    deck.click()
    deck.click()
    await tick()
    expect(messages).toHaveLength(2)
  }))

  it('cancels interrupted pulls and refuses a release across a rendered revision', async () => run(async (deck, messages) => {
    pointer(deck, 'pointerdown')
    pointer(document, 'pointercancel')
    deck.click()
    touch(deck, 'touchstart')
    touch(document, 'touchcancel')
    deck.click()
    pointer(deck, 'pointerdown')
    deck.dataset.tarotToken = '5'
    pointer(document, 'pointerup')
    await tick()
    expect(messages).toEqual([])
    expect(deck.style.getPropertyValue('--tarot-drag-x')).toBe('')
  }))

  it('ignores a second finger and disabled deck, and removes document handlers on unmount', async () => {
    let oldDeck: HTMLButtonElement | undefined
    let oldMessages: TarotDrawMessage[] = []
    await run(async (deck, messages) => {
      oldDeck = deck; oldMessages = messages
      touch(deck, 'touchstart', 7)
      touch(deck, 'touchstart', 8)
      touch(document, 'touchend', 8)
      touch(document, 'touchend', 7)
      await tick()
      expect(messages).toHaveLength(1)
      deck.disabled = true
      pointer(deck, 'pointerdown')
      pointer(document, 'pointerup')
      await tick()
      expect(messages).toHaveLength(1)
      deck.disabled = false
      pointer(deck, 'pointerdown')
      expect(deck.closest('.tarot-deck-area')?.classList.contains('tarot-deck-area--dragging')).toBe(true)
    })
    expect(oldDeck!.closest('.tarot-deck-area')?.classList.contains('tarot-deck-area--dragging')).toBe(false)
    pointer(oldDeck!, 'pointerdown')
    pointer(document, 'pointerup')
    await tick()
    expect(oldMessages).toHaveLength(1)
  })
})


describe('Tarot returning pile fallback', () => {
  it('finishes with missing browser APIs and reduced motion', async () => {
    vi.stubGlobal('window', undefined)
    try { await Effect.runPromise(reshuffleTarotPile(1)) } finally { vi.unstubAllGlobals() }
    const reduced: MediaQueryList = { matches: true, media: '(prefers-reduced-motion: reduce)', onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true }
    const media = vi.spyOn(window, 'matchMedia').mockReturnValue(reduced)
    try { await Effect.runPromise(reshuffleTarotPile(1)) } finally { media.mockRestore() }
  })

  it('finishes when the pile disappeared or an animation API throws', async () => {
    await Effect.runPromise(reshuffleTarotPile(1))
    const root = document.createElement('div')
    root.className = 'tarot-card'
    root.dataset.tarotToken = '1'
    root.innerHTML = '<div class="tarot-pile-cards"></div><button class="tarot-deck"></button>'
    document.body.append(root)
    const pile = root.querySelector<HTMLElement>('.tarot-pile-cards')!
    const deck = root.querySelector<HTMLElement>('.tarot-deck')!
    const rect = { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 160, width: 100, height: 160, toJSON: () => ({}) }
    vi.spyOn(pile, 'getBoundingClientRect').mockReturnValue(rect)
    vi.spyOn(deck, 'getBoundingClientRect').mockReturnValue(rect)
    pile.animate = vi.fn(() => { throw new Error('Unsupported animation') })
    deck.animate = vi.fn()
    try { await Effect.runPromise(reshuffleTarotPile(1)) } finally { root.remove() }
  })
})


describe('Tarot reading flight', () => {
  const installAnimate = (implementation: HTMLElement['animate']) => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
    const animate = vi.fn(implementation)
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: animate })
    return { animate, restore: () => { if (original) Object.defineProperty(HTMLElement.prototype, 'animate', original); else Reflect.deleteProperty(HTMLElement.prototype, 'animate') } }
  }
  const fixture = () => {
    const root = document.createElement('div')
    root.className = 'tarot-card'; root.dataset.tarotToken = '4'
    root.innerHTML = '<button><span class="tarot-deck-back"><svg><defs><linearGradient id="deck-ground"></linearGradient></defs><path fill="url(#deck-ground)"></path></svg></span></button>' + [0, 1, 2].map(slot => `<div data-tarot-slot="${slot}"><div class="tarot-slot-card"><div class="tarot-card-visual"></div></div></div>`).join('')
    document.body.append(root)
    const rect = (left: number, top: number) => ({ x: left, y: top, left, top, right: left + 100, bottom: top + 160, width: 100, height: 160, toJSON: () => ({}) })
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(0, 0))
    vi.spyOn(root.querySelector<HTMLElement>('.tarot-deck-back')!, 'getBoundingClientRect').mockReturnValue(rect(10, 20))
    root.querySelectorAll<HTMLElement>('.tarot-card-visual').forEach((target, index) => { vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(100 + index * 120, 300)) })
    return root
  }

  it.each([0, 1, 2])('flies from the deck to marked slot %s and cleans the overlay before revealing', async slot => {
    const root = fixture()
    const { animate, restore } = installAnimate(() => {
      const animation: Pick<Animation, 'finished' | 'cancel'> = { finished: Promise.resolve<Animation>(undefined!), cancel: vi.fn() }
      return animation as Animation
    })
    try {
      await Effect.runPromise(moveTarotCardToSlot(4, slot))
      expect(animate).toHaveBeenCalledOnce()
      const [frames] = animate.mock.calls[0]!
      expect(frames).toEqual([
        { transform: 'translate(0px, 0px) rotate(-3deg) scale(1)' },
        { transform: `translate(${90 + slot * 120}px, 280px) rotate(0deg) scale(1, 1)` },
      ])
      const overlay = animate.mock.contexts[0] as HTMLElement
      expect(overlay.querySelector(`[id="tarot-flight-4-${slot}-deck-ground"]`)).not.toBeNull()
      expect(overlay.querySelector('path')?.getAttribute('fill')).toBe(`url(#tarot-flight-4-${slot}-deck-ground)`)
      expect(root.querySelector('.tarot-slot-flight')).toBeNull()
    } finally { root.remove(); restore() }
  })

  it('settles immediately with missing DOM, reduced motion or unsupported animation', async () => {
    await Effect.runPromise(moveTarotCardToSlot(4, 0))
    const root = fixture()
    const reduced: MediaQueryList = { matches: true, media: '(prefers-reduced-motion: reduce)', onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true }
    const media = vi.spyOn(window, 'matchMedia').mockReturnValue(reduced)
    try { await Effect.runPromise(moveTarotCardToSlot(4, 0)); expect(root.querySelector('.tarot-slot-flight')).toBeNull() } finally { media.mockRestore() }
    const { restore } = installAnimate(() => { throw new Error('Animation unavailable') })
    try { await Effect.runPromise(moveTarotCardToSlot(4, 0)); expect(root.querySelector('.tarot-slot-flight')).toBeNull() } finally { root.remove(); restore() }
  })

  it('cleans an ongoing flight after a mode change or interruption', async () => {
    const root = fixture()
    const cancel = vi.fn()
    const animation: Pick<Animation, 'finished' | 'cancel'> = { finished: new Promise<Animation>(() => {}), cancel }
    const { restore } = installAnimate(() => animation as Animation)
    const fiber = Effect.runFork(moveTarotCardToSlot(4, 1))
    try {
      await tick()
      expect(root.querySelector('.tarot-slot-flight')).not.toBeNull()
      root.dataset.tarotToken = '5'
      await tick()
      await Effect.runPromise(Fiber.join(fiber))
      expect(root.querySelector('.tarot-slot-flight')).toBeNull()
      expect(cancel).toHaveBeenCalledOnce()
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)); root.remove(); restore() }
  })
})
