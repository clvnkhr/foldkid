import { Effect } from 'effect'
import { Scene, Story } from 'foldkit/test'
import { describe, expect, it, vi } from 'vitest'
import { t } from '../i18n'
import * as Audio from '../audio'
import * as Speech from '../speech'
import * as Tarot from './tarot'
import { cardKey, drawCard, fullDeck, meaningKey, sampleDropAngle, TAROT_CARDS } from './tarotDomain'

const update = (model: Tarot.Model, message: Tarot.Message) => Tarot.update(model, message, 'en', true, {})
const view = (model: Tarot.Model) => Tarot.view(model, 'en')
const pull = (model: Tarot.Model) => update(model, Tarot.DrawRequested({ token: model.token }))
const depleted = () => {
  let model = Tarot.init()
  for (let index = 0; index < 77; index++) model = pull(model)[0]
  return model
}

describe('Tarot deck and continuous pile', () => {
  it('has a complete 78-card deck and draws without replacement until all cards are used', () => {
    expect(TAROT_CARDS).toHaveLength(78)
    expect(new Set(TAROT_CARDS.map(card => card[0])).size).toBe(78)
    expect(new Set(TAROT_CARDS.slice(0, 22).map(card => card[3])).size).toBe(22)
    let remaining = fullDeck()
    let seed = 123
    const cards = new Set<number>()
    for (let index = 0; index < 78; index++) {
      const draw = drawCard(remaining, seed)
      cards.add(draw.card)
      remaining = draw.remaining
      seed = draw.seed
    }
    expect(cards.size).toBe(78)
    expect(remaining).toEqual([])
    expect(drawCard(fullDeck(), 123)).not.toEqual(drawCard(fullDeck(), 456))
  })

  it('gives every card a distinct translated name and its own meaning in every language', () => {
    const languages = ['en', 'zh', 'zh-HK', 'fr', 'de', 'fa', 'ms', 'ja']
    expect(new Set(TAROT_CARDS.map((_, index) => meaningKey(index))).size).toBe(78)
    for (const language of languages) {
      const meanings = TAROT_CARDS.map((_, index) => t(meaningKey(index), language))
      expect(new Set(meanings).size).toBe(78)
      for (let index = 0; index < 78; index++) {
        expect(t(cardKey(index), language)).not.toBe(cardKey(index))
        expect(t(meaningKey(index), language)).not.toBe(meaningKey(index))
      }
    }
    expect(t(meaningKey(31), 'en')).toMatch(/too much.*help/i) // Ten of Wands
    expect(t(meaningKey(48), 'en')).toMatch(/kind|feelings/i) // Queen of Cups
    expect(t(meaningKey(57), 'en')).toMatch(/stuck.*point of view/i) // Eight of Swords
    expect(t(meaningKey(69), 'en')).toMatch(/share fairly/i) // Six of Pentacles
  })

  it('samples bounded varied drop angles and keeps older cards at their original angles', () => {
    const angles = new Set<number>()
    let seed = 123
    for (let index = 0; index < 500; index++) {
      const tilt = sampleDropAngle(seed)
      expect(tilt).toEqual(sampleDropAngle(seed))
      expect(tilt.angle).toBeGreaterThanOrEqual(-8)
      expect(tilt.angle).toBeLessThanOrEqual(8)
      angles.add(tilt.angle)
      seed = tilt.seed
    }
    expect(angles.size).toBeGreaterThan(100)
    let model = Tarot.init()
    const original: number[] = []
    for (let index = 0; index < 12; index++) {
      model = pull(model)[0]
      expect(model.pileAngles.slice(0, -1)).toEqual(original)
      original.push(model.pileAngles.at(-1)!)
      expect(model.phase).toBe('ready')
    }
    expect(model.pileAngles).toHaveLength(model.pile.length)
  })

  it('restarts only the new card’s flip while the deck, pile and upright name remain stable', () => {
    const first = pull(Tarot.init())[0]
    const second = pull(first)[0]
    const find = (model: Tarot.Model, className: string) => {
      const pending = [view(model)]
      while (pending.length) {
        const node = pending.pop()!
        if (node.data?.class?.[className]) return node
        node.children?.forEach(child => { if (typeof child !== 'string') pending.push(child) })
      }
      return undefined
    }
    expect(find(first, 'tarot-deck')).toBeDefined()
    expect(find(first, 'tarot-card-flipper--dropping')).toBeDefined()
    expect(find(first, 'tarot-deck')?.key).toBe(find(second, 'tarot-deck')?.key)
    expect(find(first, 'tarot-pile')?.key).toBe(find(second, 'tarot-pile')?.key)
    expect(find(first, 'tarot-card-flipper--dropping')?.key).not.toBe(find(second, 'tarot-card-flipper--dropping')?.key)
    Scene.scene({ update, view }, Scene.with(second),
      Scene.Mount.resolve({ name: 'TarotDeckGestures' }, Tarot.DrawRequested({ token: -1 })),
      Scene.expect(Scene.selector('.tarot-card-front')).toExist(),
      Scene.expect(Scene.selector('.tarot-card-back')).toHaveAttr('aria-hidden', 'true'),
      Scene.expect(Scene.selector('.tarot-card-visual .tarot-face-name')).not.toExist(),
      Scene.expect(Scene.selector('.tarot-face-name')).toHaveText(t(cardKey(second.drawn), 'en')), Scene.Command.expectNone())
  })

  it('keeps each drawn card in the right pile and is immediately ready for another pull', () => {
    Story.story(update, Story.with(Tarot.init()),
      Story.message(Tarot.DrawRequested({ token: 0 })),
      Story.model(model => { expect(model.phase).toBe('ready'); expect(model.pile).toEqual([model.drawn]); expect(model.remaining).toHaveLength(77) }),
      Story.message(Tarot.DrawRequested({ token: 1 })),
      Story.model(model => { expect(model.phase).toBe('ready'); expect(model.pile).toHaveLength(2); expect(model.pile[1]).toBe(model.drawn); expect(new Set(model.pile).size).toBe(2) }),
      Story.Command.expectNone())
  })

  it('automatically returns the full pile to the deck and unlocks another endless cycle', () => {
    const before = depleted()
    const after = pull(before)
    expect(after[1].map(command => command.name)).toEqual(['TarotReshufflePile'])
    expect(update(after[0], Tarot.DrawRequested({ token: after[0].token }))).toEqual([after[0], []])
    Story.story(update, Story.with(before),
      Story.message(Tarot.DrawRequested({ token: before.token })),
      Story.model(model => { expect(model.phase).toBe('shuffling'); expect(model.remaining).toEqual([]); expect(model.pile).toHaveLength(78) }),
      Story.Command.resolve(after[1][0]!, Tarot.ShuffleFinished({ token: after[0].token })),
      Story.model(model => { expect(model.phase).toBe('ready'); expect(model.remaining).toHaveLength(78); expect(model.pile).toEqual([]) }),
      Story.Command.expectNone())
  })

  it('rejects old releases and stale shuffle completions after a mode change or navigation', () => {
    const drawn = pull(Tarot.init())[0]
    expect(update(drawn, Tarot.DrawRequested({ token: 0 }))).toEqual([drawn, []])
    expect(update(drawn, Tarot.DrawRequested({ token: NaN }))).toEqual([drawn, []])
    const shuffling = pull(depleted())[0]
    for (const next of [Tarot.interrupt(shuffling), update(shuffling, Tarot.SetMode({ mode: 'story' }))[0]]) {
      expect(next.phase).toBe('ready')
      expect(next.remaining).toHaveLength(78)
      expect(next.pile).toEqual([])
      expect(update(next, Tarot.ShuffleFinished({ token: shuffling.token }))).toEqual([next, []])
      expect(update(next, Tarot.SeedReady({ token: next.token - 1, seed: 17 }))).toEqual([next, []])
    }
  })

  it('moves each reading card to its marked slot before revealing it, then starts a fresh deck', () => {
    const initial: Tarot.Model = { ...Tarot.init(), mode: 'story' }
    const first = pull(initial)
    const arrivedFirst = update(first[0], Tarot.CardArrived({ token: first[0].token, slot: 0 }))[0]
    const second = pull(arrivedFirst)
    const arrivedSecond = update(second[0], Tarot.CardArrived({ token: second[0].token, slot: 1 }))[0]
    const third = pull(arrivedSecond)
    expect(first[1].map(command => command.name)).toEqual(['TarotMoveCardToSlot'])
    expect(update(first[0], Tarot.DrawRequested({ token: first[0].token }))).toEqual([first[0], []])
    for (const slot of [-1, 1, NaN]) expect(update(first[0], Tarot.CardArrived({ token: first[0].token, slot }))).toEqual([first[0], []])
    Story.story(update, Story.with(initial),
      Story.message(Tarot.DrawRequested({ token: 0 })),
      Story.model(model => { expect(model.phase).toBe('moving'); expect(model.pendingSlot).toBe(0) }),
      Story.Command.resolve(first[1][0]!, Tarot.CardArrived({ token: first[0].token, slot: 0 })),
      Story.message(Tarot.DrawRequested({ token: 1 })),
      Story.model(model => expect(model.pendingSlot).toBe(1)),
      Story.Command.resolve(second[1][0]!, Tarot.CardArrived({ token: second[0].token, slot: 1 })),
      Story.message(Tarot.DrawRequested({ token: 2 })),
      Story.model(model => expect(model.pendingSlot).toBe(2)),
      Story.Command.resolve(third[1][0]!, Tarot.CardArrived({ token: third[0].token, slot: 2 })),
      Story.model(model => { expect(model.phase).toBe('complete'); expect(new Set(model.spread).size).toBe(3); expect(model.pile).toHaveLength(3) }),
      Story.message(Tarot.NextReading({ token: 3 })),
      Story.model(model => { expect(model.spread).toEqual([]); expect(model.pile).toEqual([]); expect(model.pileAngles).toEqual([]); expect(model.remaining).toEqual(fullDeck()); expect(model.cursor).toBe(-1); expect(model.phase).toBe('ready') }),
      Story.Command.expectNone())
  })

  it('resolves a reading flight without a mounted scene and reveals its card without locking', async () => {
    const [model, commands] = pull({ ...Tarot.init(), mode: 'story' })
    const done = await Effect.runPromise(commands[0]!.effect)
    expect(done).toEqual(Tarot.CardArrived({ token: model.token, slot: 0 }))
    const next = update(model, done)[0]
    expect(next.phase).toBe('ready')
    expect(next.pendingSlot).toBe(-1)
    expect(next.spread).toEqual([model.drawn])
  })

  it('browses backwards without changing the deck, rejects duplicate back clicks, and appends a new draw', () => {
    const first = pull(Tarot.init())[0]
    const second = pull(first)[0]
    const third = pull(second)[0]
    const previous = update(third, Tarot.PreviousCard({ token: third.token }))[0]
    expect(previous.cursor).toBe(1)
    expect(previous.drawn).toBe(second.drawn)
    expect(previous.pile).toBe(third.pile)
    expect(previous.pileAngles).toBe(third.pileAngles)
    expect(previous.remaining).toBe(third.remaining)
    expect(previous.seed).toBe(third.seed)
    expect(update(previous, Tarot.PreviousCard({ token: third.token }))).toEqual([previous, []])
    const oldest = update(previous, Tarot.PreviousCard({ token: previous.token }))[0]
    expect(oldest.cursor).toBe(0)
    expect(oldest.drawn).toBe(first.drawn)
    expect(update(oldest, Tarot.PreviousCard({ token: oldest.token }))).toEqual([oldest, []])
    const appended = pull(oldest)[0]
    expect(appended.cursor).toBe(3)
    expect(appended.pile.slice(0, 3)).toEqual(third.pile)
    expect(appended.pile).toHaveLength(4)
    expect(new Set(appended.pile).size).toBe(4)
    expect(appended.remaining).toHaveLength(74)
    Scene.scene({ update, view }, Scene.with(oldest),
      Scene.Mount.resolve({ name: 'TarotDeckGestures' }, Tarot.DrawRequested({ token: -1 })),
      Scene.expect(Scene.role('button', { name: t('tarotPreviousCard', 'en') })).toBeDisabled(),
      Scene.expect(Scene.selector('.tarot-face-name')).toHaveText(t(cardKey(first.drawn), 'en')), Scene.Command.expectNone())
  })

  it('resets the whole deck on either mode switch and invalidates an in-flight reading', () => {
    const exploring = pull(pull(Tarot.init())[0])[0]
    const reading = update(exploring, Tarot.SetMode({ mode: 'story' }))[0]
    expect(reading).toMatchObject({ remaining: fullDeck(), pile: [], pileAngles: [], spread: [], cursor: -1, pendingSlot: -1, drawn: -1, mode: 'story', phase: 'ready' })
    const inFlight = pull(reading)[0]
    const exploreAgain = update(inFlight, Tarot.SetMode({ mode: 'recognize' }))[0]
    expect(exploreAgain).toMatchObject({ remaining: fullDeck(), pile: [], spread: [], cursor: -1, mode: 'recognize', phase: 'ready' })
    expect(update(exploreAgain, Tarot.CardArrived({ token: inFlight.token, slot: 0 }))).toEqual([exploreAgain, []])
    const interrupted = Tarot.interrupt(inFlight)
    expect(interrupted.phase).toBe('ready')
    expect(interrupted.pendingSlot).toBe(-1)
    expect(interrupted.spread).toHaveLength(1)
    expect(update(interrupted, Tarot.CardArrived({ token: inFlight.token, slot: 0 }))).toEqual([interrupted, []])
  })

  it('speaks the previous card name without re-playing its drop sound', async () => {
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    const sound = vi.spyOn(Audio, 'cardDrop')
    const two = pull(pull(Tarot.init())[0])[0]
    const [model, commands] = Tarot.update(two, Tarot.PreviousCard({ token: two.token }), 'en', false, {})
    const root = document.createElement('div')
    root.className = 'tarot-card'; root.dataset.tarotToken = String(model.token)
    document.body.append(root)
    try {
      await Effect.runPromise(commands[0]!.effect)
      expect(speak).toHaveBeenCalledExactlyOnceWith(t(cardKey(model.drawn), 'en'), { lang: 'en' })
      expect(sound).not.toHaveBeenCalled()
    } finally { root.remove(); speak.mockRestore(); sound.mockRestore() }
  })

  it('puts only the deck and marked slots in the compact reading table', () => {
    const model: Tarot.Model = { ...Tarot.init(), mode: 'story' }
    Scene.scene({ update, view }, Scene.with(model),
      Scene.Mount.resolve({ name: 'TarotDeckGestures' }, Tarot.DrawRequested({ token: -1 })),
      Scene.expect(Scene.selector('.tarot-card--story')).toExist(),
      Scene.expect(Scene.selector('.tarot-table--story .tarot-deck')).toExist(),
      Scene.expect(Scene.selector('.tarot-table--story [data-tarot-slot="0"]')).toExist(),
      Scene.expect(Scene.selector('.tarot-table--story [data-tarot-slot="1"]')).toExist(),
      Scene.expect(Scene.selector('.tarot-table--story [data-tarot-slot="2"]')).toExist(),
      Scene.expect(Scene.selector('.tarot-pile')).not.toExist(),
      Scene.expect(Scene.selector('.tarot-history')).not.toExist(), Scene.Command.expectNone())
    expect(update(model, Tarot.PreviousCard({ token: model.token }))).toEqual([model, []])
  })

  it('reads only the localized card name immediately, and respects mute and stale renders', async () => {
    const order: string[] = []
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => { order.push('speech') })
    const sound = vi.spyOn(Audio, 'cardDrop').mockImplementation(msg => ({ name: 'TarotCardDrop', effect: Effect.sync(() => { order.push('sound'); return msg }) }))
    const drawn = Tarot.update(Tarot.init(), Tarot.DrawRequested({ token: 0 }), 'fr', false, { rate: 0.8, pitch: 1.2 })
    const root = document.createElement('div')
    root.className = 'tarot-card'
    root.dataset.tarotToken = String(drawn[0].token)
    document.body.append(root)
    try {
      expect(drawn[1].map(command => command.name)).toEqual(['TarotFeedback'])
      await Effect.runPromise(drawn[1][0]!.effect)
      expect(speak).toHaveBeenCalledExactlyOnceWith(t(cardKey(drawn[0].drawn), 'fr'), { rate: 0.8, pitch: 1.2, lang: 'fr' })
      root.dataset.tarotToken = String(drawn[0].token + 1)
      await Effect.runPromise(drawn[1][0]!.effect)
      expect(speak).toHaveBeenCalledTimes(1)
      expect(sound).toHaveBeenCalledTimes(1)
      expect(order).toEqual(['speech', 'sound'])
      expect(pull(Tarot.init())[1]).toEqual([])
    } finally { root.remove(); speak.mockRestore(); sound.mockRestore() }
  })

  it('keeps the drawn card and resolves feedback if the drop sound fails', async () => {
    const sound = vi.spyOn(Audio, 'cardDrop').mockImplementation(() => ({ name: 'TarotCardDrop', effect: Effect.die(new Error('Audio unavailable')) }))
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    const [model, commands] = Tarot.update(Tarot.init(), Tarot.DrawRequested({ token: 0 }), 'en', false, {})
    const root = document.createElement('div')
    root.className = 'tarot-card'; root.dataset.tarotToken = String(model.token)
    document.body.append(root)
    try {
      expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Tarot.FeedbackFinished({ token: model.token }))
      expect(speak).toHaveBeenCalledOnce()
      expect(model.phase).toBe('ready')
      expect(model.pile).toEqual([model.drawn])
    } finally { root.remove(); sound.mockRestore(); speak.mockRestore() }
  })

  it('exposes the always-ready deck and a visible top-card name without quiz choices', () => {
    const model = pull(Tarot.init())[0]
    Scene.scene({ update, view }, Scene.with(model),
      Scene.Mount.resolve({ name: 'TarotDeckGestures' }, Tarot.DrawRequested({ token: -1 })),
      Scene.expect(Scene.role('button', { name: t('tarotRecognize', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('status')).toHaveAttr('aria-live', 'polite'),
      Scene.expect(Scene.role('button', { name: t('tarotPull', 'en') })).not.toBeDisabled(),
      Scene.expect(Scene.role('img', { name: t(cardKey(model.drawn), 'en') })).toExist(),
      Scene.expect(Scene.selector('.tarot-face-name')).toHaveText(t(cardKey(model.drawn), 'en')),
      Scene.expect(Scene.selector('.tarot-choices')).not.toExist(), Scene.Command.expectNone())
  })
})
