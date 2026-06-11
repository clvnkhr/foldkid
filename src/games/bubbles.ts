import { Effect, Match as M, Option as O, Queue, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { pop, chime, swoosh } from '../audio'
import { t, tf, type TranslationKey } from '../i18n'

const Bubble = S.Struct({ id: S.Number, color: S.String, popped: S.Boolean, size: S.Number })
type Bubble = typeof Bubble.Type

const COLORS = ['#FF4757', '#FF7F00', '#FFD93D', '#2ED573', '#1E90FF', '#A855F7', '#FF69B4', '#E0E0E0', '#666666']

const RAINBOW_GRADIENT = 'linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb5e, #4ecdc4, #667eea, #ff8b94)'
const RAINBOW_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb5e', '#4ecdc4', '#667eea', '#ff8b94']
const BUBBLE_GLOSS = 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.5) 0%, transparent 55%),radial-gradient(circle at 70% 80%, rgba(0,0,0,0.08) 0%, transparent 45%)' as string

const COLOR_NAME_KEYS: Record<string, string> = {
  '#FF4757': 'colorRed',
  '#FF7F00': 'colorOrange',
  '#FFD93D': 'colorYellow',
  '#2ED573': 'colorGreen',
  '#1E90FF': 'colorBlue',
  '#A855F7': 'colorPurple',
  '#FF69B4': 'colorPink',
  '#E0E0E0': 'colorWhite',
  '#666666': 'colorGrey',
}

const getColorName = (color: string): string => COLOR_NAME_KEYS[color] ?? 'colorRainbow'

let isPointerDown = false

export const Model = S.Struct({ bubbles: S.Array(Bubble), score: S.Number, nextId: S.Number, rainbowMode: S.Boolean, popLabel: S.Boolean, sayColor: S.Boolean, selectedColor: S.String })
export type Model = typeof Model.Type

export const ClickedPop = m('BubblesClickedPop', { id: S.Number })
export const ClickedReset = m('BubblesClickedReset')
export const ClickedColor = m('BubblesClickedColor', { color: S.String, duration: S.Number })
export const SoundPlayed = m('BubblesSoundPlayed')
export const SetRainbowMode = m('BubblesSetRainbowMode', { value: S.Boolean })
export const SetPopLabel = m('BubblesSetPopLabel', { value: S.Boolean })
export const SetSayColor = m('BubblesSetSayColor', { value: S.Boolean })

export const Message = S.Union([ClickedPop, ClickedReset, ClickedColor, SoundPlayed, SetRainbowMode, SetPopLabel, SetSayColor])
export type Message = typeof Message.Type

export const init = (): Model => ({ bubbles: [], score: 0, nextId: 0, rainbowMode: false, popLabel: false, sayColor: false, selectedColor: '' })

