import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Bubbles from './bubbles'

const resolvePop = [{ name: 'PlayPop' }, Bubbles.SoundPlayed()] as const
const resolveChime = [{ name: 'PlayChime' }, Bubbles.SoundPlayed()] as const
const resolveSpeak = [{ name: 'Speak' }, Bubbles.SoundPlayed()] as const
const resolveAnim = [{ name: 'bubblesAnim' }, Bubbles.SoundPlayed()] as const
const resolveColorSelector = [{ name: 'colorSelector' }, Bubbles.ClickedColor({ color: '', duration: 0 })] as const

const captureBubbleSpeech = async (language: string): Promise<string[]> => {
  const originalSpeechSynthesis = globalThis.speechSynthesis
  const originalUtterance = globalThis.SpeechSynthesisUtterance
  const spoken: string[] = []

  globalThis.speechSynthesis = {
    getVoices: () => [],
    cancel: () => {},
    speak: (utterance: SpeechSynthesisUtterance) => { spoken.push(utterance.text) },
  } as unknown as SpeechSynthesis
  globalThis.SpeechSynthesisUtterance = class MockUtterance {
    text: string
    rate = 1
    pitch = 1
    lang = 'en'
    voice: SpeechSynthesisVoice | null = null
    constructor(text: string) { this.text = text }
  } as unknown as typeof SpeechSynthesisUtterance

  try {
    const [, commands] = Bubbles.update(
      { ...Bubbles.init(), shapeMode: true, selectedShape: 'circle' },
      Bubbles.ClickedColor({ color: '#FF4757', duration: 500 }),
      false,
      language,
    )
    const speakCommand = commands.find(command => command.name === 'Speak')
    if (!speakCommand) throw new Error('missing Speak command')
    await Effect.runPromise(speakCommand.effect)
    return spoken
  } finally {
    globalThis.speechSynthesis = originalSpeechSynthesis
    globalThis.SpeechSynthesisUtterance = originalUtterance
  }
}

