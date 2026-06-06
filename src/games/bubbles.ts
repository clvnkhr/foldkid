import { Match as M, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { pop, chime, swoosh } from '../audio'

const Bubble = S.Struct({ id: S.Number, color: S.String, popped: S.Boolean })
type Bubble = typeof Bubble.Type

const COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94', '#95E1D3']

const randomColor = (): string => COLORS[Math.floor(Math.random() * COLORS.length)] as string

export const Model = S.Struct({ bubbles: S.Array(Bubble), score: S.Number, nextId: S.Number })
export type Model = typeof Model.Type

export const ClickedPop = m('BubblesClickedPop', { id: S.Number })
export const ClickedAdd = m('BubblesClickedAdd')
export const ClickedReset = m('BubblesClickedReset')
export const SoundPlayed = m('BubblesSoundPlayed')

export const Message = S.Union([ClickedPop, ClickedAdd, ClickedReset, SoundPlayed])
export type Message = typeof Message.Type

export const init: Model = { bubbles: [], score: 0, nextId: 0 }

export const update = (
  model: Model,
  message: Message,
  muted: boolean = false,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      BubblesClickedPop: (msg) => [
        {
          ...model,
          bubbles: model.bubbles.map((b) =>
            b.id === msg.id ? { ...b, popped: true } : b,
          ),
          score: model.score + 1,
        },
        muted ? [] : [pop(SoundPlayed())],
      ],
      BubblesClickedAdd: () => [
        {
          ...model,
          bubbles: [
            ...model.bubbles,
            { id: model.nextId, color: randomColor(), popped: false },
          ],
          nextId: model.nextId + 1,
        },
        muted ? [] : [chime(SoundPlayed())],
      ],
      BubblesClickedReset: () => [
        { bubbles: [], score: 0, nextId: model.nextId },
        muted ? [] : [swoosh(SoundPlayed())],
      ],
      BubblesSoundPlayed: () => [model, []],
    }),
  )

export const view = (model: Model) => {
  const h = html<Message>()

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.h1([h.Class('title')], ['Bubbles!']),
        h.p([h.Class('bubbles-score')], [`Popped: ${model.score}`]),
        h.div([h.Class('buttons')], [
          h.button(
            [h.OnClick(ClickedAdd()), h.Class('btn btn-primary')],
            ['➕ Add Bubble'],
          ),
          model.score > 0 || model.bubbles.length > 0
            ? h.button(
              [h.OnClick(ClickedReset()), h.Class('btn btn-secondary')],
              ['Clear'],
            )
            : null,
        ]),
        h.div([h.Class('display-area')], [
          model.bubbles.length === 0
            ? h.p([h.Class('bubbles-hint')], ['Tap "Add Bubble" to start!'])
            : null,
          h.div([h.Class('bubbles-area')], [
            ...model.bubbles.filter((b) => !b.popped).map((b) =>
              h.div(
                [
                  h.OnClick(ClickedPop({ id: b.id })),
                  h.Class('bubble'),
                  h.Style({ background: b.color }),
                ],
                ['○'],
              )
            ),
            model.bubbles.filter((b) => !b.popped).length === 0 && model.bubbles.length > 0
              ? h.p([h.Class('bubbles-done')], ['All popped! Add more!'])
              : null,
          ]),
        ]),
      ]),
    ],
  )
}
