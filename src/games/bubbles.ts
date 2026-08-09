import { Effect, Match as M, MutableRef, Option as O, Queue, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { pop, chime } from '../audio'
import { speak } from '../speech'
import { t, tf, type StringKey } from '../i18n'

const Bubble = S.Struct({ id: S.Number, color: S.String, popped: S.Boolean, size: S.Number, shape: S.String })
type Bubble = typeof Bubble.Type

const COLORS = ['#FF4757', '#FF7F00', '#FFD93D', '#2ED573', '#1E90FF', '#A855F7', '#FF69B4', '#E0E0E0', '#666666']

const RAINBOW_GRADIENT = 'linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb5e, #4ecdc4, #667eea, #ff8b94)'
const RAINBOW_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb5e', '#4ecdc4', '#667eea', '#ff8b94']
const COLOR_NAME_KEYS: Record<string, StringKey> = {
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

export const SHAPE_PAGES = [
  ['circle', 'star', 'heart', 'triangle', 'oval'],
  ['semicircle', 'donut', 'rectangle', 'diamond', 'trapezoid'],
  ['square', 'pentagon', 'hexagon', 'heptagon', 'octagon'],
] as const

const SHAPE_NAME_KEYS: Record<string, StringKey> = {
  circle: 'shapeCircle',
  star: 'shapeStar',
  heart: 'shapeHeart',
  triangle: 'shapeTriangle',
  oval: 'shapeOval',
  semicircle: 'shapeSemicircle',
  donut: 'shapeDonut',
  rectangle: 'shapeRectangle',
  diamond: 'shapeDiamond',
  trapezoid: 'shapeTrapezoid',
  square: 'shapeSquare',
  pentagon: 'shapePentagon',
  hexagon: 'shapeHexagon',
  heptagon: 'shapeHeptagon',
  octagon: 'shapeOctagon',
}

const getColorName = (color: string): StringKey => COLOR_NAME_KEYS[color] ?? 'colorRainbow'
const getShapeName = (shape: string): StringKey => SHAPE_NAME_KEYS[shape] ?? 'shapeCircle'

const isPointerDown = MutableRef.make(false)
const MIN_BUBBLE_BASE = 40
const CLEAR_POP_INTERVAL_MS = 120

let poofContainer: HTMLElement | null = null
const getPoofContainer = (): HTMLElement => {
  if (!poofContainer || !poofContainer.isConnected) {
    const c = document.createElement('div')
    c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:998;contain:strict'
    document.body.appendChild(c)
    poofContainer = c
  }
  return poofContainer
}

export const Model = S.Struct({ bubbles: S.Array(Bubble), score: S.Number, nextId: S.Number, rainbowMode: S.Boolean, popLabel: S.Boolean, sayColor: S.Boolean, selectedColor: S.String, shapeMode: S.Boolean, selectedShape: S.String, shapePage: S.Number })
export type Model = typeof Model.Type

export const ClickedPop = m('BubblesClickedPop', { id: S.Number })
export const ClickedReset = m('BubblesClickedReset')
export const ClearBubble = m('BubblesClearBubble', { id: S.Number })
export const ClearCompleted = m('BubblesClearCompleted', { ids: S.Array(S.Number) })
export const ClickedColor = m('BubblesClickedColor', { color: S.String, duration: S.Number })
export const SoundPlayed = m('BubblesSoundPlayed')
export const SetRainbowMode = m('BubblesSetRainbowMode', { value: S.Boolean })
export const SetPopLabel = m('BubblesSetPopLabel', { value: S.Boolean })
export const SetSayColor = m('BubblesSetSayColor', { value: S.Boolean })
export const SetShapeMode = m('BubblesSetShapeMode', { value: S.Boolean })
export const SetSelectedShape = m('BubblesSetSelectedShape', { value: S.String })
export const NextShapePage = m('BubblesNextShapePage')

export const Message = S.Union([ClickedPop, ClickedReset, ClearBubble, ClearCompleted, ClickedColor, SoundPlayed, SetRainbowMode, SetPopLabel, SetSayColor, SetShapeMode, SetSelectedShape, NextShapePage])
export type Message = typeof Message.Type

export const init = (): Model => ({ bubbles: [], score: 0, nextId: 0, rainbowMode: false, popLabel: false, sayColor: false, selectedColor: '', shapeMode: false, selectedShape: 'circle', shapePage: 0 })

const clearCommands = (bubbles: ReadonlyArray<Bubble>): ReadonlyArray<Command.Command<Message>> => {
  const ids = bubbles.map((bubble) => bubble.id)
  const idsToPop = bubbles.filter((bubble) => !bubble.popped).map((bubble) => bubble.id)
  return [
    ...idsToPop.map((id, index) => ({
      name: 'ClearBubble',
      effect: Effect.sleep(index * CLEAR_POP_INTERVAL_MS).pipe(Effect.as(ClearBubble({ id }))),
    })),
    {
      name: 'FinishClearing',
      effect: Effect.sleep(idsToPop.length * CLEAR_POP_INTERVAL_MS).pipe(Effect.as(ClearCompleted({ ids }))),
    },
  ]
}

const poof = (cx: number, cy: number, w: number, color: string, popLabelText: string): void => {
  const s = w / 16
  const count = Math.max(4, Math.floor(w / 12))
  const flashDuration = (300 + w * 1.5) * 0.4
  const burstDuration = (300 + w * 1.5) * 0.6
  const isRainbow = color.startsWith('linear-gradient')
  const pickColor = () => isRainbow ? RAINBOW_COLORS[Math.floor(Math.random() * RAINBOW_COLORS.length)]! : color

  const container = getPoofContainer()
  const frag = document.createDocumentFragment()
  const anims: Animation[] = []

  const createParticle = (
    size: number, left: number, top: number, bg: string, z: number,
    keyframes: Keyframe[], options: KeyframeAnimationOptions,
  ): void => {
    const p = document.createElement('div')
    p.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${size}px;height:${size}px;border-radius:50%;background:${bg};pointer-events:none;z-index:${z};contain:strict;will-change:transform,opacity`
    frag.appendChild(p)
    anims.push(p.animate(keyframes, options))
  }

  // Center flash
  const flashSize = w * 2
  createParticle(
    flashSize, cx - flashSize / 2, cy - flashSize / 2,
    `radial-gradient(circle, rgba(255,255,255,0.7) 0%, ${pickColor()} 50%, transparent 70%)`,
    999,
    [{ transform: 'scale(0.3)', opacity: 0.8 }, { transform: 'scale(1.5)', opacity: 0 }],
    { duration: flashDuration, easing: 'ease-out', fill: 'forwards' },
  )

  // Primary burst
  for (let i = 0; i < count; i++) {
    const ps = (3 + Math.random() * 5) * s
    const angle = Math.random() * Math.PI * 2
    const dist = (20 + Math.random() * 45) * s
    const drift = burstDuration * 0.4 + Math.random() * burstDuration * 0.6
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist
    createParticle(
      ps, cx - ps / 2, cy - ps / 2, pickColor(), 1000,
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) scale(0.15)`, opacity: 0 },
      ],
      { duration: drift, easing: 'ease-out', fill: 'forwards' },
    )
  }

  // Secondary splash
  const splashCount = Math.max(3, Math.floor(w / 20))
  for (let i = 0; i < splashCount; i++) {
    const ps = (1.5 + Math.random() * 2.5) * s
    const angle = Math.random() * Math.PI * 2
    const dist = (30 + Math.random() * 50) * s
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist
    const hueShift = Math.random() > 0.5 ? 'rgba(255,255,255,0.6)' : pickColor()
    createParticle(
      ps, cx - ps / 2, cy - ps / 2, hueShift, 1001,
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) scale(0.1)`, opacity: 0 },
      ],
      { duration: 150 + Math.random() * 100, easing: 'ease-out', fill: 'forwards' },
    )
  }

  // Sparkle particles
  for (let i = 0; i < 3; i++) {
    const sps = 4 + Math.random() * 4
    const angle = Math.random() * Math.PI * 2
    const dist = 40 + Math.random() * 50
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist
    createParticle(
      sps, cx - sps / 2, cy - sps / 2,
      'white', 1002,
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) scale(0.3)`, opacity: 0 },
      ],
      { duration: 250 + Math.random() * 200, easing: 'ease-out', fill: 'forwards' },
    )
  }

  // Score popup or pop label
  if (popLabelText) {
    createParticle(
      0, cx - 15, cy - 15, 'transparent', 1003,
      [
        { transform: 'translateY(0) scale(1)', opacity: 1 },
        { transform: 'translateY(-50px) scale(1.4)', opacity: 0 },
      ],
      { duration: 700, easing: 'ease-out', fill: 'forwards' },
    )
    // Set text on the last created element (the popup)
    const popup = container.querySelector(':scope > :last-child') as HTMLElement | null
    if (popup) {
      popup.textContent = popLabelText
      popup.style.cssText += ';font-size:1.5rem;font-weight:700;color:#FFD700;text-shadow:0 1px 3px rgba(0,0,0,0.4);width:auto;height:auto;background:none;border-radius:0'
    }
  }

  container.appendChild(frag)

  if (anims.length > 0) {
    Promise.all(anims.map(a => a.finished)).then(() => {
      for (const a of anims) {
        if (a.effect && (a.effect as KeyframeEffect).target) {
          const el = (a.effect as KeyframeEffect).target as HTMLElement
          if (el.parentElement) el.remove()
        }
      }
    })
  }
}

