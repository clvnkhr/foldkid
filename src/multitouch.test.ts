import { Effect, Fiber, Stream } from 'effect'
import { html } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { multitouchClickStream, withMultitouchClicks } from './multitouch'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
type Contact = { identifier: number; target: EventTarget; clientX: number; clientY: number }
const contact = (identifier: number, target: EventTarget, clientX = 20, clientY = 20): Contact => ({ identifier, target, clientX, clientY })
const touch = (type: string, changedTouches: Contact[], nativeList = false, timeStamp?: number): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const list = nativeList ? { length: changedTouches.length, item: (index: number) => changedTouches[index] ?? null } : changedTouches
  Object.defineProperty(event, 'changedTouches', { value: list })
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  changedTouches[0]?.target.dispatchEvent(event)
  return event
}
const pointer = (type: string, target: EventTarget, pointerId: number, clientX = 20, timeStamp?: number): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerId: { value: pointerId }, pointerType: { value: 'touch' }, button: { value: 0 },
    clientX: { value: clientX }, clientY: { value: 20 }, isPrimary: { value: pointerId === 1 },
  })
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  target.dispatchEvent(event)
  return event
}

describe('multitouch activation', () => {
  afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren() })

  const fixture = async (run: (a: HTMLButtonElement, b: HTMLButtonElement, clicks: string[]) => Promise<void>): Promise<void> => {
    const root = document.createElement('div')
    root.innerHTML = '<button data-multitouch-click>A<span>icon</span></button><button data-multitouch-click>B</button>'
    document.body.appendChild(root)
    const [a, b] = root.querySelectorAll('button')
    if (!a || !b) throw new Error('missing buttons')
    vi.spyOn(document, 'elementFromPoint').mockImplementation(x => x < 50 ? a : b)
    const clicks: string[] = []
    a.addEventListener('click', () => clicks.push('A'))
    b.addEventListener('click', () => clicks.push('B'))
    const fiber = Effect.runFork(Stream.runDrain(multitouchClickStream(root)))
    await flush()
    try { await run(a, b, clicks) } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  }

  it('activates each finger independently while another finger remains down', async () => {
    await fixture(async (a, b, clicks) => {
      const held = contact(1, a)
      const other = contact(2, b, 80)
      touch('touchstart', [held])
      touch('touchstart', [other])
      expect(touch('touchend', [other]).defaultPrevented).toBe(true)
      expect(clicks).toEqual(['B'])
      touch('touchstart', [contact(3, b, 80)])
      touch('touchend', [contact(3, b, 80)])
      touch('touchend', [held])
      expect(clicks).toEqual(['B', 'B', 'A'])
    })
  })

  it('handles two fingers lifting from the same button in one native event', async () => {
    await fixture(async (a, _b, clicks) => {
      const fingers = [contact(3, a), contact(4, a)]
      touch('touchstart', fingers)
      touch('touchend', fingers)
      expect(clicks).toEqual(['A', 'A'])
    })
  })

  it('supports native TouchLists without an iterator or indexed properties', async () => {
    await fixture(async (a, b, clicks) => {
      const first = contact(1, a)
      const second = contact(2, b, 80)
      touch('touchstart', [first, second], true)
      touch('touchmove', [contact(1, a, 40)], true)
      touch('touchend', [second], true)
      touch('touchcancel', [first], true)
      expect(clicks).toEqual(['B'])
      touch('touchstart', [contact(3, a)], true)
      touch('touchend', [contact(3, a)], true)
      expect(clicks).toEqual(['B', 'A'])
    })
  })

  it('uses every pointer on devices without native touch events', async () => {
    await fixture(async (a, b, clicks) => {
      pointer('pointerdown', a, 1)
      pointer('pointerdown', b, 2, 80)
      pointer('pointerup', b, 2, 80)
      pointer('pointerup', a, 1)
      expect(clicks).toEqual(['B', 'A'])
    })
  })

  it('deduplicates native touch, pointer and compatibility click events', async () => {
    await fixture(async (a, _b, clicks) => {
      const finger = contact(4, a)
      pointer('pointerdown', a, 7)
      touch('touchstart', [finger])
      pointer('pointerup', a, 7)
      touch('touchend', [finger])
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
      expect(clicks).toEqual(['A'])
      // Keyboard and assistive clicks remain available even immediately after touch.
      a.click()
      expect(clicks).toEqual(['A', 'A'])
    })
  })

  for (const nativeEndFirst of [false, true]) {
    it(`pairs touchstart before pointerdown with ${nativeEndFirst ? 'native' : 'pointer'} release first`, async () => {
      await fixture(async (a, b, clicks) => {
        touch('touchstart', [contact(4, a)], false, 100)
        pointer('pointerdown', a, 7, 20, 105)
        pointer('pointerdown', b, 8, 80, 110)
        pointer('pointerup', b, 8, 80, 120)
        expect(clicks).toEqual(['B'])
        if (nativeEndFirst) {
          touch('touchend', [contact(4, a)], false, 130)
          pointer('pointerup', a, 7, 20, 130)
        } else {
          pointer('pointerup', a, 7, 20, 130)
          a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
          expect(clicks).toEqual(['B'])
          touch('touchend', [contact(4, a)], false, 130)
        }
        a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
        expect(clicks).toEqual(['B', 'A'])
      })
    })
  }

  for (const cancelledStream of ['pointer', 'touch'] as const) {
    it(`cancels one reverse-order contact through the ${cancelledStream} stream without a late tap`, async () => {
      await fixture(async (a, b, clicks) => {
        touch('touchstart', [contact(4, a)], false, 100)
        pointer('pointerdown', a, 7, 20, 105)
        pointer('pointerdown', b, 8, 80, 110)
        if (cancelledStream === 'pointer') {
          pointer('pointercancel', a, 7, 20, 120)
          touch('touchend', [contact(4, a)], false, 130)
        } else {
          touch('touchcancel', [contact(4, a)], false, 120)
          pointer('pointerup', a, 7, 20, 130)
        }
        a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
        pointer('pointerup', b, 8, 80, 130)
        expect(clicks).toEqual(['B'])
        pointer('pointerdown', a, 7, 20, 200)
        pointer('pointerup', a, 7, 20, 210)
        expect(clicks).toEqual(['B', 'A'])
      })
    })
  }

  for (const nativeStartFirst of [false, true]) {
    it(`preserves a later finger at the same point when ${nativeStartFirst ? 'native' : 'pointer'} starts first`, async () => {
      await fixture(async (a, _b, clicks) => {
        if (nativeStartFirst) {
          touch('touchstart', [contact(4, a)], false, 100)
          pointer('pointerdown', a, 7, 20, 200)
        } else {
          pointer('pointerdown', a, 7, 20, 100)
          touch('touchstart', [contact(4, a)], false, 200)
        }
        pointer('pointerup', a, 7, 20, 300)
        touch('touchend', [contact(4, a)], false, 310)
        expect(clicks).toEqual(['A', 'A'])
      })
    })
  }

  it('associates only one pointer with each native contact and releases aliases before pointer ID reuse', async () => {
    await fixture(async (a, _b, clicks) => {
      touch('touchstart', [contact(4, a)], false, 100)
      pointer('pointerdown', a, 7, 20, 105)
      pointer('pointerdown', a, 8, 20, 105)
      pointer('pointerup', a, 8, 20, 120)
      pointer('pointerup', a, 7, 20, 120)
      pointer('pointerdown', a, 7, 20, 200)
      touch('touchstart', [contact(5, a)], false, 205)
      touch('touchend', [contact(4, a)], false, 210)
      pointer('pointercancel', a, 7, 20, 220)
      touch('touchend', [contact(5, a)], false, 220)
      expect(clicks).toEqual(['A', 'A'])
    })
  })

  it('keeps scrolling cancellation when native movement precedes its matching pointerdown', async () => {
    await fixture(async (a, _b, clicks) => {
      touch('touchstart', [contact(4, a)], false, 100)
      touch('touchmove', [contact(4, a, 40)], false, 105)
      pointer('pointerdown', a, 7, 40, 110)
      pointer('pointerup', a, 7, 40, 120)
      touch('touchend', [contact(4, a, 40)], false, 120)
      expect(clicks).toEqual([])
    })
  })

  it('preserves keyboard and genuine mouse clicks while a touch is still pending', async () => {
    await fixture(async (a, _b, clicks) => {
      touch('touchstart', [contact(4, a)])
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
      expect(clicks).toEqual([])
      a.click()
      a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }))
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
      const mouseClick = new MouseEvent('click', { bubbles: true, detail: 1 })
      Object.defineProperty(mouseClick, 'sourceCapabilities', { value: { firesTouchEvents: false } })
      a.dispatchEvent(mouseClick)
      touch('touchend', [contact(4, a)])
      expect(clicks).toEqual(['A', 'A', 'A', 'A'])
    })
  })

  it('keeps an unmatched pointer contact active when another finger uses native touch events', async () => {
    await fixture(async (a, b, clicks) => {
      pointer('pointerdown', a, 1)
      touch('touchstart', [contact(2, b, 80)])
      pointer('pointerup', a, 1)
      touch('touchend', [contact(2, b, 80)])
      expect(clicks).toEqual(['A', 'B'])
    })
  })

  it('preserves scrolling cancellation when native touch adopts a moved pointer', async () => {
    await fixture(async (a, _b, clicks) => {
      pointer('pointerdown', a, 1)
      pointer('pointermove', a, 1, 40)
      touch('touchstart', [contact(11, a, 40)])
      pointer('pointerup', a, 1, 40)
      touch('touchend', [contact(11, a, 40)])
      expect(clicks).toEqual([])
    })
  })

  it('does not restart a moved native contact on duplicate touchstart', async () => {
    await fixture(async (a, _b, clicks) => {
      touch('touchstart', [contact(1, a)])
      touch('touchmove', [contact(1, a, 40)])
      touch('touchstart', [contact(1, a, 40)])
      touch('touchend', [contact(1, a, 40)])
      expect(clicks).toEqual([])
    })
  })

  it('allows an actual mouse click immediately after a touch on the same button', async () => {
    await fixture(async (a, _b, clicks) => {
      touch('touchstart', [contact(1, a)])
      touch('touchend', [contact(1, a)])
      a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }))
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
      expect(clicks).toEqual(['A', 'A'])
    })
  })

  it('cancels only the affected finger, and never activates a scroll or slide', async () => {
    await fixture(async (a, b, clicks) => {
      const first = contact(1, a)
      const second = contact(2, b, 80)
      touch('touchstart', [first, second])
      touch('touchcancel', [first])
      touch('touchend', [second])
      touch('touchstart', [first])
      touch('touchmove', [contact(1, a, 40)])
      expect(touch('touchend', [first]).defaultPrevented).toBe(false)
      touch('touchstart', [first])
      touch('touchend', [contact(1, a, 80)])
      expect(clicks).toEqual(['B'])
    })
  })

  it('ignores disabled, removed and independently owned controls and drag handles', async () => {
    await fixture(async (a, b, clicks) => {
      const first = contact(1, a)
      const second = contact(2, b, 80)
      touch('touchstart', [first])
      a.disabled = true
      touch('touchend', [first])
      a.disabled = false
      a.setAttribute('data-multitouch-owned', 'true')
      touch('touchstart', [first])
      touch('touchend', [first])
      a.removeAttribute('data-multitouch-owned')
      const icon = a.querySelector('span')!
      icon.setAttribute('draggable', 'true')
      touch('touchstart', [contact(3, icon)])
      touch('touchend', [contact(3, icon)])
      const input = document.createElement('input')
      a.append(input)
      touch('touchstart', [contact(4, input)])
      touch('touchend', [contact(4, input)])
      touch('touchstart', [second])
      b.remove()
      touch('touchend', [second])
      expect(clicks).toEqual([])
    })
  })

  it('activates show/hide buttons inside draggable rows while another finger stays held', async () => {
    await fixture(async (a, b, clicks) => {
      for (const button of [a, b]) {
        const row = document.createElement('div')
        row.setAttribute('draggable', 'true')
        button.replaceWith(row)
        row.append(button)
      }
      const held = contact(1, a)
      const other = contact(2, b, 80)
      touch('touchstart', [held])
      touch('touchstart', [other])
      touch('touchend', [other])
      expect(clicks).toEqual(['B'])
      touch('touchend', [held])
      expect(clicks).toEqual(['B', 'A'])
    })
  })

  it('activates a draggable click target from its child without treating it as a drag handle', async () => {
    await fixture(async (a, b, clicks) => {
      a.setAttribute('draggable', 'true')
      const icon = a.querySelector('span')!
      pointer('pointerdown', b, 1, 80)
      pointer('pointerdown', icon, 2)
      pointer('pointerup', icon, 2)
      expect(clicks).toEqual(['A'])
      pointer('pointerup', b, 1, 80)
      expect(clicks).toEqual(['A', 'B'])
    })
  })

  for (const draggableAncestor of [false, true]) {
    it(`cancels native dragging of ${draggableAncestor ? 'an ancestor row' : 'a click target'} without canceling another finger`, async () => {
      await fixture(async (a, b, clicks) => {
        let dragged: HTMLElement = a
        if (draggableAncestor) {
          dragged = document.createElement('div')
          a.replaceWith(dragged)
          dragged.append(a)
        }
        dragged.setAttribute('draggable', 'true')
        const first = contact(1, a)
        const other = contact(2, b, 80)
        touch('touchstart', [first, other])
        const drag = new DragEvent('dragstart', { bubbles: true, cancelable: true })
        dragged.dispatchEvent(drag)
        expect(drag.defaultPrevented).toBe(false)
        touch('touchend', [first])
        a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
        expect(clicks).toEqual([])
        touch('touchend', [other])
        expect(clicks).toEqual(['B'])
        touch('touchstart', [contact(3, a)])
        touch('touchend', [contact(3, a)])
        expect(clicks).toEqual(['B', 'A'])
      })
    })
  }

  it('uses the current rendered click action after a state change', async () => {
    await fixture(async (a, _b, clicks) => {
      touch('touchstart', [contact(1, a)])
      a.addEventListener('click', () => clicks.push('current'))
      touch('touchend', [contact(1, a)])
      expect(clicks).toEqual(['A', 'current'])
    })
  })

  it('cleans up listeners and unfinished touches when interrupted', async () => {
    let button: HTMLButtonElement | undefined
    let observed: string[] = []
    await fixture(async (a, _b, clicks) => {
      button = a
      observed = clicks
      touch('touchstart', [contact(1, a)])
    })
    touch('touchend', [contact(1, button!)])
    expect(observed).toEqual([])
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    expect(observed).toEqual(['A'])
  })

  it('clears unfinished fingers when the window loses focus', async () => {
    await fixture(async (a, b, clicks) => {
      touch('touchstart', [contact(1, a), contact(2, b, 80)])
      window.dispatchEvent(new Event('blur'))
      touch('touchend', [contact(1, a), contact(2, b, 80)])
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
      expect(clicks).toEqual([])
      touch('touchstart', [contact(3, b, 80)])
      touch('touchend', [contact(3, b, 80)])
      expect(clicks).toEqual(['B'])
    })
  })

  it('suppresses a stale native compatibility click after hidden visibility, while keeping keyboard activation', async () => {
    await fixture(async (a, _b, clicks) => {
      touch('touchstart', [contact(1, a)])
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
      document.dispatchEvent(new Event('visibilitychange'))
      hidden.mockRestore()
      touch('touchend', [contact(1, a)])
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
      expect(clicks).toEqual([])
      a.click()
      expect(clicks).toEqual(['A'])
    })
  })

  it('rejects malformed contact IDs and invalid coordinates without querying the browser', async () => {
    await fixture(async (a, b, clicks) => {
      const hit = vi.mocked(document.elementFromPoint)
      pointer('pointerdown', a, Number.NaN)
      pointer('pointerdown', a, 1, Infinity)
      touch('touchstart', [contact(Number.NaN, a)])
      touch('touchstart', [contact(1, a, Number.NaN)])
      pointer('pointerup', a, 1)
      touch('touchend', [contact(1, a)])
      expect(hit).not.toHaveBeenCalled()
      pointer('pointerdown', a, 2)
      pointer('pointerup', a, 2, Number.NaN)
      touch('touchstart', [contact(3, a)])
      touch('touchmove', [contact(3, a, Infinity)])
      touch('touchend', [contact(3, a)])
      expect(hit).not.toHaveBeenCalled()
      expect(clicks).toEqual([])
      touch('touchstart', [contact(4, b, 80)])
      touch('touchend', [contact(4, b, 80)])
      expect(clicks).toEqual(['B'])
    })
  })

  it('marks click handlers throughout child views without changing click semantics', () => {
    type Model = { count: number }
    type Message = { _tag: 'Increment' }
    const h = html<Message>()
    Scene.scene<Model, Message>(
      {
        update: model => [{ count: model.count + 1 }, []],
        view: model => withMultitouchClicks(h.div([], [
          h.div([h.Class('child')], [h.button([h.OnClick({ _tag: 'Increment' })], [String(model.count)])]),
          h.button([h.Class('owned'), h.Attribute('data-multitouch-owned', 'true'), h.OnClick({ _tag: 'Increment' })], ['owned']),
        ])),
      },
      Scene.with({ count: 0 }),
      Scene.expect(Scene.selector('.child button')).toHaveAttr('data-multitouch-click', ''),
      Scene.expect(Scene.selector('.owned')).not.toHaveAttr('data-multitouch-click', ''),
      Scene.click(Scene.selector('.child button')),
      Scene.expect(Scene.text('1')).toExist(),
      Scene.Command.expectNone(),
    )
  })
})