describe('Bubbles', () => {
  it('init creates empty state', () => {
    const model = Bubbles.init()
    expect(model.bubbles).toHaveLength(0)
    expect(model.score).toBe(0)
    expect(model.nextId).toBe(0)
    expect(model.shapeMode).toBe(false)
    expect(model.selectedShape).toBe('circle')
    expect(model.shapePage).toBe(0)
  })

  it('defines the original, irregular, and regular shape pages', () => {
    expect(Bubbles.SHAPE_PAGES).toStrictEqual([
      ['circle', 'star', 'heart', 'triangle', 'oval'],
      ['semicircle', 'donut', 'rectangle', 'diamond', 'trapezoid'],
      ['square', 'pentagon', 'hexagon', 'heptagon', 'octagon'],
    ])
  })

  it('cycles through shape pages without changing the selected shape', () => {
    Story.story(
      Bubbles.update,
      Story.with({ ...Bubbles.init(), shapeMode: true, selectedShape: 'heart' }),
      Story.message(Bubbles.NextShapePage()),
      Story.model((model) => {
        expect(model.shapePage).toBe(1)
        expect(model.selectedShape).toBe('heart')
      }),
      Story.Command.expectNone(),
      Story.message(Bubbles.NextShapePage()),
      Story.model((model) => {
        expect(model.shapePage).toBe(2)
        expect(model.selectedShape).toBe('heart')
      }),
      Story.Command.expectNone(),
      Story.message(Bubbles.NextShapePage()),
      Story.model((model) => {
        expect(model.shapePage).toBe(0)
        expect(model.selectedShape).toBe('heart')
      }),
      Story.Command.expectNone(),
    )
  })

  it('keeps native activation for each shape choice', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ ...Bubbles.init(), shapeMode: true }),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.click(Scene.text('Star')),
      Scene.expect(Scene.selector('.shape-btn--active')).toHaveText('Star'),
      Scene.click(Scene.text('Heart')),
      Scene.expect(Scene.selector('.shape-btn--active')).toHaveText('Heart'),
      Scene.Command.expectNone(),
    )
  })

  it('uses a newly selected shape for the next bubble', () => {
    Story.story(
      Bubbles.update,
      Story.with({ ...Bubbles.init(), shapeMode: true, shapePage: 1 }),
      Story.message(Bubbles.SetSelectedShape({ value: 'diamond' })),
      Story.model((model) => {
        expect(model.selectedShape).toBe('diamond')
      }),
      Story.Command.expectNone(),
      Story.message(Bubbles.ClickedColor({ color: '#FF4757', duration: 500 })),
      Story.model((model) => {
        expect(model.bubbles[0]?.shape).toBe('diamond')
      }),
      Story.Command.resolveAll(resolveChime, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('speaks colors and shapes in each language\'s word order', async () => {
    const expectedByLanguage = {
      en: 'red circle',
      zh: '红色 圓形',
      fr: 'cercle rouge',
      de: 'rot kreis',
      fa: 'دایره قرمز',
      ms: 'bulat merah',
      'zh-HK': '紅色 圓形',
      ja: 'あか まる',
    } as const

    for (const [language, expected] of Object.entries(expectedByLanguage)) {
      expect(await captureBubbleSpeech(language), language).toStrictEqual([expected])
    }
  })

  for (const [shapePage, labels] of [
    [0, ['Circle', 'Star', 'Heart', 'Triangle', 'Oval']],
    [1, ['Semicircle', 'Donut', 'Rectangle', 'Diamond', 'Trapezoid']],
    [2, ['Square', 'Pentagon', 'Hexagon', 'Heptagon', 'Octagon']],
  ] as const) {
    it(`renders the five choices and Next button on shape page ${shapePage + 1}`, () => {
      Scene.scene(
        { update: Bubbles.update, view: Bubbles.view },
        Scene.with({ ...Bubbles.init(), shapeMode: true, shapePage }),
        ...labels.map(label => Scene.expect(Scene.text(label)).toExist()),
        Scene.expect(Scene.text('Next ➡')).toExist(),
        Scene.expectAll(Scene.all.selector('.shape-btn')).toHaveCount(6),
        Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
        Scene.Command.resolveAll(resolveChime, resolveSpeak),
        Scene.Command.expectNone(),
      )
    })
  }

  it('init includes selectedColor', () => {
    const model = Bubbles.init()
    expect(model.selectedColor).toBe('')
    expect(model.rainbowMode).toBe(false)
  })

  it('ClickedColor with hex creates a bubble of that color', () => {
    Story.story(
      Bubbles.update,
      Story.with(Bubbles.init()),
      Story.message(Bubbles.ClickedColor({ color: '#FF6B6B', duration: 500 })),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(1)
        expect(model.bubbles[0]?.color).toBe('#FF6B6B')
        expect(model.bubbles[0]?.popped).toBe(false)
        expect(model.bubbles[0]?.size).toBeGreaterThanOrEqual(10)
        expect(model.selectedColor).toBe('#FF6B6B')
        expect(model.rainbowMode).toBe(false)
      }),
      Story.Command.resolveAll(resolveChime, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('ClickedColor with rainbow creates a rainbow-gradient bubble', () => {
    Story.story(
      Bubbles.update,
      Story.with(Bubbles.init()),
      Story.message(Bubbles.ClickedColor({ color: 'rainbow', duration: 500 })),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(1)
        expect(model.bubbles[0]?.color).toContain('linear-gradient')
        expect(model.selectedColor).toBe('rainbow')
        expect(model.rainbowMode).toBe(true)
      }),
      Story.Command.resolveAll(resolveChime, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('ClickedColor duration affects bubble size', () => {
    Story.story(
      Bubbles.update,
      Story.with(Bubbles.init()),
      Story.message(Bubbles.ClickedColor({ color: '#4ECDC4', duration: 2000 })),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(1)
        expect(model.bubbles[0]?.size).toBeGreaterThan(100)
      }),
      Story.Command.resolveAll(resolveChime, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('pop a bubble by id', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: false, size: 20 }
    Story.story(
      Bubbles.update,
      Story.with({ ...Bubbles.init(), bubbles: [bubble], score: 0, nextId: 1 }),
      Story.message(Bubbles.ClickedPop({ id: 1 })),
      Story.model((model) => {
        expect(model.bubbles[0]?.popped).toBe(true)
        expect(model.score).toBe(1)
      }),
      Story.Command.resolveAll(resolvePop),
      Story.Command.expectNone(),
    )
  })

  it('reset pops bubbles sequentially before clearing them', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: false, size: 20, shape: 'circle' }
    const [clearing, commands] = Bubbles.update({ ...Bubbles.init(), bubbles: [bubble], score: 3, nextId: 1 }, Bubbles.ClickedReset())
    expect(clearing.bubbles).toStrictEqual([bubble])
    expect(clearing.score).toBe(0)
    expect(clearing.nextId).toBe(1)
    expect(commands.map((command) => command.name)).toStrictEqual(['ClearBubble', 'FinishClearing'])

    const popped = Bubbles.update(clearing, Bubbles.ClearBubble({ id: 1 }), true)[0]
    expect(popped.bubbles[0]?.popped).toBe(true)

    const completed = Bubbles.update(popped, Bubbles.ClearCompleted({ ids: [1] }), true)[0]
    expect(completed.bubbles).toHaveLength(0)
  })

  it('reset is no-op when already empty', () => {
    Story.story(
      Bubbles.update,
      Story.with(Bubbles.init()),
      Story.message(Bubbles.ClickedReset()),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(0)
        expect(model.score).toBe(0)
      }),
      Story.Command.expectNone(),
    )
  })

  it('renders hint when empty', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with(Bubbles.init()),
      Scene.expect(Scene.text('Bubbles!')).toExist(),
      Scene.expect(Scene.text('Tap "Add Bubble" to start!')).toExist(),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('renders bubble after adding', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: false, size: 20 }
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ ...Bubbles.init(), bubbles: [bubble], score: 0, nextId: 1 }),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('shows done message when all popped', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: true, size: 20 }
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ ...Bubbles.init(), bubbles: [bubble], score: 1, nextId: 1 }),
      Scene.expect(Scene.text('All popped! Add more!')).toExist(),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('shows Clear button when bubbles exist', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ ...Bubbles.init(), bubbles: [{ id: 1, color: '#FF6B6B', popped: false, size: 20 }], score: 0, nextId: 1 }),
      Scene.expect(Scene.text('Clear')).toExist(),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('shows Clear button even when empty', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with(Bubbles.init()),
      Scene.expect(Scene.text('Clear')).toExist(),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('shows Clear button when score > 0 even with no bubbles', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ ...Bubbles.init(), bubbles: [], score: 3, nextId: 3 }),
      Scene.expect(Scene.text('Clear')).toExist(),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('popping one bubble does not affect other bubbles in the model', () => {
    const b1 = { id: 1, color: '#FF6B6B', popped: false, size: 20, shape: 'circle' }
    const b2 = { id: 2, color: '#4ECDC4', popped: false, size: 20, shape: 'circle' }
    const b3 = { id: 3, color: '#FFE66D', popped: false, size: 20, shape: 'circle' }
    Story.story(
      Bubbles.update,
      Story.with({ ...Bubbles.init(), bubbles: [b1, b2, b3], score: 0, nextId: 4 }),
      Story.message(Bubbles.ClickedPop({ id: 2 })),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(3)
        expect(model.bubbles[0]).toStrictEqual({ ...b1 })
        expect(model.bubbles[1]).toStrictEqual({ ...b2, popped: true })
        expect(model.bubbles[2]).toStrictEqual({ ...b3 })
        expect(model.score).toBe(1)
      }),
      Story.Command.resolveAll(resolvePop),
      Story.Command.expectNone(),
    )
  })

  it('sequential pop and add preserves unpopped bubbles', () => {
    const b1 = { id: 1, color: '#FF6B6B', popped: false, size: 20, shape: 'circle' }
    const next = Bubbles.update({ ...Bubbles.init(), bubbles: [b1], score: 0, nextId: 2 }, Bubbles.ClickedColor({ color: '#4ECDC4', duration: 500 }), false)[0]
    expect(next.bubbles).toHaveLength(2)
    const afterPop = Bubbles.update(next, Bubbles.ClickedPop({ id: 1 }), false)[0]
    expect(afterPop.bubbles).toHaveLength(2)
    expect(afterPop.bubbles[0]?.popped).toBe(true)
    expect(afterPop.bubbles[1]?.popped).toBe(false)
    expect(afterPop.bubbles[1]?.id).toBe(2)
  })

  it('SoundPlayed leaves model unchanged', () => {
    const model = { ...Bubbles.init(), bubbles: [{ id: 1, color: '#FF6B6B', popped: false, size: 20, shape: 'circle' }], score: 2, nextId: 2 }
    Story.story(
      Bubbles.update,
      Story.with(model),
      Story.message(Bubbles.SoundPlayed()),
      Story.model((m) => {
        expect(m).toStrictEqual(model)
      }),
      Story.Command.expectNone(),
    )
  })

  it('renders color selector buttons', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with(Bubbles.init()),
      Scene.expect(Scene.text('🌈')).toExist(),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })
})

