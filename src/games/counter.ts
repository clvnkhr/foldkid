import { Match as M, Option as O, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { click, swoosh } from '../audio'
import { speak } from '../speech'

export const Model = S.Struct({ count: S.Number, fontSize: S.Number, holding: S.Boolean, rate: S.Number, pitch: S.Number, language: S.String, showSettings: S.Boolean })
export type Model = typeof Model.Type

export const PointerDown = m('CounterPointerDown')
export const PressedIncrement = m('CounterPressedIncrement', { duration: S.Number })
export const PressedDecrement = m('CounterPressedDecrement', { duration: S.Number })
export const ClickedReset = m('CounterClickedReset')
export const ClickedSettings = m('CounterClickedSettings')
export const DismissSettings = m('CounterDismissSettings')
export const SetRate = m('CounterSetRate', { value: S.Number })
export const SetPitch = m('CounterSetPitch', { value: S.Number })
export const SetLanguage = m('CounterSetLanguage', { value: S.String })
export const SoundPlayed = m('CounterSoundPlayed')

export const Message = S.Union([PointerDown, PressedIncrement, PressedDecrement, ClickedReset, ClickedSettings, DismissSettings, SetRate, SetPitch, SetLanguage, SoundPlayed])
export type Message = typeof Message.Type

export const init: Model = { count: 0, fontSize: 3, holding: false, rate: 0.85, pitch: 1.1, language: 'en', showSettings: false }

const calcFontSize = (duration: number): number => {
  const s = duration / 1000
  return Math.min(20, Math.max(3, Math.round(3 + (s / 2) * 17)))
}

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      CounterPointerDown: () => [
        { ...model, holding: true },
        [],
      ],
      CounterPressedIncrement: (msg) => [
        { ...model, count: model.count + 1, fontSize: calcFontSize(msg.duration), holding: false },
        [click(SoundPlayed()), speak(`${model.count + 1}`, SoundPlayed(), { rate: model.rate, pitch: model.pitch, lang: model.language })],
      ],
      CounterPressedDecrement: (msg) => [
        { ...model, count: model.count - 1, fontSize: calcFontSize(msg.duration), holding: false },
        [click(SoundPlayed()), speak(`${model.count - 1}`, SoundPlayed(), { rate: model.rate, pitch: model.pitch, lang: model.language })],
      ],
      CounterClickedReset: () => [
        { ...model, count: 0 },
        [swoosh(SoundPlayed()), speak('0', SoundPlayed(), { rate: model.rate, pitch: model.pitch, lang: model.language })],
      ],
      CounterClickedSettings: () => [
        { ...model, showSettings: !model.showSettings },
        [],
      ],
      CounterDismissSettings: () => [
        { ...model, showSettings: false },
        [],
      ],
      CounterSetRate: (msg) => [
        { ...model, rate: msg.value },
        [],
      ],
      CounterSetPitch: (msg) => [
        { ...model, pitch: msg.value },
        [],
      ],
      CounterSetLanguage: (msg) => [
        { ...model, language: msg.value },
        [],
      ],
      CounterSoundPlayed: () => [model, []],
    }),
  )

const round = (n: number, d: number = 1): number => +n.toFixed(d)

const numberColor = (n: number): string => {
  const hue = (Math.abs(n) * 137.508) % 360
  return `hsl(${hue}, 75%, 55%)`
}

let pointerDownTime = 0

export const view = (model: Model) => {
  const h = html<Message>()

  const btnAttrs = (msg: (d: number) => Message) => [
    h.Class('btn btn-primary'),
    h.OnPointerDown((_pt, _btn, _sx, _sy, ts) => {
      pointerDownTime = ts
      return O.some(PointerDown())
    }),
    h.OnPointerUp((_sx, _sy, _pt, ts) =>
      O.some(msg(ts - pointerDownTime)),
    ),
  ] as const

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.h1([h.Class('title')], ['Counter']),
        h.div([h.Class('buttons')], [
          h.button(
            btnAttrs((d) => PressedDecrement({ duration: d })),
            ['-1'],
          ),
          h.button(
            [h.OnClick(ClickedReset()), h.Class('btn btn-secondary')],
            ['Reset'],
          ),
          h.button(
            btnAttrs((d) => PressedIncrement({ duration: d })),
            ['+1'],
          ),
          h.button(
            [h.OnClick(ClickedSettings()), h.Class('btn btn-secondary')],
            ['⚙'],
          ),
        ]),
        h.div([h.Class('display-area')], [
          h.p([h.Class(model.holding ? 'number holding' : 'number'), h.Style({ color: numberColor(model.count), fontSize: `${model.fontSize}rem` }), h.Key(model.count.toString())], [model.count.toString()]),
        ]),
      ]),
      ...(model.showSettings
        ? [
          h.div([h.Class('settings-panel')], [
            h.div([h.Class('settings-header')], [
              h.h2([], ['Speech Settings']),
              h.button(
                [h.OnClick(DismissSettings()), h.Class('settings-close')],
                ['✕'],
              ),
            ]),
            h.div([h.Class('setting-row')], [
              h.label([], ['Rate']),
              h.div([h.Class('slider-row')], [
                h.input([
                  h.Type('range'),
                  h.Min('0.2'),
                  h.Max('3'),
                  h.Step('0.1'),
                  h.Value(model.rate.toString()),
                  h.OnInput((v) => SetRate({ value: parseFloat(v) })),
                ]),
                h.span([], [round(model.rate).toString()]),
              ]),
            ]),
            h.div([h.Class('setting-row')], [
              h.label([], ['Pitch']),
              h.div([h.Class('slider-row')], [
                h.input([
                  h.Type('range'),
                  h.Min('0.2'),
                  h.Max('4'),
                  h.Step('0.1'),
                  h.Value(model.pitch.toString()),
                  h.OnInput((v) => SetPitch({ value: parseFloat(v) })),
                ]),
                h.span([], [round(model.pitch).toString()]),
              ]),
            ]),
            h.div([h.Class('setting-row')], [
              h.label([], ['Lang']),
              h.div([h.Class('lang-buttons')], [
                ...[
                  ['en', 'English'] as const,
                  ['zh', '中文'] as const,
                  ['fr', 'Français'] as const,
                  ['de', 'Deutsch'] as const,
                  ['fa', 'فارسی'] as const,
                  ['ms', 'Bahasa Malaysia'] as const,
                  ['zh-HK', '廣東話'] as const,
                ].map(([val, label]) =>
                  h.button(
                    [
                      h.Class(val === model.language ? 'btn btn-primary' : 'btn btn-secondary'),
                      h.OnClick(SetLanguage({ value: val })),
                    ],
                    [label],
                  ),
                ),
              ]),
            ]),
            h.p([h.Class('settings-note')], ['Voice availability depends on your device & browser.']),
          ]),
        ]
        : []),
    ],
  )
}