interface BubbleAnim {
  el: HTMLElement
  x: number
  y: number
  vx: number
  vy: number
  r: number
  baseR: number
  cx: number
  cy: number
  rectW: number
  color: string
  angle: number
  rotV: number
  shape: string
}

interface AnimState {
  bubbles: Map<number, BubbleAnim>
  running: boolean
  id: number
}

const initBubbleTracking = (state: AnimState, container: HTMLElement): void => {
  const w = window.innerWidth
  const h = window.innerHeight
  const els = container.querySelectorAll(':scope > .bubble') as NodeListOf<HTMLElement>
  for (const el of els) {
    const id = parseInt(el.getAttribute('data-id') ?? '', 10)
    if (isNaN(id)) continue
    if (state.bubbles.has(id)) continue
    const initialR = parseFloat(el.getAttribute('data-size') ?? '20')
    state.bubbles.set(id, {
      el,
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 60,
      vy: (Math.random() - 0.5) * 50 - 20,
      r: initialR,
      baseR: Math.max(initialR, MIN_BUBBLE_BASE),
      cx: 0, cy: 0, rectW: 0,
      color: el.getAttribute('data-color') ?? '#667eea',
      angle: 0,
      rotV: (Math.random() - 0.5) * 120,
      shape: el.getAttribute('data-shape') ?? 'circle',
    })
  }
}

