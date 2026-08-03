import { Match as M, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { t } from '../i18n'
import { speak, type SpeechOptions } from '../speech'

export type LetterWord = Readonly<{
  word: string
  emoji: string
}>

export const KEYBOARD_ROWS = [
  'QWERTYUIOP',
  'ASDFGHJKL',
  'ZXCVBNM',
] as const

export const LETTER_WORDS: Readonly<Record<string, readonly LetterWord[]>> = {
  A: [{ word: 'apple', emoji: '🍎' }, { word: 'astronaut', emoji: '🧑‍🚀' }, { word: 'ant', emoji: '🐜' }],
  B: [{ word: 'balloon', emoji: '🎈' }, { word: 'bear', emoji: '🐻' }, { word: 'banana', emoji: '🍌' }],
  C: [{ word: 'cat', emoji: '🐈' }, { word: 'cake', emoji: '🍰' }, { word: 'car', emoji: '🚗' }],
  D: [{ word: 'dinosaur', emoji: '🦕' }, { word: 'dog', emoji: '🐕' }, { word: 'drum', emoji: '🥁' }],
  E: [{ word: 'elephant', emoji: '🐘' }, { word: 'egg', emoji: '🥚' }, { word: 'eagle', emoji: '🦅' }],
  F: [{ word: 'fish', emoji: '🐟' }, { word: 'frog', emoji: '🐸' }, { word: 'flower', emoji: '🌼' }],
  G: [{ word: 'giraffe', emoji: '🦒' }, { word: 'guitar', emoji: '🎸' }, { word: 'grapes', emoji: '🍇' }],
  H: [{ word: 'helicopter', emoji: '🚁' }, { word: 'hippo', emoji: '🦛' }, { word: 'hat', emoji: '🎩' }],
  I: [{ word: 'igloo', emoji: '🧊' }, { word: 'ice cream', emoji: '🍦' }, { word: 'insect', emoji: '🐞' }],
  J: [{ word: 'jellyfish', emoji: '🪼' }, { word: 'juice', emoji: '🧃' }, { word: 'jigsaw', emoji: '🧩' }],
  K: [{ word: 'kite', emoji: '🪁' }, { word: 'kangaroo', emoji: '🦘' }, { word: 'key', emoji: '🔑' }],
  L: [{ word: 'lion', emoji: '🦁' }, { word: 'lemon', emoji: '🍋' }, { word: 'leaf', emoji: '🍃' }],
  M: [{ word: 'moon', emoji: '🌙' }, { word: 'monkey', emoji: '🐒' }, { word: 'music', emoji: '🎵' }],
  N: [{ word: 'nest', emoji: '🪺' }, { word: 'noodles', emoji: '🍜' }, { word: 'night', emoji: '🌃' }],
  O: [{ word: 'octopus', emoji: '🐙' }, { word: 'orange', emoji: '🍊' }, { word: 'owl', emoji: '🦉' }],
  P: [{ word: 'penguin', emoji: '🐧' }, { word: 'pizza', emoji: '🍕' }, { word: 'paint', emoji: '🎨' }],
  Q: [{ word: 'queen', emoji: '👑' }, { word: 'quiet', emoji: '🤫' }, { word: 'quilt', emoji: '🧵' }],
  R: [{ word: 'rainbow', emoji: '🌈' }, { word: 'robot', emoji: '🤖' }, { word: 'rocket', emoji: '🚀' }],
  S: [{ word: 'sun', emoji: '☀️' }, { word: 'snake', emoji: '🐍' }, { word: 'star', emoji: '⭐' }],
  T: [{ word: 'tiger', emoji: '🐯' }, { word: 'train', emoji: '🚂' }, { word: 'turtle', emoji: '🐢' }],
  U: [{ word: 'umbrella', emoji: '☂️' }, { word: 'unicorn', emoji: '🦄' }, { word: 'up', emoji: '⬆️' }],
  V: [{ word: 'violin', emoji: '🎻' }, { word: 'volcano', emoji: '🌋' }, { word: 'van', emoji: '🚐' }],
  W: [{ word: 'whale', emoji: '🐋' }, { word: 'watermelon', emoji: '🍉' }, { word: 'window', emoji: '🪟' }],
  X: [{ word: 'xylophone', emoji: '🎶' }, { word: 'x-ray', emoji: '🩻' }],
  Y: [{ word: 'yak', emoji: '🐂' }, { word: 'yacht', emoji: '⛵' }, { word: 'yoyo', emoji: '🪀' }],
  Z: [{ word: 'zebra', emoji: '🦓' }, { word: 'zoo', emoji: '🦁' }, { word: 'zip', emoji: '🤐' }],
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export const Model = S.Struct({
  selectedLetter: S.String,
  selectedWordIndex: S.Number,
  nextWordIndices: S.Array(S.Number),
  pressCount: S.Number,
})
export type Model = typeof Model.Type

export const PressedLetter = m('TalkingKeyboardPressedLetter', { letter: S.String })
export const SoundPlayed = m('TalkingKeyboardSoundPlayed')
export const Message = S.Union([PressedLetter, SoundPlayed])
export type Message = typeof Message.Type

export const init = (): Model => ({
  selectedLetter: 'A',
  selectedWordIndex: 0,
  nextWordIndices: ALPHABET.map(() => 0),
  pressCount: 0,
})

const letterIndex = (letter: string): number => ALPHABET.indexOf(letter)

export const wordsFor = (letter: string): readonly LetterWord[] => LETTER_WORDS[letter] ?? []

export const selectedWordFor = (letter: string, index: number): LetterWord | undefined => {
  const words = wordsFor(letter)
  if (words.length === 0) return undefined
  return words[((index % words.length) + words.length) % words.length]
}

export const promptFor = (letter: string, word: LetterWord): string =>
  `${letter} is for ${word.word}.`

export const update = (
  model: Model,
  message: Message,
  muted: boolean = false,
  speech: SpeechOptions = {},
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      TalkingKeyboardPressedLetter: (msg) => {
        const letter = msg.letter.toUpperCase()
        const index = letterIndex(letter)
        const words = wordsFor(letter)
        if (index < 0 || words.length === 0) return [model, []]

        const selectedWordIndex = (model.nextWordIndices[index] ?? 0) % words.length
        const word = selectedWordFor(letter, selectedWordIndex)
        if (!word) return [model, []]
        const nextWordIndices = [...model.nextWordIndices]
        nextWordIndices[index] = (selectedWordIndex + 1) % words.length
        const next = {
          ...model,
          selectedLetter: letter,
          selectedWordIndex,
          nextWordIndices,
          pressCount: model.pressCount + 1,
        }
        return [
          next,
          muted ? [] : [speak(promptFor(letter, word), SoundPlayed(), { ...speech, lang: 'en' })],
        ]
      },
      TalkingKeyboardSoundPlayed: () => [model, []],
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()
  const word = selectedWordFor(model.selectedLetter, model.selectedWordIndex) ?? selectedWordFor('A', 0)!
  const firstLetter = word.word.slice(0, 1)
  const restOfWord = word.word.slice(1)

  return h.div([h.Class('page talking-keyboard-page')], [
    h.div([h.Class('card talking-keyboard-card')], [
      h.h1([h.Class('title')], [t('talkingKeyboardTitle', language)]),
      h.p([h.Class('talking-keyboard-instruction')], [t('talkingKeyboardPrompt', language)]),
      h.div([h.Class('talking-keyboard-showcase'), h.Key(`word-${model.pressCount}`)], [
        h.div([h.Class('talking-keyboard-emoji'), h.Attribute('aria-hidden', 'true')], [word.emoji]),
        h.div([h.Class('talking-keyboard-sentence')], [
          h.span([h.Class('talking-keyboard-letter')], [model.selectedLetter]),
          h.span([h.Class('talking-keyboard-is-for')], [' is for']),
        ]),
        h.div([h.Class('talking-keyboard-word'), h.Attribute('aria-label', word.word)], [
          h.span([h.Class('talking-keyboard-word-letter')], [firstLetter]),
          h.span([], [restOfWord]),
        ]),
        h.p([h.Class('talking-keyboard-choice-count')], [
          t('talkingKeyboardMoreWords', language),
        ]),
      ]),
      h.div([h.Class('talking-keyboard-keys'), h.Attribute('aria-label', t('talkingKeyboardTitle', language))], [
        ...KEYBOARD_ROWS.map((row, rowIndex) =>
          h.div([h.Class(`talking-keyboard-row talking-keyboard-row--${rowIndex}`)], [
            ...row.split('').map(letter =>
              h.button(
                [
                  h.Key(letter),
                  h.Class('talking-keyboard-key' + (letter === model.selectedLetter ? ' talking-keyboard-key--selected' : '')),
                  h.Attribute('aria-label', promptFor(letter, selectedWordFor(letter, model.nextWordIndices[letterIndex(letter)] ?? 0) ?? selectedWordFor('A', 0)!)),
                  h.OnPointerUp(() => Option.some(PressedLetter({ letter }))),
                  h.OnKeyUpPreventDefault((key) =>
                    key === 'Enter' || key === ' ' ? Option.some(PressedLetter({ letter })) : Option.none(),
                  ),
                ],
                [letter],
              ),
            ),
          ]),
        ),
      ]),
    ]),
  ])
}
