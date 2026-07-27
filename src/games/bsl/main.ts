import { Match as M, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { t } from '../../i18n'
import { speak } from '../../speech'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const OPTION_COUNT = 4
const ROUNDS_PER_GAME = 10

const bslImage = (letter: string): string =>
  `${import.meta.env.BASE_URL}images/bsl/bsl_${letter}.svg`

const shuffle = <T>(arr: readonly T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

const generateRound = (): { letter: string; options: string[] } => {
  const letter = ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!
  const others = shuffle(ALPHABET.filter(l => l !== letter)).slice(0, OPTION_COUNT - 1)
  const options = shuffle([letter, ...others])
  return { letter, options }
}

const Feedback = S.Union([S.Literal('none'), S.Literal('correct'), S.Literal('wrong')])

export const Model = S.Struct({
  letter: S.String,
  options: S.Array(S.String),
  score: S.Number,
  round: S.Number,
  feedback: Feedback,
  lastLetter: S.String,
})
export type Model = typeof Model.Type

export const ClickedLetter = m('BslClickedLetter', { letter: S.String })
export const ClickedReset = m('BslClickedReset')
export const NextRound = m('BslNextRound')
export const SoundPlayed = m('BslSoundPlayed')

export const Message = S.Union([ClickedLetter, ClickedReset, NextRound, SoundPlayed])
export type Message = typeof Message.Type

export const init = (): Model => {
  const { letter, options } = generateRound()
  return { letter, options, score: 0, round: 0, feedback: 'none', lastLetter: '' }
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
      BslClickedLetter: (msg) => {
        if (model.feedback !== 'none') return [model, []]
        const correct = msg.letter === model.letter
        const newScore = correct ? model.score + 1 : model.score
        return [
          { ...model, score: newScore, feedback: correct ? 'correct' : 'wrong', lastLetter: msg.letter },
          muted ? [] : [speak(model.letter.toLowerCase(), SoundPlayed(), { lang: language })],
        ]
      },
      BslNextRound: () => {
        if (model.round >= ROUNDS_PER_GAME - 1) return [init(), []]
        const { letter, options } = generateRound()
        return [
          { ...model, letter, options, feedback: 'none', lastLetter: '', round: model.round + 1 },
          [],
        ]
      },
      BslClickedReset: () => [init(), []],
      BslSoundPlayed: () => [model, []],
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()
  const gameOver = model.round >= ROUNDS_PER_GAME && model.feedback !== 'none'

  return h.div([h.Class('page bsl-page')], [
    h.div([h.Class('card bsl-card')], [
      h.h1([h.Class('title')], [t('bslTitle', language)]),
      ...(gameOver
        ? [
          h.div([h.Class('bsl-result')], [
            h.p([h.Class('bsl-score')], [`${t('bslScore', language)} ${model.score}/${ROUNDS_PER_GAME}`]),
            h.button([h.Class('btn btn-primary'), h.OnClick(ClickedReset())], [t('bslPlayAgain', language)]),
          ]),
        ]
        : [
          h.div([h.Class('bsl-round')], [
            h.span([h.Class('bsl-round-text')], [`${t('bslRound', language)} ${model.round + 1}/${ROUNDS_PER_GAME}`]),
            h.span([h.Class('bsl-score')], [`${t('bslScore', language)} ${model.score}`]),
          ]),
          h.div([h.Class('bsl-hand-container')], [
            h.img([h.Class('bsl-hand'), h.Src(bslImage(model.letter)), h.Alt(`BSL letter ${model.letter}`)]),
          ]),
          h.div([h.Class('bsl-options')], [
            ...model.options.map(letter =>
              h.button(
                [
                  h.Class('bsl-option' + (
                    model.feedback !== 'none'
                      ? letter === model.letter
                        ? ' bsl-option--correct'
                        : letter === model.lastLetter
                          ? ' bsl-option--wrong'
                          : ''
                      : ''
                  )),
                  h.Disabled(model.feedback !== 'none'),
                  h.Key(letter),
                  h.OnTouchEnd(ClickedLetter({ letter })),
                  h.OnClick(ClickedLetter({ letter })),
                ],
                [letter],
              ),
            ),
          ]),
          model.feedback !== 'none'
            ? h.div([h.Class('bsl-feedback'), h.Key('fb-' + model.round)], [
              h.p([h.Class('bsl-feedback-text')], [
                model.feedback === 'correct' ? model.letter : `${t('bslWrong', language)} ${model.letter}`,
              ]),
              h.button([h.Class('btn btn-primary'), h.OnClick(NextRound())], [t('next', language)]),
            ])
            : null,
        ]),
    ]),
  ])
}