describe('Bubbles sweeping contacts', () => {
  const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
  const pointer = (target: EventTarget, type: string, id: number, x = 20, pointerType = 'touch', button = 0, buttons = 1, timeStamp?: number): void => {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: x, clientY: 20, button, buttons })
    if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    target.dispatchEvent(event)
  }
  const touch = (target: EventTarget, type: string, id: number, x = 20, timeStamp?: number): void => {
    const point = { identifier: id, target, clientX: x, clientY: 20 }
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'changedTouches', { value: { length: 1, item: (index: number) => index === 0 ? point : null } })
    if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    target.dispatchEvent(event)
  }
  const fixture = async (run: (bubbles: HTMLElement[], outside: HTMLElement, messages: Bubbles.Message[], stop: () => Promise<void>) => Promise<void>): Promise<void> => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="bubble" data-id="1"></div><div class="bubble" data-id="2"></div><div class="bubble" data-id="3"></div>'
    const outside = document.createElement('button')
    document.body.append(root, outside)
    const bubbles = [...root.querySelectorAll<HTMLElement>('.bubble')]
    vi.spyOn(document, 'elementFromPoint').mockImplementation(x => bubbles[x < 50 ? 0 : x < 100 ? 1 : 2]!)
    const messages: Bubbles.Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(Bubbles.mountBubbleSweep(root), message => Effect.sync(() => { messages.push(message) })))
    const stop = (): Promise<void> => Effect.runPromise(Fiber.interrupt(fiber)).then(() => {})
    try { await tick(); await run(bubbles, outside, messages, stop) }
    finally { await stop(); vi.restoreAllMocks(); root.remove(); outside.remove() }
  }

  it('does not let another held finger enable hover or secondary-button popping', async () => {
    await fixture(async (bubbles, outside, messages) => {
      pointer(outside, 'pointerdown', 1)
      pointer(bubbles[0]!, 'pointermove', 2, 20, 'mouse', 0, 0)
      pointer(bubbles[0]!, 'pointermove', 3, 20, 'pen', 0, 0)
      pointer(bubbles[0]!, 'pointerdown', 4, 20, 'mouse', 2, 2)
      pointer(bubbles[1]!, 'pointermove', 4, 80, 'mouse', 2, 2)
      await tick()
      expect(messages).toEqual([])
      pointer(document, 'pointermove', 1, 80)
      pointer(bubbles[0]!, 'pointerdown', 5, 20, 'mouse')
      pointer(bubbles[2]!, 'pointermove', 5, 120, 'mouse', 0, 0)
      await tick()
      expect(messages).toEqual([Bubbles.ClickedPop({ id: 2 }), Bubbles.ClickedPop({ id: 1 })])
    })
  })

  it('pops immediately and sweeps native Touch-only contacts after their starting bubble is removed', async () => {
    await fixture(async (bubbles, outside, messages) => {
      const first = bubbles[0]!
      touch(first, 'touchstart', 1)
      await tick()
      expect(messages).toEqual([Bubbles.ClickedPop({ id: 1 })])
      first.remove()
      touch(first, 'touchmove', 1, 80)
      touch(first, 'touchend', 1, 80)
      touch(first, 'touchmove', 1, 120)
      touch(outside, 'touchstart', 2)
      touch(outside, 'touchmove', 2, 120)
      touch(outside, 'touchend', 2, 120)
      await tick()
      expect(messages).toEqual([Bubbles.ClickedPop({ id: 1 }), Bubbles.ClickedPop({ id: 2 }), Bubbles.ClickedPop({ id: 3 })])
    })
  })

  it('stops mouse and pen sweeping after primary release while a secondary button remains held', async () => {
    await fixture(async (_bubbles, outside, messages) => {
      pointer(outside, 'pointerdown', 1, 20, 'mouse')
      pointer(document, 'pointermove', 1, 20, 'mouse', -1, 2)
      pointer(outside, 'pointerdown', 2, 80, 'pen')
      pointer(document, 'pointermove', 2, 80, 'pen', -1, 2)
      await tick()
      expect(messages).toEqual([])
      pointer(outside, 'pointerdown', 3)
      pointer(document, 'pointermove', 3, 120, 'touch', 0, 0)
      await tick()
      expect(messages).toEqual([Bubbles.ClickedPop({ id: 3 })])
    })
  })

  for (const interruption of ['blur', 'hidden'] as const) {
    it(`keeps cancellation per finger and clears all contacts on ${interruption}`, async () => {
      await fixture(async (bubbles, outside, messages) => {
        pointer(outside, 'pointerdown', 1)
        pointer(outside, 'pointerdown', 2)
        pointer(document, 'pointercancel', 1)
        pointer(bubbles[0]!, 'pointermove', 1)
        pointer(document, 'pointermove', 2, 80)
        if (interruption === 'blur') window.dispatchEvent(new Event('blur'))
        else {
          const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
          document.dispatchEvent(new Event('visibilitychange'))
          hidden.mockRestore()
        }
        pointer(document, 'pointermove', 2, 120)
        pointer(outside, 'pointerdown', 3)
        pointer(document, 'pointermove', 3, 120)
        await tick()
        expect(messages).toEqual([Bubbles.ClickedPop({ id: 2 }), Bubbles.ClickedPop({ id: 3 })])
      })
    })
  }

  it('pairs mixed streams in either order and retains a later pointer at the same point', async () => {
    await fixture(async (bubbles, outside, messages) => {
      touch(outside, 'touchstart', 1, 20, 100)
      pointer(outside, 'pointerdown', 7, 20, 'touch', 0, 1, 105)
      pointer(document, 'pointercancel', 7)
      touch(outside, 'touchmove', 1, 80)
      touch(outside, 'touchend', 1, 80)
      pointer(bubbles[0]!, 'pointerdown', 8, 20, 'touch', 0, 1, 200)
      touch(bubbles[0]!, 'touchstart', 2, 20, 205)
      pointer(document, 'pointerup', 8)
      touch(bubbles[0]!, 'touchmove', 2, 80)
      touch(bubbles[0]!, 'touchend', 2, 80)
      touch(outside, 'touchstart', 3, 20, 300)
      pointer(outside, 'pointerdown', 9, 20, 'touch', 0, 1, 500)
      touch(outside, 'touchcancel', 3)
      pointer(document, 'pointermove', 9, 120)
      await tick()
      expect(messages).toEqual([Bubbles.ClickedPop({ id: 1 }), Bubbles.ClickedPop({ id: 2 }), Bubbles.ClickedPop({ id: 3 })])
    })
  })

  it('cleans up document and detached native-target listeners on unmount', async () => {
    await fixture(async (bubbles, outside, messages, stop) => {
      touch(bubbles[0]!, 'touchstart', 1)
      bubbles[0]!.remove()
      pointer(outside, 'pointerdown', 2)
      await tick()
      await stop()
      touch(bubbles[0]!, 'touchmove', 1, 80)
      pointer(document, 'pointermove', 2, 120)
      pointer(bubbles[1]!, 'pointerdown', 3, 80)
      await tick()
      expect(messages).toEqual([Bubbles.ClickedPop({ id: 1 })])
    })
  })
})

