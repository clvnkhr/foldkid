import { Match as M, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { t } from '../i18n'
import * as FindIt from './findit'

export const PAIR_COUNT = 6

const MemoryCard = S.Struct({
  id: S.Number,
  pairId: S.Number,
  value: S.String,
  flipped: S.Boolean,
  matched: S.Boolean,
})
type MemoryCard = typeof MemoryCard.Type

export const Model = S.Struct({
  deck: S.Array(MemoryCard),
  flippedIds: S.Array(S.Number),
  attempts: S.Number,
  won: S.Boolean,
  enabledPacks: S.Array(FindIt.EmojiPackKey),
})
export type Model = typeof Model.Type

export const ClickedCard = m('MemoryClickedCard', { id: S.Number })
export const ClickedReset = m('MemoryClickedReset')
export const SetEmojiPackEnabled = m('MemorySetEmojiPackEnabled', { key: FindIt.EmojiPackKey, value: S.Boolean })

export const Message = S.Union([ClickedCard, ClickedReset, SetEmojiPackEnabled])
export type Message = typeof Message.Type

const shuffle = <A>(items: readonly A[], random: () => number = Math.random): A[] => {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[next[i], next[j]] = [next[j]!, next[i]!]
  }
  return next
}

export const buildDeck = (
  enabledPacks: readonly string[] = FindIt.DEFAULT_EMOJI_PACK_KEYS,
  random: () => number = Math.random,
): MemoryCard[] => {
  const pool = shuffle(FindIt.emojiPoolForPacks(enabledPacks), random)
  const pairs = pool.slice(0, PAIR_COUNT)
  const unshuffledCards = pairs.flatMap((value, pairId) => [
    { pairId, value },
    { pairId, value },
  ])
  return shuffle(unshuffledCards, random).map((card, id) => ({
    id,
    pairId: card.pairId,
    value: card.value,
    flipped: false,
    matched: false,
  }))
}

export const init = (enabledPacks: readonly string[] = FindIt.DEFAULT_EMOJI_PACK_KEYS): Model => ({
  deck: buildDeck(enabledPacks),
  flippedIds: [],
  attempts: 0,
  won: false,
  enabledPacks: FindIt.normalizeEmojiPackKeys(enabledPacks),
})

const cardById = (deck: readonly MemoryCard[], id: number): MemoryCard | undefined =>
  deck.find(card => card.id === id)

const closeUnmatchedFlips = (model: Model): Model => {
  if (model.flippedIds.length !== 2) return model
  const [aId, bId] = model.flippedIds
  const a = aId === undefined ? undefined : cardById(model.deck, aId)
  const b = bId === undefined ? undefined : cardById(model.deck, bId)
  if (!a || !b || a.pairId === b.pairId) return model
  return {
    ...model,
    flippedIds: [],
    deck: model.deck.map(card =>
      card.id === a.id || card.id === b.id
        ? { ...card, flipped: false }
        : card,
    ),
  }
}

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      MemoryClickedCard: (msg) => {
        const closed = closeUnmatchedFlips(model)
        if (closed.won) return [closed, []]
        const picked = cardById(closed.deck, msg.id)
        if (!picked || picked.flipped || picked.matched) return [closed, []]

        const flippedIds = [...closed.flippedIds, picked.id]
        let deck = closed.deck.map(card =>
          card.id === picked.id ? { ...card, flipped: true } : card,
        )
        let attempts = closed.attempts
        let nextFlippedIds = flippedIds

        if (flippedIds.length === 2) {
          attempts += 1
          const [firstId, secondId] = flippedIds
          const first = firstId === undefined ? undefined : cardById(deck, firstId)
          const second = secondId === undefined ? undefined : cardById(deck, secondId)
          if (first && second && first.pairId === second.pairId) {
            deck = deck.map(card =>
              card.id === first.id || card.id === second.id
                ? { ...card, matched: true }
                : card,
            )
            nextFlippedIds = []
          }
        }

        const won = deck.every(card => card.matched)
        return [{ ...closed, deck, flippedIds: nextFlippedIds, attempts, won }, []]
      },
      MemoryClickedReset: () => [init(model.enabledPacks), []],
      MemorySetEmojiPackEnabled: (msg) => {
        const current = FindIt.normalizeEmojiPackKeys(model.enabledPacks)
        if (!msg.value && current.length === 1 && current[0] === msg.key) return [model, []]
        const nextPacks = FindIt.normalizeEmojiPackKeys(msg.value
          ? [...current, msg.key]
          : current.filter(key => key !== msg.key))
        if (nextPacks.length === current.length && nextPacks.every((key, i) => key === current[i])) return [model, []]
        return [init(nextPacks), []]
      },
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()
  const matchedCount = model.deck.filter(card => card.matched).length / 2

  return h.div([h.Class('page memory-page')], [
    h.div([h.Class('card memory-card')], [
      h.h1([h.Class('title')], [t('memoryCardsTitle', language)]),
      h.div([h.Class('memory-stats')], [
        h.span([], [`${t('memoryAttempts', language)}: ${model.attempts}`]),
        h.span([], [`${t('memoryMatched', language)}: ${matchedCount}/${PAIR_COUNT}`]),
      ]),
      h.div([h.Class('memory-grid')], [
        ...model.deck.map(card =>
          h.button(
            [
              h.Key(card.id.toString()),
              h.Class('memory-tile' + (card.flipped ? ' memory-tile--flipped' : '') + (card.matched ? ' memory-tile--matched' : '')),
              h.OnClick(ClickedCard({ id: card.id })),
              h.Disabled(card.matched),
              h.Attribute('aria-label', card.flipped || card.matched ? card.value : t('memoryCardsTitle', language)),
            ],
            [card.flipped || card.matched ? card.value : '?'],
          ),
        ),
      ]),
      model.won
        ? h.div([h.Class('memory-win')], [t('memoryYouWon', language)])
        : null,
      h.button([h.OnClick(ClickedReset()), h.Class('btn btn-secondary')], [t('reset', language)]),
    ]),
  ])
}
