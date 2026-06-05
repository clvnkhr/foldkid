import { Match as M, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { chime, swoosh } from '../audio'

export const Model = S.Struct({ message: S.String, count: S.Number })
export type Model = typeof Model.Type

export const ClickedGreet = m('GreetingClickedGreet')
export const ClickedReset = m('GreetingClickedReset')
export const SoundPlayed = m('GreetingSoundPlayed')

export const Message = S.Union([ClickedGreet, ClickedReset, SoundPlayed])
export type Message = typeof Message.Type

export const init: Model = { message: 'Hello from foldkid!', count: 0 }

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      GreetingClickedGreet: () => [
        { message: 'Hello from foldkid!', count: model.count + 1 },
        [chime(SoundPlayed())],
      ],
      GreetingClickedReset: () => [
        { message: 'Hello from foldkid!', count: 0 },
        [swoosh(SoundPlayed())],
      ],
      GreetingSoundPlayed: () => [model, []],
    }),
  )

export const view = (model: Model) => {
  const h = html<Message>()

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.h1([h.Class('title')], [model.message]),
        h.div([h.Class('buttons')], [
          h.button(
            [h.OnClick(ClickedGreet()), h.Class('btn btn-primary')],
            ['Say Hello'],
          ),
          model.count > 0
            ? h.button(
              [h.OnClick(ClickedReset()), h.Class('btn btn-secondary')],
              ['Reset'],
            )
            : null,
        ]),
        h.div([h.Class('display-area')], [
          model.count > 0
            ? h.p([h.Class('count')], [
              `You've been greeted ${model.count} time${model.count === 1 ? '' : 's'}`,
            ])
            : null,
        ]),
      ]),
    ],
  )
}