const addBubbleTracking = (state: AnimState, el: HTMLElement): void => {
  const w = window.innerWidth
  const h = window.innerHeight
  const id = parseInt(el.getAttribute('data-id') ?? '', 10)
  if (isNaN(id)) return
  if (state.bubbles.has(id)) return
  const initialR = parseFloat(el.getAttribute('data-size') ?? '20')
  state.bubbles.set(id, {
    el,
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 60,
    vy: (Math.random() - 0.5) * 50 - 20,
    r: initialR,
    baseR: Math.max(initialR, MIN_BUBBLE_BASE),
    cx: 0, cy: 0, rectW: 0,
    color: el.getAttribute('data-color') ?? '#667eea',
    angle: 0,
    rotV: (Math.random() - 0.5) * 120,
    shape: el.getAttribute('data-shape') ?? 'circle',
  })
}

const tick = (state: AnimState): void => {
  const w = window.innerWidth
  const h = window.innerHeight
  const dt = 1 / 60

  for (const [, ba] of state.bubbles) {
    if (!ba.el.parentElement) continue
    ba.x += ba.vx * dt
    ba.y += ba.vy * dt
    ba.r += 6 * dt
    if (ba.r > 200) ba.r = 200

    ba.cx = ba.x
    ba.cy = ba.y
    ba.rectW = ba.r * 2

    if (ba.x < -ba.r) ba.x = w + ba.r
    if (ba.x > w + ba.r) ba.x = -ba.r
    if (ba.y < -ba.r) ba.y = h + ba.r
    if (ba.y > h + ba.r) ba.y = -ba.r

    const scale = (ba.r * 2) / ba.baseR
    ba.angle += ba.rotV * dt
    const shape = ba.shape
    if (shape === 'oval') {
      ba.el.style.transform = `translate3d(${ba.x - ba.baseR / 2}px,${ba.y - ba.baseR / 2}px,0) rotate(${ba.angle}deg) scale(${scale}, ${scale * 0.65})`
    } else {
      ba.el.style.transform = `translate3d(${ba.x - ba.baseR / 2}px,${ba.y - ba.baseR / 2}px,0) scale(${scale}) rotate(${ba.angle}deg)`
    }
  }
}

