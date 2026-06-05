import { Match as M, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { Document, html } from 'foldkit/html'

import { ClickedBubbles, ClickedCounter, ClickedDarkMode, ClickedGreeting, ClickedLanding, ClickedPeekaboo, ClickedSettings, SetLanguage, SystemDarkModeChanged } from './message'
import { Page, PageBubbles, PageCounter, PageGreeting, PageLanding, PagePeekaboo } from './route'
import * as Bubbles from './games/bubbles'
import * as Counter from './games/counter'
import * as Greeting from './games/greeting'
import * as Peekaboo from './games/peekaboo'
import { view as landingView } from './pages/landing'

// MODEL

export const Model = S.Struct({
  page: Page,
  darkMode: S.String,
  language: S.String,
  showSettings: S.Boolean,
  greeting: Greeting.Model,
  counter: Counter.Model,
  peekaboo: Peekaboo.Model,
  bubbles: Bubbles.Model,
})

export type Model = typeof Model.Type

// MESSAGES

export const Message = S.Union([
  ClickedLanding,
  ClickedDarkMode,
  ClickedSettings,
  SetLanguage,
  SystemDarkModeChanged,
  ClickedGreeting,
  ClickedCounter,
  ClickedPeekaboo,
  ClickedBubbles,
  Greeting.ClickedReset,
  Greeting.ClickedRecord,
  Greeting.RecordedAudio,
  Greeting.RecordingFailed,
  Greeting.ClickedPlay,
  Counter.PointerDown,
  Counter.PressedIncrement,
  Counter.PressedDecrement,
  Counter.ClickedReset,
  Counter.SetRate,
  Counter.SetPitch,
  Peekaboo.ClickedCell,
  Peekaboo.ClickedNext,
  Bubbles.ClickedPop,
  Bubbles.ClickedAdd,
  Bubbles.ClickedReset,
  Greeting.SoundPlayed,
  Counter.SoundPlayed,
  Peekaboo.SoundPlayed,
  Bubbles.SoundPlayed,
])

export type Message = typeof Message.Type

// INIT

export const init = (): readonly [Model, ReadonlyArray<Command.Command<Message>>] => [
  {
    page: PageLanding(),
    darkMode: 'auto',
    language: 'en',
    showSettings: false,
    greeting: Greeting.init,
    counter: Counter.init,
    peekaboo: Peekaboo.init(),
    bubbles: Bubbles.init,
  },
  [],
]

// UPDATE

const updateGreeting = (
  model: Model,
  message: Greeting.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = Greeting.update(model.greeting, message, model.language)
  return [{ ...model, greeting: next }, cmds]
}

const updateCounter = (
  model: Model,
  message: Counter.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = Counter.update(model.counter, message, model.language)
  return [{ ...model, counter: next }, cmds]
}

const updatePeekaboo = (
  model: Model,
  message: Peekaboo.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = Peekaboo.update(model.peekaboo, message)
  return [{ ...model, peekaboo: next }, cmds]
}

const updateBubbles = (
  model: Model,
  message: Bubbles.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = Bubbles.update(model.bubbles, message)
  return [{ ...model, bubbles: next }, cmds]
}

const cycleDarkMode = (current: string): string =>
  current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto'

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      ClickedLanding: () => [{ ...model, page: PageLanding() }, []],
      ClickedDarkMode: () => [
        { ...model, darkMode: cycleDarkMode(model.darkMode) },
        [],
      ],
      SystemDarkModeChanged: () => [{ ...model }, []],
      ClickedSettings: () => [{ ...model, showSettings: !model.showSettings }, []],
      SetLanguage: (msg) => [{ ...model, language: msg.value }, []],
      ClickedGreeting: () => [{ ...model, page: PageGreeting() }, []],
      ClickedCounter: () => [{ ...model, page: PageCounter() }, []],
      ClickedPeekaboo: () => [{ ...model, page: PagePeekaboo() }, []],
      ClickedBubbles: () => [{ ...model, page: PageBubbles() }, []],
      GreetingClickedRecord: (msg) => updateGreeting(model, msg),
      GreetingRecordedAudio: (msg) => updateGreeting(model, msg),
      GreetingRecordingFailed: (msg) => updateGreeting(model, msg),
      GreetingClickedPlay: (msg) => updateGreeting(model, msg),
      GreetingClickedReset: (msg) => updateGreeting(model, msg),
      CounterPointerDown: (msg) => updateCounter(model, msg),
      CounterPressedIncrement: (msg) => updateCounter(model, msg),
      CounterPressedDecrement: (msg) => updateCounter(model, msg),
      CounterClickedReset: (msg) => updateCounter(model, msg),
      CounterSetRate: (msg) => updateCounter(model, msg),
      CounterSetPitch: (msg) => updateCounter(model, msg),
      PeekabooClickedCell: (msg) => updatePeekaboo(model, msg),
      PeekabooClickedNext: (msg) => updatePeekaboo(model, msg),
      BubblesClickedPop: (msg) => updateBubbles(model, msg),
      BubblesClickedAdd: (msg) => updateBubbles(model, msg),
      BubblesClickedReset: (msg) => updateBubbles(model, msg),
      GreetingSoundPlayed: (msg) => updateGreeting(model, msg),
      CounterSoundPlayed: (msg) => updateCounter(model, msg),
      PeekabooSoundPlayed: (msg) => updatePeekaboo(model, msg),
      BubblesSoundPlayed: (msg) => updateBubbles(model, msg),
    }),
  )

