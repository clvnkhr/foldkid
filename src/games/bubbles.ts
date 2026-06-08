import { Effect, Match as M, Option as O, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { pop, chime, swoosh } from '../audio'
import { t, tf } from '../i18n'

const Bubble = S.Struct({ id: S.Number, color: S.String, popped: S.Boolean, size: S.Number })
type Bubble = typeof Bubble.Type

const COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94', '#95E1D3']

const randomColor = (): string => COLORS[Math.floor(Math.random() * COLORS.length)] as string

let isHolding = false
let holdStartTime = 0

export const Model = S.Struct({ bubbles: S.Array(Bubble), score: S.Number, nextId: S.Number, rainbowMode: S.Boolean, batchCount: S.Number, popLabel: S.Boolean })
export type Model = typeof Model.Type

export const ClickedPop = m('BubblesClickedPop', { id: S.Number })
export const ClickedReset = m('BubblesClickedReset')
export const SoundPlayed = m('BubblesSoundPlayed')
export const SetRainbowMode = m('BubblesSetRainbowMode', { value: S.Boolean })
export const SetBatchCount = m('BubblesSetBatchCount', { value: S.Number })
export const SetPopLabel = m('BubblesSetPopLabel', { value: S.Boolean })
export const AddReleased = m('BubblesAddReleased', { duration: S.Number })

export const Message = S.Union([ClickedPop, ClickedReset, SoundPlayed, SetRainbowMode, SetBatchCount, SetPopLabel, AddReleased])
export type Message = typeof Message.Type

export const init = (): Model => ({ bubbles: [], score: 0, nextId: 0, rainbowMode: false, batchCount: 1, popLabel: false })

const poof = (cx: number, cy: number, w: number, color: string, popLabelText: string): void => {
  const s = w / 16
  const count = Math.max(6, Math.floor(w / 8))
  const duration = 300 + w * 1.5

  // Center flash
  const flash = document.createElement('div')
  const flashSize = w * 2
  flash.style.cssText = [
    'position:fixed',
    `left:${cx - flashSize / 2}px`,
    `top:${cy - flashSize / 2}px`,
    `width:${flashSize}px`,
    `height:${flashSize}px`,
    'border-radius:50%',
    `background:radial-gradient(circle, rgba(255,255,255,0.7) 0%, ${color} 50%, transparent 70%)`,
    'pointer-events:none',
    'z-index:999',
  ].join(';')
  document.body.appendChild(flash)
  flash.animate([
    { transform: 'scale(0.3)', opacity: 0.8 },
    { transform: 'scale(1.5)', opacity: 0 },
  ], { duration: duration * 0.4, easing: 'ease-out', fill: 'forwards' })
    .onfinish = () => flash.remove()

  // Primary burst
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div')
    const ps = (3 + Math.random() * 5) * s
    const angle = Math.random() * Math.PI * 2
    const dist = (20 + Math.random() * 45) * s
    const drift = duration * 0.6 + Math.random() * duration * 0.4
    p.style.cssText = [
      `position:fixed`,
      `left:${cx - ps / 2}px`,
      `top:${cy - ps / 2}px`,
      `width:${ps}px`,
      `height:${ps}px`,
      `border-radius:50%`,
      `background:${color}`,
      `pointer-events:none`,
      `z-index:1000`,
    ].join(';')
    document.body.appendChild(p)
    p.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * dist}px,${Math.sin(angle) * dist}px) scale(0.15)`, opacity: 0 },
    ], { duration: drift, easing: 'ease-out', fill: 'forwards' })
      .onfinish = () => p.remove()
  }

  // Secondary splash — smaller, faster fragments
  const splashCount = Math.max(4, Math.floor(w / 12))
  for (let i = 0; i < splashCount; i++) {
    const p = document.createElement('div')
    const ps = (1.5 + Math.random() * 2.5) * s
    const angle = Math.random() * Math.PI * 2
    const dist = (30 + Math.random() * 50) * s
    const hueShift = Math.random() > 0.5 ? `rgba(255,255,255,0.6)` : color
    p.style.cssText = [
      `position:fixed`,
      `left:${cx - ps / 2}px`,
      `top:${cy - ps / 2}px`,
      `width:${ps}px`,
      `height:${ps}px`,
      `border-radius:50%`,
      `background:${hueShift}`,
      `pointer-events:none`,
      `z-index:1001`,
    ].join(';')
    document.body.appendChild(p)
    p.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * dist}px,${Math.sin(angle) * dist}px) scale(0.1)`, opacity: 0 },
    ], { duration: 150 + Math.random() * 100, easing: 'ease-out', fill: 'forwards' })
      .onfinish = () => p.remove()
  }

  // Sparkle particles
  for (let i = 0; i < 3; i++) {
    const sp = document.createElement('div')
    const sps = 4 + Math.random() * 4
    const angle = Math.random() * Math.PI * 2
    const dist = 40 + Math.random() * 50
    sp.style.cssText = [
      'position:fixed',
      `left:${cx - sps / 2}px`,
      `top:${cy - sps / 2}px`,
      `width:${sps}px`,
      `height:${sps}px`,
      'border-radius:50%',
      'background:white',
      'box-shadow:0 0 6px 2px rgba(255,255,255,0.8)',
      'pointer-events:none',
      'z-index:1002',
    ].join(';')
    document.body.appendChild(sp)
    sp.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * dist}px,${Math.sin(angle) * dist}px) scale(0.3)`, opacity: 0 },
    ], { duration: 250 + Math.random() * 200, easing: 'ease-out', fill: 'forwards' })
      .onfinish = () => sp.remove()
  }

  // Score popup or pop label
  if (popLabelText) {
    const popup = document.createElement('div')
    popup.textContent = popLabelText
    popup.style.cssText = [
      'position:fixed',
      `left:${cx - 15}px`,
      `top:${cy - 15}px`,
      'font-size:1.5rem',
      'font-weight:700',
      'color:#FFD700',
      'text-shadow:0 1px 3px rgba(0,0,0,0.4)',
      'pointer-events:none',
      'z-index:1003',
    ].join(';')
    document.body.appendChild(popup)
    popup.animate([
      { transform: 'translateY(0) scale(1)', opacity: 1 },
      { transform: 'translateY(-50px) scale(1.4)', opacity: 0 },
    ], { duration: 700, easing: 'ease-out', fill: 'forwards' })
      .onfinish = () => popup.remove()
  }
}

interface BubbleAnim {
  el: HTMLElement
  x: number
  y: number
  vx: number
  vy: number
  r: number
  cx: number
  cy: number
  rectW: number
  color: string
  hue: number
}

interface AnimState {
  bubbles: Map<number, BubbleAnim>
  running: boolean
  id: number
}

const tick = (state: AnimState, container: HTMLElement): void => {
  const w = window.innerWidth
  const h = window.innerHeight
  const dt = 1 / 60
  const rainbow = container.getAttribute('data-rainbow-mode') === 'true'

  const els = container.querySelectorAll(':scope > .bubble') as NodeListOf<HTMLElement>
  const currentIds = new Set<number>()

  // Sync: add/update tracking for current elements
  for (const el of els) {
    const id = parseInt(el.getAttribute('data-id') ?? '', 10)
    if (isNaN(id)) continue
    currentIds.add(id)

    let ba = state.bubbles.get(id)
    if (!ba) {
      ba = {
        el,
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 60,
        vy: (Math.random() - 0.5) * 50 - 20,
        r: parseFloat(el.getAttribute('data-size') ?? '20'),
        cx: 0,
        cy: 0,
        rectW: 0,
        color: el.style.backgroundColor || '#667eea',
        hue: Math.random() * 360,
      }
      state.bubbles.set(id, ba)
    }

    // Cache current bounding rect for potential poof
    const rect = el.getBoundingClientRect()
    ba.cx = rect.left + rect.width / 2
    ba.cy = rect.top + rect.height / 2
    ba.rectW = rect.width
    ba.el = el
    ba.color = el.style.backgroundColor || ba.color
  }

  // Remove tracking for popped/removed bubbles that are no longer in DOM
  // (poof was already handled by MutationObserver, just clean up)
  for (const [id] of state.bubbles) {
    if (!currentIds.has(id)) {
      state.bubbles.delete(id)
    }
  }

  // Update positions for all tracked bubbles still in the DOM
  for (const [, ba] of state.bubbles) {
    if (!ba.el.parentElement) continue
    ba.x += ba.vx * dt
    ba.y += ba.vy * dt
    ba.r += 6 * dt
    if (ba.r > 200) ba.r = 200

    // Wrap around edges
    if (ba.x < -ba.r) ba.x = w + ba.r
    if (ba.x > w + ba.r) ba.x = -ba.r
    if (ba.y < -ba.r) ba.y = h + ba.r
    if (ba.y > h + ba.r) ba.y = -ba.r

    const size = ba.r * 2
    ba.el.style.width = `${size}px`
    ba.el.style.height = `${size}px`
    ba.el.style.transform = `translate3d(${ba.x - ba.r}px,${ba.y - ba.r}px,0)`

    if (rainbow) {
      ba.hue = (ba.hue + 60 * dt) % 360
      ba.el.style.backgroundColor = `hsl(${ba.hue}, 75%, 60%)`
    }
  }
}

export const update = (
  model: Model,
  message: Message,
  muted: boolean = false,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      BubblesClickedPop: (msg) => [
        {
          ...model,
          bubbles: model.bubbles.map((b) =>
            b.id === msg.id ? { ...b, popped: true } : b,
          ),
          score: model.score + 1,
        },
        muted ? [] : [pop(SoundPlayed())],
      ],
      BubblesAddReleased: (msg) => {
        const size = Math.min(10 + msg.duration * 0.07, 200)
        const newBubbles: Bubble[] = []
        for (let i = 0; i < model.batchCount; i++) {
          newBubbles.push({ id: model.nextId + i, color: randomColor(), popped: false, size })
        }
        return [
          {
            ...model,
            bubbles: [...model.bubbles, ...newBubbles],
            nextId: model.nextId + model.batchCount,
          },
          muted ? [] : [chime(SoundPlayed())],
        ]
      },
      BubblesClickedReset: () => [
        { ...model, bubbles: [], score: 0 },
        muted ? [] : [swoosh(SoundPlayed())],
      ],
      BubblesSetRainbowMode: (msg) => [{ ...model, rainbowMode: msg.value }, []],
      BubblesSetBatchCount: (msg) => [{ ...model, batchCount: msg.value }, []],
      BubblesSetPopLabel: (msg) => [{ ...model, popLabel: msg.value }, []],
      BubblesSoundPlayed: () => [model, []],
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.h1([h.Class('title')], [t('bubblesTitle', language)]),
        h.p([h.Class('bubbles-score')], [tf('popped', language, model.score)]),
        h.div([h.Class('buttons')], [
          h.button(
            [h.OnPointerDown(() => { isHolding = true; holdStartTime = performance.now(); return O.none() }), h.OnPointerUp(() => { if (!isHolding) return O.none(); isHolding = false; return O.some(AddReleased({ duration: performance.now() - holdStartTime })) }), h.OnPointerLeave(() => { if (!isHolding) return O.none(); isHolding = false; return O.some(AddReleased({ duration: performance.now() - holdStartTime })) }), h.Class('btn btn-primary')],
            [t('addBubble', language)],
          ),
          model.score > 0 || model.bubbles.length > 0
            ? h.button(
              [h.OnClick(ClickedReset()), h.Class('btn btn-secondary')],
              [t('clear', language)],
            )
            : null,
        ]),
        h.div([h.Class('display-area')], [
          model.bubbles.length === 0
            ? h.p([h.Class('bubbles-hint')], [t('tapToAdd', language)])
            : null,
          model.bubbles.filter((b) => !b.popped).length === 0 && model.bubbles.length > 0
            ? h.p([h.Class('bubbles-done')], [t('allPopped', language)])
            : null,
          model.score > 0 && (model.score % 25 === 0 || model.score === 10)
            ? h.p([h.Class('bubbles-milestone'), h.Key('m-' + model.score)], [tf('bubblesMilestone', language, model.score)])
            : null,
        ]),
        h.div([
          h.Class('bubbles-container'),
          h.Key('bubbles-container'),
          h.Attribute('data-rainbow-mode', model.rainbowMode.toString()),
          h.Attribute('data-pop-label', model.popLabel ? t('popText', language) : ''),
          h.OnMount({
            name: 'bubblesAnim',
            f: (element) => Stream.callback<never>(_queue =>
              Effect.gen(function* () {
                yield* Effect.acquireRelease(
                  Effect.sync(() => {
                    const container = element as HTMLElement
                    const state: AnimState = {
                      bubbles: new Map(),
                      running: true,
                      id: 0,
                    }

                    const observer = new MutationObserver((mutations) => {
                      for (const mutation of mutations) {
                        if (mutation.type !== 'childList') continue
                        for (const node of mutation.removedNodes) {
                          if (!(node instanceof HTMLElement)) continue
                          if (!node.classList.contains('bubble')) continue
                          const id = parseInt(node.getAttribute('data-id') ?? '', 10)
                          const ba = state.bubbles.get(id)
                          if (ba) {
                            const popLabelText = container.getAttribute('data-pop-label') ?? ''
                            poof(ba.cx, ba.cy, ba.rectW, ba.color, popLabelText)
                            state.bubbles.delete(id)
                          }
                        }
                      }
                    })
                    observer.observe(container, { childList: true })

                    const loop = () => {
                      if (!state.running) return
                      tick(state, container)
                      state.id = requestAnimationFrame(loop)
                    }
                    state.id = requestAnimationFrame(loop)
                    return { state, observer }
                  }),
                  ({ state, observer }) => Effect.sync(() => {
                    state.running = false
                    cancelAnimationFrame(state.id)
                    observer.disconnect()
                  }),
                )
                return yield* Effect.never
              }),
            ),
          }),
        ], [
          ...model.bubbles.filter((b) => !b.popped).map((b) =>
            h.div(
              [
                  h.OnClick(ClickedPop({ id: b.id })),
                  h.Class('bubble'),
                  h.Style({ backgroundColor: b.color }),
                  h.Attribute('data-id', b.id.toString()),
                  h.Attribute('data-size', b.size.toString()),
                  h.Key(b.id.toString()),
                ],
              [],
            )
          ),
        ]),
      ]),
    ],
  )
}