const poof = (cx: number, cy: number, w: number, color: string, popLabelText: string): void => {
  const s = w / 16
  const count = Math.max(6, Math.floor(w / 8))
  const duration = 300 + w * 1.5
  const isRainbow = color.startsWith('linear-gradient')
  const pickColor = () => isRainbow ? RAINBOW_COLORS[Math.floor(Math.random() * RAINBOW_COLORS.length)]! : color

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
    `background:radial-gradient(circle, rgba(255,255,255,0.7) 0%, ${pickColor()} 50%, transparent 70%)`,
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
    const pc = pickColor()
    p.style.cssText = [
      `position:fixed`,
      `left:${cx - ps / 2}px`,
      `top:${cy - ps / 2}px`,
      `width:${ps}px`,
      `height:${ps}px`,
      `border-radius:50%`,
      `background:${pc}`,
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
    const hueShift = Math.random() > 0.5 ? `rgba(255,255,255,0.6)` : pickColor()
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
        color: el.getAttribute('data-color') ?? '#667eea',
      }
      state.bubbles.set(id, ba)
    }

    // Cache current bounding rect for potential poof
    const rect = el.getBoundingClientRect()
    ba.cx = rect.left + rect.width / 2
    ba.cy = rect.top + rect.height / 2
    ba.rectW = rect.width
    ba.el = el
    ba.color = el.getAttribute('data-color') ?? ba.color
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
      BubblesClickedPop: (msg) => {
        const bubble = model.bubbles.find((b) => b.id === msg.id)
        if (!bubble || bubble.popped) return [model, []]
        return [
          {
            ...model,
            bubbles: model.bubbles.map((b) =>
              b.id === msg.id ? { ...b, popped: true } : b,
            ),
            score: model.score + 1,
          },
          muted ? [] : [pop(SoundPlayed())],
        ]
      },
      BubblesClickedColor: (msg) => {
        const color = msg.color === 'rainbow' ? RAINBOW_GRADIENT : msg.color
        const size = Math.min(10 + msg.duration * 0.07, 200)
        const newBubble: Bubble = { id: model.nextId, color, popped: false, size }
        return [
          {
            ...model,
            bubbles: [...model.bubbles, newBubble],
            nextId: model.nextId + 1,
            selectedColor: msg.color,
            rainbowMode: msg.color === 'rainbow',
          },
          muted ? [] : [chime(SoundPlayed())],
        ]
      },
      BubblesClickedReset: () => {
        if (model.bubbles.length === 0 && model.score === 0) return [model, []]
        return [
          { ...model, bubbles: [], score: 0 },
          muted ? [] : [swoosh(SoundPlayed())],
        ]
      },
      BubblesSetRainbowMode: (msg) => [{ ...model, rainbowMode: msg.value, selectedColor: msg.value ? 'rainbow' : model.selectedColor }, []],
      BubblesSetPopLabel: (msg) => [{ ...model, popLabel: msg.value, sayColor: false }, []],
      BubblesSetSayColor: (msg) => [{ ...model, sayColor: msg.value, popLabel: false }, []],
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
            [h.OnClick(ClickedReset()), h.Class('btn btn-secondary')],
            [t('clear', language)],
          ),
        ]),
        h.div([h.Class('color-selector'), h.Key('color-selector'), h.OnMount({
          name: 'colorSelector',
          f: (element) => Stream.callback<Message>(queue =>
            Effect.gen(function* () {
              yield* Effect.acquireRelease(
                Effect.sync(() => {
                  const el = element as HTMLElement
                  const colorMap = new Map<number, { startTime: number; color: string }>()

                  const onDown = (e: PointerEvent): void => {
                    const target = e.target as HTMLElement
                    const colorBtn = target.closest('.color-btn') as HTMLElement | null
                    if (!colorBtn) return
                    const color = colorBtn.getAttribute('data-color') ?? ''
                    if (!color) return
                    el.setPointerCapture(e.pointerId)
                    colorMap.set(e.pointerId, { startTime: performance.now(), color })
                  }

                  const onUp = (e: PointerEvent): void => {
                    const entry = colorMap.get(e.pointerId)
                    if (!entry) return
                    colorMap.delete(e.pointerId)
                    el.releasePointerCapture(e.pointerId)
                    Queue.offerUnsafe(queue, ClickedColor({ color: entry.color, duration: performance.now() - entry.startTime }))
                  }

                  el.addEventListener('pointerdown', onDown)
                  el.addEventListener('pointerup', onUp)
                  el.addEventListener('pointerleave', onUp)
                  el.addEventListener('pointercancel', onUp)

                  return { el, onDown, onUp }
                }),
                ({ el, onDown, onUp }) => Effect.sync(() => {
                  el.removeEventListener('pointerdown', onDown)
                  el.removeEventListener('pointerup', onUp)
                  el.removeEventListener('pointerleave', onUp)
                  el.removeEventListener('pointercancel', onUp)
                }),
              )
              return yield* Effect.never
            }),
          ),
        })], [
          ...COLORS.map((c) =>
            h.button(
              [
                h.Class(c === model.selectedColor ? 'color-btn color-btn--active' : 'color-btn'),
                h.Style({ backgroundColor: c }),
                h.Attribute('data-color', c),
                h.Key(c),
              ],
              [],
            ),
          ),
          h.button(
            [
              h.Class(model.selectedColor === 'rainbow' ? 'color-btn color-btn--active color-btn--rainbow' : 'color-btn color-btn--rainbow'),
              h.Attribute('data-color', 'rainbow'),
            ],
            ['🌈'],
          ),
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
          h.Attribute('data-pop-label', !model.sayColor && model.popLabel ? t('popText', language) : ''),
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

                    const onPointerDown = (): void => { isPointerDown = true }
                    const onPointerUp = (): void => { isPointerDown = false }
                    document.addEventListener('pointerdown', onPointerDown)
                    document.addEventListener('pointerup', onPointerUp)
                    document.addEventListener('pointerleave', onPointerUp)

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
                          const colorName = node.getAttribute('data-color-name') ?? ''
                          poof(ba.cx, ba.cy, ba.rectW, ba.color, colorName || popLabelText)
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
                    return { state, observer, onPointerDown, onPointerUp }
                  }),
                  ({ state, observer, onPointerDown, onPointerUp }) => Effect.sync(() => {
                    state.running = false
                    cancelAnimationFrame(state.id)
                    observer.disconnect()
                    document.removeEventListener('pointerdown', onPointerDown)
                    document.removeEventListener('pointerup', onPointerUp)
                    document.removeEventListener('pointerleave', onPointerUp)
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
                  h.OnPointerDown(() => O.some(ClickedPop({ id: b.id }))),
                  h.OnPointerMove(() => isPointerDown ? O.some(ClickedPop({ id: b.id })) : O.none()),
                  h.Class('bubble'),
                  h.Style(b.color.startsWith('linear-gradient') ? { background: `${b.color},${BUBBLE_GLOSS}` } : { backgroundColor: b.color }),
                  h.Attribute('data-id', b.id.toString()),
                  h.Attribute('data-color', b.color),
                  h.Attribute('data-color-name', model.sayColor ? t(getColorName(b.color) as TranslationKey, language) : ''),
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
