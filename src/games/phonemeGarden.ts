import { Match as M, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { playAudioFile } from '../audio'
import { t } from '../i18n'
import { speak, type SpeechOptions } from '../speech'

export type PhonemeCard = Readonly<{
  id: string
  label: string
  ipa: string
  name: string
  exampleWord: string
  exampleImage: string
  audioSrc: string
}>

const phonemeAudio = (fileName: string): string =>
  `${import.meta.env.BASE_URL}audio/phonemes/${fileName}`

export const PHONEME_CARDS: ReadonlyArray<PhonemeCard> = [
  {
    id: 'oo',
    label: 'oo',
    ipa: 'u',
    name: 'close back rounded vowel',
    exampleWord: 'moon',
    exampleImage: '🌙',
    audioSrc: phonemeAudio('close-back-rounded-vowel.m4a'),
  },
  {
    id: 'ee',
    label: 'ee',
    ipa: 'i',
    name: 'close front unrounded vowel',
    exampleWord: 'bee',
    exampleImage: '🐝',
    audioSrc: phonemeAudio('close-front-unrounded-vowel.m4a'),
  },
  {
    id: 'a',
    label: 'a',
    ipa: 'a',
    name: 'open front unrounded vowel',
    exampleWord: 'apple',
    exampleImage: '🍎',
    audioSrc: phonemeAudio('open-front-unrounded-vowel.m4a'),
  },
  {
    id: 'aw',
    label: 'aw',
    ipa: 'ɔ',
    name: 'open-mid back rounded vowel',
    exampleWord: 'ball',
    exampleImage: '⚽',
    audioSrc: phonemeAudio('open-mid-back-rounded-vowel.m4a'),
  },
  {
    id: 'voiced-th',
    label: 'voiced th',
    ipa: 'ð',
    name: 'voiced dental fricative',
    exampleWord: 'this',
    exampleImage: '☝️',
    audioSrc: phonemeAudio('voiced-dental-fricative.m4a'),
  },
  {
    id: 'sh',
    label: 'sh',
    ipa: 'ʃ',
    name: 'voiceless postalveolar fricative',
    exampleWord: 'ship',
    exampleImage: '🚢',
    audioSrc: phonemeAudio('voiceless-postalveolar-fricative.m4a'),
  },
  {
    id: 'ng',
    label: 'ng',
    ipa: 'ŋ',
    name: 'velar nasal',
    exampleWord: 'ring',
    exampleImage: '💍',
    audioSrc: phonemeAudio('velar-nasal.m4a'),
  },
  {
    id: 'f',
    label: 'f',
    ipa: 'f',
    name: 'voiceless labiodental fricative',
    exampleWord: 'fish',
    exampleImage: '🐟',
    audioSrc: phonemeAudio('voiceless-labiodental-fricative.m4a'),
  },
  {
    id: 'z',
    label: 'z',
    ipa: 'z',
    name: 'voiced alveolar sibilant',
    exampleWord: 'zip',
    exampleImage: '🤐',
    audioSrc: phonemeAudio('voiced-alveolar-sibilant.m4a'),
  },
]

const PHONEME_IDS = new Set(PHONEME_CARDS.map(card => card.id))

export const Model = S.Struct({
  flippedIds: S.Array(S.String),
})
export type Model = typeof Model.Type

export const ClickedCard = m('PhonemeGardenClickedCard', { id: S.String })
export const ClickedExample = m('PhonemeGardenClickedExample', { id: S.String })
export const SoundPlayed = m('PhonemeGardenSoundPlayed')

export const Message = S.Union([ClickedCard, ClickedExample, SoundPlayed])
export type Message = typeof Message.Type

export const init = (): Model => ({ flippedIds: [] })

const cardById = (id: string): PhonemeCard | undefined =>
  PHONEME_CARDS.find(card => card.id === id)

export const update = (
  model: Model,
  message: Message,
  muted: boolean = false,
  speech: SpeechOptions = {},
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      PhonemeGardenClickedCard: (msg) => {
        const card = cardById(msg.id)
        if (!card) return [model, []]
        const flipped = model.flippedIds.includes(card.id)
        const flippedIds = flipped
          ? model.flippedIds.filter(id => id !== card.id)
          : [...model.flippedIds, card.id]
        return [
          { ...model, flippedIds },
          muted ? [] : [playAudioFile(card.audioSrc, SoundPlayed())],
        ]
      },
      PhonemeGardenClickedExample: (msg) => {
        const card = cardById(msg.id)
        if (!card) return [model, []]
        return [
          { ...model, flippedIds: model.flippedIds.filter(id => id !== card.id) },
          muted ? [] : [speak(card.exampleWord, SoundPlayed(), { ...speech, lang: 'en' })],
        ]
      },
      PhonemeGardenSoundPlayed: () => [model, []],
    }),
  )

export const isValidCardId = (id: string): boolean => PHONEME_IDS.has(id)

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()

  return h.div([h.Class('page phoneme-page')], [
    h.div([h.Class('card phoneme-card')], [
      h.h1([h.Class('title')], [t('phonemeGardenTitle', language)]),
      h.div([h.Class('phoneme-grid')], [
        ...PHONEME_CARDS.map(card => {
          const flipped = model.flippedIds.includes(card.id)
          return h.button(
            [
              h.Key(card.id),
              h.Class('phoneme-tile' + (flipped ? ' phoneme-tile--flipped' : '')),
              h.OnClick(flipped ? ClickedExample({ id: card.id }) : ClickedCard({ id: card.id })),
              h.Attribute('aria-label', flipped ? card.exampleWord : `${card.label} ${card.name}`),
            ],
            [
              h.span([h.Class('phoneme-tile-inner')], [
                flipped
                  ? h.span([h.Class('phoneme-example')], [
                    h.span([h.Class('phoneme-picture')], [card.exampleImage]),
                    h.span([h.Class('phoneme-word')], [card.exampleWord]),
                  ])
                  : h.span([h.Class('phoneme-front')], [
                    h.span([h.Class('phoneme-label')], [card.label]),
                    h.span([h.Class('phoneme-ipa')], [`/${card.ipa}/`]),
                    h.span([h.Class('phoneme-name')], [card.name]),
                  ]),
              ]),
            ],
          )
        }),
      ]),
    ]),
  ])
}
