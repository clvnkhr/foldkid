import { Match as M, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { boing, swoosh } from '../audio'

const EMOJI_POOL = ['🎈', '🎉', '🎊', '🎁', '🧸', '🍭', '🍬', '🎂', '🌈', '🦄', '🐱', '🐶', '🐰', '🦋', '🌸', '⭐']

const EmojiCell = S.Struct({ id: S.Number, emoji: S.String })
type EmojiCell = typeof EmojiCell.Type

export const Model = S.Struct({ grid: S.Array(EmojiCell), target: S.String, count: S.Number, shaking: S.Number, shakeTick: S.Number, won: S.Boolean })
export type Model = typeof Model.Type

export const ClickedCell = m('PeekabooClickedCell', { id: S.Number })
export const ClickedNext = m('PeekabooClickedNext')
export const ClickedReset = m('PeekabooClickedReset')
export const SoundPlayed = m('PeekabooSoundPlayed')

export const Message = S.Union([ClickedCell, ClickedNext, ClickedReset, SoundPlayed])
export type Message = typeof Message.Type

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

const generateGame = (): Model => {
  const shuffled = shuffle(EMOJI_POOL).slice(0, 9)
  const grid = shuffled.map((emoji, i) => ({ id: i, emoji }))
  const target = grid[Math.floor(Math.random() * grid.length)]!.emoji
  return { grid, target, count: 0, shaking: -1, shakeTick: 0, won: false }
}

export const init = (): Model => generateGame()

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      PeekabooClickedCell: (msg) => {
        if (model.won) return [model, []]
        const cell = model.grid.find(c => c.id === msg.id)
        if (cell && cell.emoji === model.target) {
          return [
            { ...model, won: true },
            [boing(SoundPlayed())],
          ]
        }
        return [
          { ...model, shaking: msg.id, shakeTick: model.shakeTick + 1 },
          [],
        ]
      },
      PeekabooClickedNext: () => [
        { ...generateGame(), count: model.count + 1 },
        [],
      ],
      PeekabooClickedReset: () => [
        { ...generateGame(), count: 0 },
        [swoosh(SoundPlayed())],
      ],
      PeekabooSoundPlayed: () => [model, []],
    }),
  )

export const view = (model: Model) => {
  const h = html<Message>()

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.h1([h.Class('title')], ['Peek-a-Boo']),
        model.won
          ? null
          : h.p([h.Class('peekaboo-prompt')], [`Where is ${model.target}?`]),
        h.div([h.Class('buttons')], [
          model.won
            ? h.button(
              [h.OnClick(ClickedNext()), h.Class('btn btn-primary')],
              ['Next ➡'],
            )
            : h.button(
              [h.OnClick(ClickedReset()), h.Class('btn btn-secondary')],
              ['New Game'],
            ),
        ]),
        h.div([h.Class('display-area')], [
          model.won
            ? h.div(
              [h.Class('peekaboo-win'), h.Key('win-' + model.count)],
              [
                h.div([h.Class('win-emoji')], [model.target]),
                h.h2([h.Class('win-title')], ['YOU WIN!!!']),
                h.p([h.Class('peekaboo-count')], [
                  `Found ${model.count} time${model.count === 1 ? '' : 's'}!`,
                ]),
              ],
            )
            : h.div([], [
              h.div([h.Class('emoji-grid')], [
                ...model.grid.map((cell) =>
                  h.div(
                    [
                      h.Class(model.shaking === cell.id ? 'emoji-cell shaking' : 'emoji-cell'),
                      h.OnClick(ClickedCell({ id: cell.id })),
                      h.Key(cell.id.toString() + (model.shaking === cell.id ? 's' + model.shakeTick : '')),
                    ],
                    [cell.emoji],
                  ),
                ),
              ]),
              h.p([h.Class('peekaboo-count')], [
                `Found ${model.count} time${model.count === 1 ? '' : 's'}!`,
              ]),
            ]),
        ]),
      ]),
    ],
  )
}