describe('Bubbles color multitouch', () => {
  const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
  const touch = (button: HTMLElement, type: string, identifier: number, timeStamp?: number): Event => {
    const point = { identifier, target: button, clientX: 20, clientY: 20 } as unknown as Touch
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'changedTouches', { value: { length: 1, item: (index: number) => index === 0 ? point : null } })
    if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    button.dispatchEvent(event)
    return event
  }

  it('accepts pointer contacts after native touches and cancels capture loss and hidden charging', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<button class="color-btn" data-color="#FF4757"></button>'
    document.body.append(root)
    const button = root.querySelector<HTMLElement>('button')!
    const messages: Bubbles.Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(Bubbles.mountColorSelector(root), message => Effect.sync(() => { messages.push(message) })))
    const pointer = (type: string, id: number, pointerType = 'touch'): void => {
      button.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, button: 0, clientX: 20, clientY: 20 }))
    }
    try {
      await tick()
      touch(button, 'touchstart', 1)
      touch(button, 'touchend', 1)
      pointer('pointerdown', 7)
      pointer('pointerup', 7)
      await tick()
      expect(messages).toHaveLength(2)
      pointer('pointerdown', 8, 'pen')
      pointer('lostpointercapture', 8, 'pen')
      pointer('pointerup', 8, 'pen')
      touch(button, 'touchstart', 2)
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
      document.dispatchEvent(new Event('visibilitychange'))
      touch(button, 'touchend', 2)
      await tick()
      expect(messages).toHaveLength(2)
      expect(button.classList.contains('color-btn--charging')).toBe(false)
      expect(button.style.getPropertyValue('--charge-pct')).toBe('')
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      vi.restoreAllMocks()
      root.remove()
    }
  })

  it('pairs native-first color presses without duplicate pops or stealing later fingers', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<button class="color-btn" data-color="#FF4757"></button>'
    document.body.append(root)
    const button = root.querySelector<HTMLElement>('button')!
    const nativeClick = vi.fn()
    button.addEventListener('click', nativeClick)
    const messages: Bubbles.Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(Bubbles.mountColorSelector(root), message => Effect.sync(() => { messages.push(message) })))
    const pointer = (type: string, id: number, timeStamp: number): void => {
      const event = new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', button: 0, clientX: 20, clientY: 20 })
      Object.defineProperty(event, 'timeStamp', { value: timeStamp })
      button.dispatchEvent(event)
    }
    try {
      await tick()
      touch(button, 'touchstart', 1, 100)
      pointer('pointerdown', 7, 110)
      pointer('pointercancel', 7, 200)
      touch(button, 'touchend', 1, 210)
      await tick()
      expect(messages).toEqual([])
      touch(button, 'touchstart', 2, 300)
      pointer('pointerdown', 8, 310)
      pointer('pointerup', 8, 400)
      pointer('lostpointercapture', 8, 410)
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
      expect(nativeClick).not.toHaveBeenCalled()
      touch(button, 'touchend', 2, 420)
      touch(button, 'touchstart', 3, 500)
      pointer('pointerdown', 9, 510)
      touch(button, 'touchend', 3, 600)
      pointer('pointerup', 9, 610)
      await tick()
      expect(messages).toHaveLength(2)
      pointer('pointerdown', 10, 700)
      touch(button, 'touchstart', 4, 900)
      pointer('pointerup', 10, 1000)
      touch(button, 'touchend', 4, 1100)
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 11, pointerType: 'pen', button: 2 }))
      button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11, pointerType: 'pen', button: 2 }))
      await tick()
      expect(messages).toHaveLength(4)
      expect(button.classList.contains('color-btn--charging')).toBe(false)
      button.addEventListener('pointerup', event => event.stopPropagation())
      button.addEventListener('touchend', event => event.stopPropagation())
      pointer('pointerdown', 12, 1300)
      pointer('pointerup', 12, 1400)
      touch(button, 'touchstart', 5, 1500)
      touch(button, 'touchend', 5, 1600)
      await tick()
      expect(messages).toHaveLength(6)
      expect(button.classList.contains('color-btn--charging')).toBe(false)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      root.remove()
    }
  })

  it('keeps the same color charging for another finger and cancels fingers without creating bubbles', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<button class="color-btn" data-color="#FF4757"></button>'
    document.body.append(root)
    const button = root.querySelector<HTMLElement>('button')!
    let now = 100
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    const messages: Bubbles.Message[] = []
    const nativeClick = vi.fn()
    button.addEventListener('click', nativeClick)
    const fiber = Effect.runFork(Stream.runForEach(Bubbles.mountColorSelector(root), message => Effect.sync(() => { messages.push(message) })))
    try {
      await tick()
      touch(button, 'touchstart', 1)
      now = 400
      touch(button, 'touchstart', 2)
      now = 600
      const end = touch(button, 'touchend', 1)
      await tick()
      expect(end.defaultPrevented).toBe(true)
      expect(messages).toEqual([Bubbles.ClickedColor({ color: '#FF4757', duration: 500 })])
      expect(button.classList.contains('color-btn--charging')).toBe(true)
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
      expect(nativeClick).not.toHaveBeenCalled()
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }))
      expect(nativeClick).toHaveBeenCalledOnce()
      touch(button, 'touchcancel', 2)
      touch(button, 'touchend', 1)
      await tick()
      expect(messages).toHaveLength(1)
      expect(button.classList.contains('color-btn--charging')).toBe(false)
      expect(button.style.getPropertyValue('--charge-pct')).toBe('')
      touch(button, 'touchstart', 3)
      await Effect.runPromise(Fiber.interrupt(fiber))
      expect(button.classList.contains('color-btn--charging')).toBe(false)
      touch(button, 'touchend', 3)
      await tick()
      expect(messages).toHaveLength(1)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      clock.mockRestore()
      root.remove()
    }
  })

  for (const nativeTouch of [false, true]) {
    it(`keeps touch charging with a TouchEvent constructor${nativeTouch ? ' and adopts native touches once' : ' and pointer-only delivery'}`, async () => {
      vi.stubGlobal('TouchEvent', class {})
      const root = document.createElement('div')
      root.innerHTML = '<button class="color-btn" data-color="#FF4757"></button>'
      document.body.append(root)
      const button = root.querySelector<HTMLElement>('button')!
      let now = 100
      const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
      const messages: Bubbles.Message[] = []
      const nativeClick = vi.fn()
      button.addEventListener('click', nativeClick)
      const fiber = Effect.runFork(Stream.runForEach(Bubbles.mountColorSelector(root), message => Effect.sync(() => { messages.push(message) })))
      const pointer = (type: string, pointerId: number, pointerType = 'touch'): void => {
        button.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType, button: 0, clientX: 20, clientY: 20 }))
      }
      try {
        await tick()
        pointer('pointerdown', 7)
        now = 120
        if (nativeTouch) touch(button, 'touchstart', 3)
        now = 600
        pointer('pointerup', 7)
        if (nativeTouch) touch(button, 'touchend', 3)
        await tick()
        expect(messages).toEqual([Bubbles.ClickedColor({ color: '#FF4757', duration: 500 })])
        expect(button.classList.contains('color-btn--charging')).toBe(false)
        const mouseClick = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
        Object.defineProperty(mouseClick, 'sourceCapabilities', { value: { firesTouchEvents: false } })
        button.dispatchEvent(mouseClick)
        expect(nativeClick).toHaveBeenCalledOnce()
        pointer('pointerdown', 8, 'mouse')
        now = 700
        pointer('pointerup', 8, 'mouse')
        const duplicateClick = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
        Object.defineProperty(duplicateClick, 'sourceCapabilities', { value: { firesTouchEvents: false } })
        button.dispatchEvent(duplicateClick)
        await tick()
        expect(messages).toHaveLength(2)
        expect(nativeClick).toHaveBeenCalledOnce()
      } finally {
        await Effect.runPromise(Fiber.interrupt(fiber))
        clock.mockRestore()
        vi.unstubAllGlobals()
        root.remove()
      }
    })
  }
})

