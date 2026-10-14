import { Effect, Schema as S } from 'effect'
import { Scene, Story } from 'foldkit/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Audio from '../audio'
import { t, tf } from '../i18n'
import * as Speech from '../speech'
import * as ShapeMatch from './shapeMatch'
import { initialRound, SHAPES } from './shapeMatchDomain'
import * as Runtime from './shapeMatchRuntime'
import { SHAPE_KEYS, SHAPE_PATHS } from './shapeMatchShapes'

const update = (model: ShapeMatch.Model, message: ShapeMatch.Message) => ShapeMatch.update(model, message, 'en', true, {})
const audible = (model: ShapeMatch.Model, message: ShapeMatch.Message) => ShapeMatch.update(model, message, 'en', false, {})
const view = (model: ShapeMatch.Model) => ShapeMatch.view(model, 'en')
const simple = (): ShapeMatch.Model => ({ ...ShapeMatch.init(), ...initialRound('simple'), mode: 'simple' })
const pick = (model: ShapeMatch.Model, index = model.targetIndex) => ShapeMatch.PickHome({ index, round: model.round, token: model.token })
const move = (round: number, token: number) => [{ name: 'ShapeMatchMovePiece' }, ShapeMatch.MoveFinished({ round, token })] as const
const replace = (round: number, token: number) => [{ name: 'ShapeMatchReplaceAfterMatch' }, ShapeMatch.ReplacementReady({ round, token })] as const
const feedback = (round: number, token: number) => [{ name: 'ShapeMatchFeedback' }, ShapeMatch.FeedbackFinished({ round, token })] as const
const evolve = (messages: readonly ShapeMatch.Message[], initial = simple()): ShapeMatch.Model => {
  let model = initial
  for (const message of messages) {
    const matching = message._tag === 'ShapeMatchPickHome' && message.round === model.round && message.token === model.token &&
      model.status === 'matching' && message.index === model.targetIndex
    Story.story(update, Story.with(model), Story.message(message),
      ...(matching ? [Story.Command.resolveAll(move(model.round, model.token + 1)), Story.Command.resolveAll(replace(model.round, model.token + 1))] : [Story.Command.expectNone()]),
      Story.model(next => { model = next }), Story.Command.expectNone())
  }
  return model
}
const cards: HTMLElement[] = []
const activeCard = (model: ShapeMatch.Model): HTMLElement => {
  const card = document.createElement('div')
  card.className = 'shape-match-card'
  card.dataset.shapeMatchRound = String(model.round)
  card.dataset.shapeMatchToken = String(model.token)
  document.body.appendChild(card)
  cards.push(card)
  return card
}
afterEach(() => { cards.splice(0).forEach(card => card.remove()); Audio.resetContext(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Shape Match continuous state', () => {
  it('starts with four unique pair homes and a target already among them', () => {
    const model = ShapeMatch.init()
    expect(model).toMatchObject({ mode: 'pairs', round: 0, token: 0, status: 'matching', hint: false, feedbackPending: false, targetIndex: 1 })
    expect(model.homes).toHaveLength(4)
    expect(ShapeMatch.getPuzzle(model)).toEqual({ target: ['circle', 'square'], homes: model.homes })
    expect(S.is(ShapeMatch.Model)(model)).toBe(true)
  })

  it.each(['simple', 'pairs'] as const)('lands a %s piece, briefly highlights it, and replaces only that card', mode => {
    const initial: ShapeMatch.Model = { ...ShapeMatch.init(), ...initialRound(mode), mode }
    Story.story(update, Story.with(initial), Story.message(pick(initial)),
      Story.model(model => expect(model).toMatchObject({ status: 'moving', token: 1, round: 0 })),
      Story.Command.resolveAll(move(0, 1)),
      Story.model(model => { expect(model.status).toBe('landed'); expect(model.homes).toEqual(initial.homes) }),
      Story.Command.resolveAll(replace(0, 1)),
      Story.model(model => {
        expect(model).toMatchObject({ status: 'matching', round: 1, token: 2, hint: false })
        expect(model.homes[initial.targetIndex]).not.toEqual(initial.homes[initial.targetIndex])
        expect(model.targetIndex).not.toBe(initial.targetIndex)
        initial.homes.forEach((home, slot) => { if (slot !== initial.targetIndex) expect(model.homes[slot]).toBe(home) })
        expect(ShapeMatch.getPuzzle(model).target).toBe(model.homes[model.targetIndex])
      }), Story.Command.expectNone())
  })

  it.each(['simple', 'pairs'] as const)('keeps playing %s for 150 matches without a completion or finite round cap', mode => {
    let model: ShapeMatch.Model = { ...ShapeMatch.init(), ...initialRound(mode), mode }
    for (let index = 0; index < 150; index++) model = evolve([pick(model)], model)
    expect(model.round).toBe(150)
    expect(model.status).toBe('matching')
    expect(new Set(model.homes.map(home => home.join(','))).size).toBe(4)
  })

  it('hints without a penalty or lock, suppresses duplicate hints and allows correction', () => {
    const wrong = evolve([pick(simple(), 0)])
    expect(wrong).toMatchObject({ round: 0, status: 'matching', hint: true, token: 1 })
    expect(evolve([pick(wrong, 0)], wrong)).toEqual(wrong)
    expect(evolve([pick(wrong)], wrong)).toMatchObject({ round: 1, status: 'matching', hint: false, token: 3 })
  })

  it.each(['moving', 'landed'] as const)('rejects repeated touches and out-of-order/stale results while %s', status => {
    const busy: ShapeMatch.Model = { ...simple(), status, token: 1 }
    expect(evolve([pick(busy), ShapeMatch.Entered(), ShapeMatch.MoveFinished({ round: 0, token: 0 }), ShapeMatch.ReplacementReady({ round: 0, token: 0 })], busy)).toEqual(busy)
    const outOfOrder = status === 'moving' ? ShapeMatch.ReplacementReady({ round: 0, token: 1 }) : ShapeMatch.MoveFinished({ round: 0, token: 1 })
    expect(evolve([outOfOrder], busy)).toEqual(busy)
  })

  it('changes mode during movement, invalidates old results and preserves repeated mode selection', () => {
    const moving: ShapeMatch.Model = { ...ShapeMatch.init(), status: 'moving', token: 1 }
    const changed = evolve([ShapeMatch.SetMode({ mode: 'simple' }), ShapeMatch.MoveFinished({ round: 0, token: 1 })], moving)
    expect(changed).toEqual({ ...simple(), token: 2 })
    expect(evolve([ShapeMatch.SetMode({ mode: 'simple' })], changed)).toEqual(changed)
  })

  it.each([-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid index, round and token %s', invalid => {
    expect(evolve([
      ShapeMatch.PickHome({ index: invalid, round: 0, token: 0 }), ShapeMatch.PickHome({ index: 1, round: invalid, token: 0 }),
      ShapeMatch.PickHome({ index: 1, round: 0, token: invalid }), ShapeMatch.MoveFinished({ round: 0, token: invalid }),
      ShapeMatch.ReplacementReady({ round: invalid, token: 0 }), ShapeMatch.FeedbackFinished({ round: 0, token: invalid }),
    ])).toEqual(simple())
  })

  it('rejects unknown modes, unavailable homes and stale inputs', () => {
    expect(evolve([
      { _tag: 'ShapeMatchSetMode', mode: 'unknown' as ShapeMatch.Mode }, ShapeMatch.PickHome({ index: 4, round: 0, token: 0 }),
      ShapeMatch.PickHome({ index: 1, round: 1, token: 0 }), ShapeMatch.PickHome({ index: 1, round: 0, token: 1 }),
    ])).toEqual(simple())
    expect(S.is(ShapeMatch.Message)({ _tag: 'ShapeMatchPickHome', index: 'bad', round: 0, token: 0 })).toBe(false)
  })

  it('deduplicates touch plus compatibility click across automatic replacement', () => {
    expect(evolve([pick(simple()), pick(simple())])).toMatchObject({ round: 1, token: 2, status: 'matching' })
  })

  it.each(['moving', 'landed'] as const)('navigation during %s replaces one home and cannot strand the game busy', status => {
    const busy: ShapeMatch.Model = { ...simple(), status, token: 1 }
    const interrupted = ShapeMatch.interrupt(busy)
    expect(interrupted).toMatchObject({ status: 'matching', round: 1, token: 2, feedbackPending: false })
    busy.homes.forEach((home, slot) => { if (slot !== busy.targetIndex) expect(interrupted.homes[slot]).toBe(home) })
    expect(evolve([ShapeMatch.MoveFinished({ round: 0, token: 1 }), ShapeMatch.ReplacementReady({ round: 0, token: 1 })], interrupted)).toEqual(interrupted)
    expect(evolve([pick(interrupted)], interrupted).round).toBe(2)
  })
})

describe('Shape Match automatic speech and safe effects', () => {
  it('announces on entry, rejects pending duplicate entry and acknowledges speech', () => {
    Story.story(audible, Story.with(ShapeMatch.init()), Story.message(ShapeMatch.Entered()),
      Story.model(model => expect(model).toMatchObject({ feedbackPending: true, token: 1 })),
      Story.Command.resolveAll(feedback(0, 0)),
      Story.message(ShapeMatch.Entered()), Story.Command.expectNone(),
      Story.message(ShapeMatch.FeedbackFinished({ round: 0, token: 1 })), Story.Command.expectNone(),
      Story.model(model => expect(model.feedbackPending).toBe(false)), Story.Command.expectNone())
  })

  it('orders movement, dwell and automatic next-target narration', () => {
    Story.story(audible, Story.with(simple()), Story.message(pick(simple())), Story.Command.resolveAll(move(0, 1)),
      Story.model(model => expect(model.status).toBe('landed')), Story.Command.resolveAll(replace(0, 1)),
      Story.model(model => expect(model).toMatchObject({ status: 'matching', round: 1, token: 2, feedbackPending: true })),
      Story.Command.resolveAll(feedback(1, 2)), Story.Command.expectNone())
  })

  it.each(['en', 'zh', 'fr', 'de', 'fa', 'ms', 'zh-HK', 'ja'])('speaks actual localized pair names with root speech settings in %s', async language => {
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    const [model, commands] = ShapeMatch.update(ShapeMatch.init(), ShapeMatch.Entered(), language, false, { rate: .7, pitch: 1.3, lang: 'en' })
    activeCard(model)
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(ShapeMatch.FeedbackFinished({ round: 0, token: 1 }))
    expect(speak).toHaveBeenCalledWith(tf('shapeMatchPair', language, t('shapeCircle', language), t('shapeSquare', language)), { rate: .7, pitch: 1.3, lang: language })
  })

  it.each(['crescent', 'cloud', 'clover', 'rightTriangle', 'sixPointStar', 'eightPointStar'] as const)(
    'automatically names the added %s target', async shape => {
      const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
      const initial: ShapeMatch.Model = { ...simple(), homes: [['square'], [shape], ['triangle'], ['star']] }
      const [model, commands] = audible(initial, ShapeMatch.Entered())
      activeCard(model)
      expect(await Effect.runPromise(commands[0]!.effect)).toEqual(ShapeMatch.FeedbackFinished({ round: 0, token: 1 }))
      expect(speak).toHaveBeenCalledExactlyOnceWith(t(SHAPE_KEYS[shape], 'en'), { lang: 'en' })
    },
  )

  it('speaks the new target after replacement, and gates all speech/chimes with mute', async () => {
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    const chime = vi.spyOn(Audio, 'chime').mockImplementation(message => ({ name: 'PlayChime', effect: Effect.succeed(message) }))
    const landed: ShapeMatch.Model = { ...simple(), status: 'landed', token: 1 }
    const [model, commands] = audible(landed, ShapeMatch.ReplacementReady({ round: 0, token: 1 }))
    activeCard(model)
    await Effect.runPromise(commands[0]!.effect)
    const shape = ShapeMatch.getPuzzle(model).target[0]!
    expect(speak).toHaveBeenCalledWith(t(SHAPE_KEYS[shape], 'en'), { lang: 'en' })
    expect(chime).toHaveBeenCalledOnce()
    expect(update(landed, ShapeMatch.ReplacementReady({ round: 0, token: 1 }))[1]).toEqual([])
    expect(update(simple(), ShapeMatch.Entered())[1]).toEqual([])
  })

  it.each(['missing', 'changed round', 'newer token'])('skips stale speech and chime with %s DOM after render', async change => {
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    const chime = vi.spyOn(Audio, 'chime')
    const landed: ShapeMatch.Model = { ...simple(), status: 'landed', token: 1 }
    const [model, commands] = audible(landed, ShapeMatch.ReplacementReady({ round: 0, token: 1 }))
    const card = activeCard(model)
    if (change === 'missing') card.remove()
    else if (change === 'changed round') card.dataset.shapeMatchRound = '2'
    else card.dataset.shapeMatchToken = '3'
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(ShapeMatch.FeedbackFinished({ round: 1, token: 2 }))
    expect(chime).not.toHaveBeenCalled()
    expect(speak).not.toHaveBeenCalled()
  })

  it('acknowledges missing APIs, failed chimes and rejected speech', async () => {
    vi.stubGlobal('AudioContext', undefined); vi.stubGlobal('speechSynthesis', undefined); vi.stubGlobal('SpeechSynthesisUtterance', undefined)
    const landed: ShapeMatch.Model = { ...simple(), status: 'landed', token: 1 }
    const [model, commands] = audible(landed, ShapeMatch.ReplacementReady({ round: 0, token: 1 }))
    activeCard(model)
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(ShapeMatch.FeedbackFinished({ round: 1, token: 2 }))
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    vi.spyOn(Audio, 'chime').mockReturnValue({ name: 'PlayChime', effect: Effect.die(new Error('blocked')) })
    await Effect.runPromise(commands[0]!.effect)
    expect(speak).toHaveBeenCalledOnce()
    speak.mockImplementation(() => { throw new Error('blocked') })
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(ShapeMatch.FeedbackFinished({ round: 1, token: 2 }))
  })

  it('resolves movement and dwell failures without stranding play', async () => {
    vi.spyOn(Runtime, 'moveShapeMatchPiece').mockReturnValue(Effect.die(new Error('blocked')))
    vi.spyOn(Runtime, 'waitShapeMatchReplacement').mockReturnValue(Effect.die(new Error('blocked')))
    const [moving, first] = update(simple(), pick(simple()))
    const moved = await Effect.runPromise(first[0]!.effect)
    expect(moved).toEqual(ShapeMatch.MoveFinished({ round: 0, token: 1 }))
    const [landed, second] = update(moving, moved)
    const ready = await Effect.runPromise(second[0]!.effect)
    expect(ready).toEqual(ShapeMatch.ReplacementReady({ round: 0, token: 1 }))
    expect(update(landed, ready)[0]).toMatchObject({ status: 'matching', round: 1 })
  })

  it('keeps update pure while constructing movement, dwell and feedback commands', () => {
    const queried = vi.spyOn(document, 'querySelector').mockImplementation(() => { throw new Error('DOM read in update') })
    expect(audible(simple(), pick(simple()))[1][0]!.name).toBe('ShapeMatchMovePiece')
    expect(audible(simple(), ShapeMatch.Entered())[1][0]!.name).toBe('ShapeMatchFeedback')
    expect(queried).not.toHaveBeenCalled()
  })
})

describe('Shape Match continuous view', () => {
  it('uses only native mode buttons and four homes with a live shape name', () => {
    const pair = tf('shapeMatchPair', 'en', t('shapeCircle', 'en'), t('shapeSquare', 'en'))
    Scene.scene({ update, view }, Scene.with(ShapeMatch.init()),
      Scene.expect(Scene.role('button', { name: t('shapeMatchPairs', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('button', { name: t('shapeMatchSimple', 'en') })).toHaveAttr('aria-pressed', 'false'),
      Scene.expect(Scene.role('button', { name: tf('shapeMatchHome', 'en', pair) })).not.toBeDisabled(),
      Scene.expect(Scene.role('status')).toHaveText(pair), Scene.expect(Scene.role('status')).toHaveAttr('aria-live', 'polite'),
      Scene.expect(Scene.selector('svg')).toHaveAttr('aria-hidden', 'true'), Scene.expect(Scene.selector('svg')).toHaveAttr('focusable', 'false'),
      Scene.expect(Scene.selector('.shape-match-home-piece--pair')).toExist(), Scene.Command.expectNone())
    const node = view(ShapeMatch.init())
    expect(JSON.stringify(node)).not.toMatch(/shape-match-(progress|next|again|listen|complete|actions)/)
  })

  it('lands into the home, hides the top piece, then replaces that home and shows the next target automatically', () => {
    Scene.scene({ update, view }, Scene.with(simple()),
      Scene.click(Scene.role('button', { name: tf('shapeMatchHome', 'en', t('shapeCircle', 'en')) })),
      Scene.expect(Scene.selector('.shape-match-stage .shape-match-piece')).toExist(),
      Scene.expect(Scene.selector('.shape-match-home--matched')).not.toExist(), Scene.expect(Scene.selector('.shape-match-card')).toHaveAttr('aria-busy', 'true'),
      Scene.Command.resolveAll(move(0, 1)), Scene.expect(Scene.selector('.shape-match-stage .shape-match-piece')).not.toExist(),
      Scene.expect(Scene.selector('.shape-match-home--matched')).toExist(), Scene.Command.resolveAll(replace(0, 1)),
      Scene.expect(Scene.selector('.shape-match-stage .shape-match-piece')).toExist(), Scene.expect(Scene.selector('.shape-match-home--matched')).not.toExist(),
      Scene.expect(Scene.selector('.shape-match-card')).toHaveAttr('aria-busy', 'false'), Scene.Command.expectNone())
  })

  it('keeps each home DOM key stable across matches and leaves three home renderings unchanged', () => {
    const before = simple()
    const after = evolve([pick(before)], before)
    const collect = (node: ReturnType<typeof view>) => {
      const result: NonNullable<ReturnType<typeof view>>[] = []
      const walk = (item: typeof node): void => {
        if (item?.data?.attrs?.['data-shape-match-correct'] !== undefined) result.push(item)
        item?.children?.forEach(child => { if (typeof child !== 'string') walk(child) })
      }
      walk(node); return result
    }
    const beforeNodes = collect(view(before))
    const afterNodes = collect(view(after))
    expect(beforeNodes.map(node => node.key)).toEqual(afterNodes.map(node => node.key))
    expect(afterNodes).toHaveLength(4)
    for (let slot = 0; slot < 4; slot++) {
      const oldVisual = JSON.stringify(beforeNodes[slot]?.children?.[0])
      const newVisual = JSON.stringify(afterNodes[slot]?.children?.[0])
      if (slot === before.targetIndex) expect(newVisual).not.toBe(oldVisual)
      else expect(newVisual).toBe(oldVisual)
    }
  })

  it('switches modes and shows a gentle hint without disabling the homes', () => {
    Scene.scene({ update, view }, Scene.with(ShapeMatch.init()), Scene.click(Scene.role('button', { name: t('shapeMatchSimple', 'en') })),
      Scene.expect(Scene.role('button', { name: t('shapeMatchSimple', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.selector('.shape-match-piece--pair')).not.toExist(), Scene.expect(Scene.role('status')).toHaveText(t('shapeCircle', 'en')),
      Scene.click(Scene.role('button', { name: tf('shapeMatchHome', 'en', t('shapeSquare', 'en')) })),
      Scene.expect(Scene.selector('.shape-match-home--hint')).toExist(), Scene.expect(Scene.role('status')).toHaveText(t('shapeMatchTryAgain', 'en')),
      Scene.expect(Scene.role('button', { name: tf('shapeMatchHome', 'en', t('shapeCircle', 'en')) })).not.toBeDisabled(), Scene.Command.expectNone())
  })

  it('renders all 34 silhouettes as named targets and matching homes', () => {
    expect(SHAPES).toHaveLength(34)
    for (const shape of SHAPES) {
      const others = SHAPES.filter(other => other !== shape).slice(0, 3)
      const model: ShapeMatch.Model = { ...simple(), homes: [[others[0]!], [shape], [others[1]!], [others[2]!]] }
      Scene.scene({ update, view }, Scene.with(model),
        Scene.expect(Scene.role('img', { name: t(SHAPE_KEYS[shape], 'en') })).toExist(),
        Scene.expect(Scene.role('button', { name: tf('shapeMatchHome', 'en', t(SHAPE_KEYS[shape], 'en')) })).toExist(),
        Scene.expect(Scene.selector('.shape-match-stage .shape-match-surface')).toHaveAttr('d', SHAPE_PATHS[shape]),
        Scene.expect(Scene.selector('.shape-match-home[data-shape-match-correct="true"] .shape-match-outline')).toHaveAttr('d', SHAPE_PATHS[shape]),
        Scene.Command.expectNone())
    }
  })

  it('preserves donut holes and clips shine to the same silhouette', () => {
    const model: ShapeMatch.Model = { ...simple(), homes: [['square'], ['donut'], ['triangle'], ['star']] }
    Scene.scene({ update, view }, Scene.with(model),
      Scene.expect(Scene.selector('.shape-match-stage .shape-match-surface')).toHaveAttr('fill-rule', 'evenodd'),
      Scene.expect(Scene.selector('.shape-match-stage .shape-match-shine')).toHaveAttr('clip-path', 'url(#shape-match-target-0-0-clip)'), Scene.Command.expectNone())
  })
})