export const update = (
  model: Model,
  message: Message,
  muted: boolean = false,
  language: string = 'en',
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
        const shape = model.shapeMode ? model.selectedShape : 'circle'
        const newBubble: Bubble = { id: model.nextId, color, popped: false, size, shape }
        const cmds: Array<Command.Command<Message>> = []
        if (!muted) {
          cmds.push(chime(SoundPlayed()))
          const colorName = t(getColorName(msg.color), language)
          const shapeName = model.shapeMode ? t(getShapeName(shape), language) : t('bubble', language)
          cmds.push(speak(`${colorName.toLowerCase()} ${shapeName.toLowerCase()}`, SoundPlayed(), { lang: language }))
        }
        return [
          {
            ...model,
            bubbles: [...model.bubbles, newBubble],
            nextId: model.nextId + 1,
            selectedColor: msg.color,
            rainbowMode: msg.color === 'rainbow',
          },
          cmds,
        ]
      },
      BubblesClickedReset: () => {
        if (model.bubbles.length === 0 && model.score === 0) return [model, []]
        return [
          { ...model, score: 0 },
          clearCommands(model.bubbles),
        ]
      },
      BubblesClearBubble: (msg) => {
        const bubble = model.bubbles.find((b) => b.id === msg.id)
        if (!bubble || bubble.popped) return [model, []]
        return [
          { ...model, bubbles: model.bubbles.map((b) => b.id === msg.id ? { ...b, popped: true } : b) },
          muted ? [] : [pop(SoundPlayed())],
        ]
      },
      BubblesClearCompleted: (msg) => [
        { ...model, bubbles: model.bubbles.filter((bubble) => !msg.ids.includes(bubble.id)) },
        [],
      ],
      BubblesSetRainbowMode: (msg) => [{ ...model, rainbowMode: msg.value, selectedColor: msg.value ? 'rainbow' : model.selectedColor }, []],
      BubblesSetPopLabel: (msg) => [{ ...model, popLabel: msg.value, sayColor: false }, []],
      BubblesSetSayColor: (msg) => [{ ...model, sayColor: msg.value, popLabel: false }, []],
      BubblesSetShapeMode: (msg) => [{ ...model, shapeMode: msg.value }, []],
      BubblesSetSelectedShape: (msg) => [{ ...model, selectedShape: msg.value }, []],
      BubblesNextShapePage: () => [{ ...model, shapePage: (model.shapePage + 1) % SHAPE_PAGES.length }, []],
      BubblesSoundPlayed: () => [model, []],
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()
  const visibleShapes = SHAPE_PAGES[model.shapePage] ?? SHAPE_PAGES[0]

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.h1([h.Class('title')], [t('bubblesTitle', language)]),
        h.p([h.Class('bubbles-score')], [tf('popped', language, model.score)]),
        model.shapeMode
          ? h.div([h.Class('shape-selector'), h.Key('shape-selector')], [
            h.div([h.Class('shape-selector-row')], [
              ...visibleShapes.map((s) =>
                h.button(
                  [
                    h.Class(s === model.selectedShape ? 'shape-btn shape-btn--active' : 'shape-btn'),
                    h.OnClick(SetSelectedShape({ value: s })),
                    h.Attribute('aria-pressed', String(s === model.selectedShape)),
                    h.Attribute('type', 'button'),
                    h.Key(s),
                  ],
                  [t(getShapeName(s), language)],
                ),
              ),
              h.button(
                [
                  h.Class('shape-btn shape-btn--next'),
                  h.OnClick(NextShapePage()),
                  h.Attribute('type', 'button'),
                  h.Key('next-shape-page'),
                ],
                [t('next', language)],
              ),
            ]),
          ])
          : null,
        h.div([h.Class('color-selector'), h.Key('color-selector'), h.OnMount({
          name: 'colorSelector',
          f: (element) => Stream.callback<Message>(queue =>
            Effect.gen(function* () {
              yield* Effect.acquireRelease(
                Effect.sync(() => {
                  const el = element as HTMLElement
                  const colorMap = new Map<number, { startTime: number; color: string; btn: HTMLElement; frameId: number }>()

                  const onDown = (e: PointerEvent): void => {
                    if (!(e.target instanceof HTMLElement)) return
                    const target = e.target
                    const colorBtn = target.closest('.color-btn')
                    if (!colorBtn) return
                    const btn = colorBtn as HTMLElement
                    const color = btn.getAttribute('data-color') ?? ''
                    if (!color) return
                    el.setPointerCapture(e.pointerId)
                    const startTime = performance.now()
                    btn.classList.add('color-btn--charging')
                    btn.style.setProperty('--charge-pct', '0%')
                    const updateCharge = (): void => {
                      const elapsed = performance.now() - startTime
                      const pct = Math.min(elapsed / 3000, 1) * 100
                      btn.style.setProperty('--charge-pct', `${pct}%`)
                      if (pct < 100) {
                        const id = colorMap.get(e.pointerId)
                        if (id) id.frameId = requestAnimationFrame(updateCharge)
                      }
                    }
                    const frameId = requestAnimationFrame(updateCharge)
                    colorMap.set(e.pointerId, { startTime, color, btn, frameId })
                  }

                  const onUp = (e: PointerEvent): void => {
                    const entry = colorMap.get(e.pointerId)
                    if (!entry) return
                    colorMap.delete(e.pointerId)
                    cancelAnimationFrame(entry.frameId)
                    entry.btn.classList.remove('color-btn--charging')
                    entry.btn.style.removeProperty('--charge-pct')
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
          h.div([h.Class('color-selector-row')], [
            ...COLORS.slice(0, 5).map((c) =>
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
          ]),
          h.div([h.Class('color-selector-row')], [
            ...COLORS.slice(5).map((c) =>
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
        h.div([h.Class('buttons')], [
          h.button(
            [h.OnClick(ClickedReset()), h.Class('btn btn-secondary')],
            [t('clear', language)],
          ),
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

                    const onPointerDown = (): void => { MutableRef.set(isPointerDown, true) }
                    const onPointerUp = (): void => { MutableRef.set(isPointerDown, false) }
                    document.addEventListener('pointerdown', onPointerDown)
                    document.addEventListener('pointerup', onPointerUp)
                    document.addEventListener('pointerleave', onPointerUp)

                    const observer = new MutationObserver((mutations) => {
                      for (const mutation of mutations) {
                        if (mutation.type !== 'childList') continue
                        for (const node of mutation.addedNodes) {
                          if (node instanceof HTMLElement && node.classList.contains('bubble')) {
                            addBubbleTracking(state, node)
                          }
                        }
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

                    // Track any bubbles that were already in the DOM before the observer started
                    initBubbleTracking(state, container)

                    const loop = () => {
                      if (!state.running) return
                      tick(state)
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
                  h.OnPointerMove(() => MutableRef.get(isPointerDown) ? O.some(ClickedPop({ id: b.id })) : O.none()),
                  h.Class(b.shape !== 'circle' ? `bubble bubble--${b.shape}` : 'bubble'),
                  h.Style({
                    ...(b.color.startsWith('linear-gradient') ? { background: b.color } : { backgroundColor: b.color }),
                    width: `${Math.max(b.size, MIN_BUBBLE_BASE)}px`,
                    height: `${Math.max(b.size, MIN_BUBBLE_BASE)}px`,
                  }),
                  h.Attribute('data-id', b.id.toString()),
                  h.Attribute('data-color', b.color),
                  h.Attribute('data-color-name', model.sayColor ? t(getColorName(b.color), language) : ''),
                  h.Attribute('data-size', b.size.toString()),
                  h.Attribute('data-shape', b.shape),
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