describe('Bubbles global state', () => {
  it('pop by id works correctly', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: false, size: 20 }
    Story.story(
      Bubbles.update,
      Story.with({ ...Bubbles.init(), bubbles: [bubble], score: 0, nextId: 1 }),
      Story.message(Bubbles.ClickedPop({ id: 1 })),
      Story.model((model) => {
        expect(model.bubbles[0]?.popped).toBe(true)
        expect(model.score).toBe(1)
      }),
      Story.Command.resolveAll(resolvePop),
      Story.Command.expectNone(),
    )
  })

  it('reset clears both previously and newly popped bubbles', () => {
    const b1 = { id: 1, color: '#FF6B6B', popped: true, size: 20, shape: 'circle' }
    const b2 = { id: 2, color: '#4ECDC4', popped: false, size: 20, shape: 'circle' }
    const [clearing] = Bubbles.update({ ...Bubbles.init(), bubbles: [b1, b2], score: 3, nextId: 2 }, Bubbles.ClickedReset())
    expect(clearing.score).toBe(0)

    const popped = Bubbles.update(clearing, Bubbles.ClearBubble({ id: 2 }), true)[0]
    const completed = Bubbles.update(popped, Bubbles.ClearCompleted({ ids: [1, 2] }), true)[0]
    expect(completed.bubbles).toHaveLength(0)
  })
})
