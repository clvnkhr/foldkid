import { Match as M, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { boing } from '../audio'

const EMOJI_POOL = [
  '🎈', '🎉', '🎊', '🎁', '🧸', '🍭', '🍬', '🎂', '🌈', '🌸', '⭐', '🍕', '🍔', '🌮', '🍩', '🧁',
  '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣',
  '🐱', '🐶', '🐰', '🦋', '🦄', '🐻', '🐼', '🐨', '🦁', '🐯', '🐸', '🐵', '🦊', '🐴', '🦝', '🐮', '🐷', '🐙',
  '🐧', '🐦', '🦅', '🦉', '🐥', '🦆',
  '🐢', '🐍', '🦎', '🐊',
  '🐳', '🐬', '🦈', '🐠', '🐡',
  '🐝', '🐞', '🦗', '🐜',
]

const EmojiCell = S.Struct({ id: S.Number, emoji: S.String })
type EmojiCell = typeof EmojiCell.Type

export const Model = S.Struct({ grid: S.Array(EmojiCell), target: S.String, count: S.Number, shaking: S.Number, shakeTick: S.Number, won: S.Boolean, found: S.Array(S.String) })
export type Model = typeof Model.Type

export const ClickedCell = m('PeekabooClickedCell', { id: S.Number })
export const ClickedNext = m('PeekabooClickedNext')
export const SoundPlayed = m('PeekabooSoundPlayed')

export const Message = S.Union([ClickedCell, ClickedNext, SoundPlayed])
export type Message = typeof Message.Type

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

const generateGame = (found?: string[]): Model => {
  const shuffled = shuffle(EMOJI_POOL).slice(0, 9)
  const grid = shuffled.map((emoji, i) => ({ id: i, emoji }))
  const target = grid[Math.floor(Math.random() * grid.length)]!.emoji
  return { grid, target, count: 0, shaking: -1, shakeTick: 0, won: false, found: found ?? [] }
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
          const next = model.found.includes(model.target)
            ? model.found
            : [...model.found, model.target]
          return [
            { ...model, won: true, found: next },
            [boing(SoundPlayed())],
          ]
        }
        return [
          { ...model, shaking: msg.id, shakeTick: model.shakeTick + 1 },
          [],
        ]
      },
      PeekabooClickedNext: () => [
        { ...generateGame([...model.found]), count: model.count + 1 },
        [],
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
        h.div([h.Class('peekaboo-main')], [
          h.p([h.Class('peekaboo-prompt')], [`Where is ${model.target}?`]),
          h.div([h.Class('peekaboo-game-area')], [
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
            model.won
              ? h.div([h.Class('peekaboo-overlay'), h.Key('win-' + model.count)], [
                h.div([h.Class('peekaboo-win')], [
                  h.div([h.Class('win-emoji')], [model.target]),
                  h.h2([h.Class('win-title')], ['YOU WIN!!!']),
                  h.p([h.Class('peekaboo-count')], [
                    `Found ${model.count} time${model.count === 1 ? '' : 's'}!`,
                  ]),
                  h.button(
                    [h.OnClick(ClickedNext()), h.Class('btn btn-primary')],
                    ['Next ➡'],
                  ),
                ]),
              ])
              : null,
          ]),
          h.div([h.Class('collection-box')], [
            h.p([h.Class('collection-label')], ['Collection']),
            h.div([h.Class('collection-grid')], [
              ...model.found.map((e) =>
                h.span([h.Class('collection-emoji'), h.Key(e)], [e]),
              ),
            ]),
          ]),
        ]),
      ]),
    ],
  )
}
