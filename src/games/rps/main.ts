import { Match as M, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { chime, click, boing } from '../../audio'
import { t } from '../../i18n'

const CHOICES = ['rock', 'paper', 'scissors'] as const
type Choice = typeof CHOICES[number]

const WINS_AGAINST: Record<Choice, Choice> = {
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper',
}

const LOSES_AGAINST: Record<Choice, Choice> = {
  rock: 'paper',
  paper: 'scissors',
  scissors: 'rock',
}

const ChoiceSchema = S.Union([S.Literal('rock'), S.Literal('paper'), S.Literal('scissors')])

export const Model = S.Struct({
  playerChoice: S.Union([ChoiceSchema, S.Null]),
  computerChoice: S.Union([ChoiceSchema, S.Null]),
  result: S.Union([S.Literal('win'), S.Literal('lose'), S.Literal('tie'), S.Null]),
  wins: S.Number,
  losses: S.Number,
  ties: S.Number,
  playerHistory: S.Array(ChoiceSchema),
  prediction: S.Union([ChoiceSchema, S.Null]),
  gigaChad: S.Boolean,
})
export type Model = typeof Model.Type

export const Picked = m('RpsPicked', { choice: ChoiceSchema })
export const StartGame = m('RpsStartGame')
export const SoundPlayed = m('RpsSoundPlayed')
export const SetGigaChad = m('RpsSetGigaChad', { value: S.Boolean })

export const Message = S.Union([Picked, StartGame, SoundPlayed, SetGigaChad])
export type Message = typeof Message.Type

export const init: Model = {
  playerChoice: null,
  computerChoice: null,
  result: null,
  wins: 0,
  losses: 0,
  ties: 0,
  playerHistory: [],
  prediction: null,
  gigaChad: false,
}

const predict = (history: readonly Choice[]): Choice => {
  const counts = { rock: 0, paper: 0, scissors: 0 }
  for (const move of history) {
    counts[move]++
  }
  let best: Choice = 'rock'
  if (counts.paper > counts[best]) best = 'paper'
  if (counts.scissors > counts[best]) best = 'scissors'
  return best
}

const markovChain = (history: readonly Choice[], order: number): Choice | null => {
  if (history.length < order + 1) return null
  const window = history.slice(history.length - order)
  const counts = { rock: 0, paper: 0, scissors: 0 }
  for (let i = 0; i <= history.length - order - 1; i++) {
    let match = true
    for (let j = 0; j < order; j++) {
      if (history[i + j] !== window[j]) { match = false; break }
    }
    if (match) {
      const next = history[i + order]
      if (next !== undefined) counts[next]++
    }
  }
  let best: Choice | null = null
  if (counts.rock + counts.paper + counts.scissors > 0) {
    best = 'rock'
    if (counts.paper > counts[best]) best = 'paper'
    if (counts.scissors > counts[best]) best = 'scissors'
  }
  return best
}

const predictGigaChad = (history: readonly Choice[]): Choice => {
  for (const order of [3, 2, 1]) {
    const result = markovChain(history, order)
    if (result !== null) return result
  }
  return predict(history)
}

export const update = (
  model: Model,
  message: Message,
  muted: boolean = false,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      RpsStartGame: () => [init, []],
      RpsSetGigaChad: (msg) => [{ ...model, gigaChad: msg.value }, []],
      RpsPicked: (msg) => {
        const playerChoice = msg.choice
        const predictor = model.gigaChad ? predictGigaChad : predict
        const predicted = predictor(model.playerHistory)
        const computerChoice = LOSES_AGAINST[predicted]
        let result: 'win' | 'lose' | 'tie'
        if (playerChoice === computerChoice) {
          result = 'tie'
        } else if (WINS_AGAINST[playerChoice] === computerChoice) {
          result = 'win'
        } else {
          result = 'lose'
        }
        const sound = result === 'win' ? chime : result === 'lose' ? boing : click
        return [{
          ...model,
          playerChoice,
          computerChoice,
          result,
          wins: model.wins + (result === 'win' ? 1 : 0),
          losses: model.losses + (result === 'lose' ? 1 : 0),
          ties: model.ties + (result === 'tie' ? 1 : 0),
          playerHistory: [...model.playerHistory, playerChoice],
          prediction: predicted,
        }, muted ? [] : [sound(SoundPlayed())]]
      },
      RpsSoundPlayed: () => [model, []],
    }),
  )

const choiceEmoji: Record<Choice, string> = {
  rock: '✊',
  paper: '✋',
  scissors: '✌️',
}

export const view = (model: Model, language: string = 'en'): Html => {
  const h = html<Message>()
  const total = model.wins + model.losses
  const winRate = total > 0 ? Math.round(model.wins / total * 100) : null
  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.h1([h.Class('title')], [t('rpsTitle', language)]),
        h.div([h.Class('rps-score')], [
          h.span([], [`${t('rpsWins', language)}: ${model.wins}`]),
          h.span([], [`${t('rpsLosses', language)}: ${model.losses}`]),
          h.span([], [`${t('rpsTies', language)}: ${model.ties}`]),
          h.span([h.Class('rps-wr')], [`WR: ${winRate !== null ? winRate + '%' : '-'}`]),
          h.button(
            [h.OnClick(StartGame()), h.Class('rps-reset-btn'), h.Title(t('rpsReset', language))],
            ['↺'],
          ),
        ]),
        h.div([h.Class('rps-choices')], [
          ...CHOICES.map(choice =>
            h.button(
              [
                h.OnTouchStart(Picked({ choice })),
                h.Class('rps-choice-btn' + (model.playerChoice === choice ? ' rps-choice-btn--selected' : '')),
              ],
              [h.span([h.Class('rps-choice-emoji')], [choiceEmoji[choice]])],
            ),
          ),
        ]),
        model.result !== null && model.playerChoice !== null && model.computerChoice !== null
          ? h.div([h.Class('rps-result')], [
            h.div([h.Class('rps-result-choices')], [
              h.div([h.Class('rps-result-pick')], [
                h.span([h.Class('rps-result-emoji')], [choiceEmoji[model.playerChoice]]),
                h.span([], ['You']),
              ]),
              h.span([h.Class('rps-vs')], ['vs']),
              h.div([h.Class('rps-result-pick')], [
                h.span([h.Class('rps-result-emoji')], [choiceEmoji[model.computerChoice]]),
                h.span([], [t('rpsComputer', language)]),
              ]),
            ]),
            h.p(
              [h.Class(`rps-result-text rps-result-text--${model.result}`)],
              [t(model.result === 'win' ? 'rpsYouWin' : model.result === 'lose' ? 'rpsYouLose' : 'rpsTie', language)],
            ),
          ])
          : h.p([h.Class('rps-prompt')], [t('rpsTapStart', language)]),
      ]),
    ],
  )
}
