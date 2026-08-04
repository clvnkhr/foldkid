import { Effect, Match as M, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { t } from '../i18n'
import { getContext } from '../audio'
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
  Z: [{ word: 'zebra', emoji: '🦓' }, { word: 'zoo', emoji: '🦒🐘🦁' }, { word: 'zip', emoji: '🤐' }],
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const QuestionState = S.Union([S.Literal('idle'), S.Literal('asking'), S.Literal('correct'), S.Literal('failed')])

export type LetterQuestion = Readonly<{
  letter: string
  wordIndex: number
  word: LetterWord
}>

export const Model = S.Struct({
  selectedLetter: S.String,
  selectedWordIndex: S.Number,
  nextWordIndices: S.Array(S.Number),
  pressCount: S.Number,
  questionState: QuestionState,
  questionLetter: S.String,
  questionWordIndex: S.Number,
  lastGuess: S.String,
})
export type Model = typeof Model.Type

export const PressedLetter = m('TalkingKeyboardPressedLetter', { letter: S.String })
export const AskQuestion = m('TalkingKeyboardAskQuestion')
export const SoundPlayed = m('TalkingKeyboardSoundPlayed')
export const Message = S.Union([PressedLetter, AskQuestion, SoundPlayed])
export type Message = typeof Message.Type

export const init = (): Model => ({
  selectedLetter: 'A',
  selectedWordIndex: 0,
  nextWordIndices: ALPHABET.map(() => 0),
  pressCount: 0,
  questionState: 'idle',
  questionLetter: '',
  questionWordIndex: 0,
  lastGuess: '',
})

const letterIndex = (letter: string): number => ALPHABET.indexOf(letter)

export const wordsFor = (letter: string): readonly LetterWord[] => LETTER_WORDS[letter] ?? []

export const QUESTIONS: readonly LetterQuestion[] = ALPHABET.flatMap(letter =>
  wordsFor(letter).map((word, wordIndex) => ({ letter, wordIndex, word })),
)

export const selectedWordFor = (letter: string, index: number): LetterWord | undefined => {
  const words = wordsFor(letter)
  if (words.length === 0) return undefined
  return words[((index % words.length) + words.length) % words.length]
}

export const promptFor = (letter: string, word: LetterWord): string =>
  `${letter} is for ${word.word}.`

export const questionPromptFor = (word: LetterWord): string =>
  `Which letter is for ${word.word}?`

export const questionFor = (random: () => number = Math.random): LetterQuestion | undefined =>
  QUESTIONS[Math.floor(random() * QUESTIONS.length)]

const playFanfare = <Msg>(msg: Msg) => ({
  name: 'PlayFanfare' as const,
  effect: Effect.sync(() => {
    const ctx = getContext()
    if (!ctx) return
    const now = ctx.currentTime
    const note = (frequency: number, start: number, duration: number): void => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'triangle'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.connect(gain).connect(ctx.destination)
      oscillator.start(start)
      oscillator.stop(start + duration)
    }
    note(523, now, 0.15)
    note(659, now + 0.1, 0.15)
    note(784, now + 0.2, 0.18)
    note(1047, now + 0.3, 0.42)
  }).pipe(Effect.as(msg)),
})

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

        if (model.questionState === 'asking') {
          const correct = letter === model.questionLetter
          const next = {
            ...model,
            selectedLetter: letter,
            questionState: correct ? 'correct' as const : 'failed' as const,
            lastGuess: letter,
            pressCount: model.pressCount + 1,
          }
          return [next, correct && !muted ? [playFanfare(SoundPlayed())] : []]
        }

        const normalModel = model.questionState === 'idle'
          ? model
          : {
              ...model,
              questionState: 'idle' as const,
              questionLetter: '',
              questionWordIndex: 0,
              lastGuess: '',
            }
        const selectedWordIndex = (normalModel.nextWordIndices[index] ?? 0) % words.length
        const word = selectedWordFor(letter, selectedWordIndex)
        if (!word) return [model, []]
        const nextWordIndices = [...normalModel.nextWordIndices]
        nextWordIndices[index] = (selectedWordIndex + 1) % words.length
        const next = {
          ...normalModel,
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
      TalkingKeyboardAskQuestion: () => {
        const question = questionFor()
        if (!question) return [model, []]
        const next = {
          ...model,
          questionState: 'asking' as const,
          questionLetter: question.letter,
          questionWordIndex: question.wordIndex,
          lastGuess: '',
          pressCount: model.pressCount + 1,
        }
        return [
          next,
          muted ? [] : [speak(questionPromptFor(question.word), SoundPlayed(), { ...speech, lang: 'en' })],
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
  const questionWord = selectedWordFor(model.questionLetter, model.questionWordIndex) ?? selectedWordFor('A', 0)!
  const questionActive = model.questionState !== 'idle'

  return h.div([h.Class('page talking-keyboard-page')], [
    h.div([h.Class('card talking-keyboard-card')], [
      h.h1([h.Class('title')], [t('talkingKeyboardTitle', language)]),
      h.p([h.Class('talking-keyboard-instruction')], [
        questionActive ? t('talkingKeyboardChooseLetter', language) : t('talkingKeyboardPrompt', language),
      ]),
      questionActive
        ? h.div([
          h.Class('talking-keyboard-showcase talking-keyboard-showcase--question' + (
            model.questionState === 'correct'
              ? ' talking-keyboard-showcase--correct'
              : model.questionState === 'failed'
                ? ' talking-keyboard-showcase--failed'
                : ''
          )),
          h.Key(`question-${model.pressCount}`),
          h.Attribute('aria-live', 'polite'),
        ], [
          h.div([h.Class('talking-keyboard-emoji'), h.Attribute('aria-hidden', 'true')], [questionWord.emoji]),
          h.div([h.Class('talking-keyboard-question')], [t('talkingKeyboardWhichLetter', language)]),
          model.questionState === 'correct' || model.questionState === 'failed'
            ? h.div([h.Class('talking-keyboard-answer')], [
              h.span([h.Class('talking-keyboard-letter')], [model.questionLetter]),
              h.span([h.Class('talking-keyboard-is-for')], [' is for ']),
              h.span([h.Class('talking-keyboard-word-letter')], [questionWord.word.slice(0, 1)]),
              h.span([], [questionWord.word.slice(1)]),
              '!',
            ])
            : h.div([h.Class('talking-keyboard-question-mark')], ['?']),
          model.questionState === 'correct'
            ? h.p([h.Class('talking-keyboard-correct')], [`🎉 ${t('talkingKeyboardCorrect', language)}`])
            : model.questionState === 'failed'
              ? h.p([h.Class('talking-keyboard-failed')], [t('talkingKeyboardRightAnswer', language)])
              : null,
        ])
        : h.div([h.Class('talking-keyboard-showcase'), h.Key(`word-${model.pressCount}`)], [
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
            ...(rowIndex === KEYBOARD_ROWS.length - 1 ? `${row}?` : row).split('').map(letter =>
              h.button(
                [
                  h.Key(letter),
                  h.Class('talking-keyboard-key' + (
                    letter === '?'
                      ? ' talking-keyboard-key--question'
                      : model.questionState === 'failed' && letter === model.questionLetter
                        ? ' talking-keyboard-key--answer'
                        : model.questionState === 'asking' && letter === model.lastGuess
                        ? ' talking-keyboard-key--wrong'
                        : letter === model.selectedLetter
                          ? ' talking-keyboard-key--selected'
                          : ''
                  )),
                  h.Attribute('aria-label', letter === '?'
                    ? t('talkingKeyboardAskQuestion', language)
                    : promptFor(letter, selectedWordFor(letter, model.nextWordIndices[letterIndex(letter)] ?? 0) ?? selectedWordFor('A', 0)!)),
                  h.OnPointerUp(() => Option.some(letter === '?' ? AskQuestion() : PressedLetter({ letter }))),
                  h.OnKeyUpPreventDefault((key) =>
                    key === 'Enter' || key === ' '
                      ? Option.some(letter === '?' ? AskQuestion() : PressedLetter({ letter }))
                      : Option.none(),
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