// VIEW

const pageTitle = (model: Model): string =>
  M.value(model.page).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      PageLanding: () => 'foldkid - Games for Kids',
      PageGreeting: () => 'Say Hello - foldkid',
      PageCounter: () => 'Counter - foldkid',
      PagePeekaboo: () => 'Peek-a-Boo - foldkid',
      PageBubbles: () => 'Bubbles - foldkid',
    }),
  )

export const view = (model: Model): Document => {
  const h = html<Message>()

  const isLanding = model.page._tag === 'PageLanding'
  const isDark = model.darkMode === 'dark' || (model.darkMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const darkLabel = model.darkMode === 'auto' ? '🌗' : model.darkMode === 'light' ? '☀️' : '🌙'

  return {
    title: pageTitle(model),
    body: h.div(
      [h.Class(isDark ? 'app dark' : 'app'), h.OnMount({
        name: 'watchDarkMode',
        f: () => Stream.fromEventListener(
          window.matchMedia('(prefers-color-scheme: dark)'),
          'change',
        ).pipe(
          Stream.map(() => SystemDarkModeChanged()),
        ),
      })],
      [
          !isLanding
            ? h.div(
              [h.Class('nav-bar')],
              [
                h.button(
                  [h.OnClick(ClickedLanding()), h.Class('back-btn')],
                  ['← Back to games'],
                ),
                h.div([h.Class('nav-right')], [
                  h.button(
                    [h.OnClick(ClickedSettings()), h.Class('back-btn')],
                    ['⚙'],
                  ),
                  h.button(
                    [h.OnClick(ClickedDarkMode()), h.Class('back-btn')],
                    [darkLabel],
                  ),
                ]),
              ],
            )
            : h.div(
              [h.Class('nav-bar nav-bar--landing')],
              [
                h.div([h.Class('nav-right')], [
                  h.button(
                    [h.OnClick(ClickedSettings()), h.Class('back-btn')],
                    ['⚙'],
                  ),
                  h.button(
                    [h.OnClick(ClickedDarkMode()), h.Class('back-btn')],
                    [darkLabel],
                  ),
                ]),
              ],
            ),
        h.div([h.Class('settings-panel'), h.Style({ display: model.showSettings ? '' : 'none' })], [
          h.div([h.Class('settings-header')], [
            h.h2([], ['Settings']),
            h.button(
              [h.OnClick(ClickedSettings()), h.Class('settings-close')],
              ['✕'],
            ),
          ]),
          h.div([h.Class('setting-section')], [
            h.h3([], ['Language']),
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
          model.page._tag === 'PageCounter'
            ? h.div([h.Class('setting-section')], [
              h.h3([], ['Counter Speech']),
              h.div([h.Class('setting-row')], [
                h.label([], ['Rate']),
                h.div([h.Class('slider-row')], [
                  h.input([
                    h.Type('range'),
                    h.Min('0.2'),
                    h.Max('3'),
                    h.Step('0.1'),
                    h.Value(model.counter.rate.toString()),
                    h.OnInput((v) => Counter.SetRate({ value: parseFloat(v) })),
                  ]),
                  h.span([], [model.counter.rate.toFixed(1)]),
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
                    h.Value(model.counter.pitch.toString()),
                    h.OnInput((v) => Counter.SetPitch({ value: parseFloat(v) })),
                  ]),
                  h.span([], [model.counter.pitch.toFixed(1)]),
                ]),
              ]),
            ])
            : null,
          h.p([h.Class('settings-note')], ['Voice availability depends on your device & browser.']),
        ]),
        M.value(model.page).pipe(
          M.tagsExhaustive({
            PageLanding: () => landingView(),
            PageGreeting: () => Greeting.view(model.greeting),
            PageCounter: () => Counter.view(model.counter),
            PagePeekaboo: () => Peekaboo.view(model.peekaboo),
            PageBubbles: () => Bubbles.view(model.bubbles),
          }),
        ),
      ],
    ),
  }
}
