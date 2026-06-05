import { Match as M, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { Document, html } from 'foldkit/html'

import { ClickedBubbles, ClickedCounter, ClickedDarkMode, ClickedGreeting, ClickedLanding, ClickedPeekaboo, SystemDarkModeChanged } from './message'
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
  SystemDarkModeChanged,
  ClickedGreeting,
  ClickedCounter,
  ClickedPeekaboo,
  ClickedBubbles,
  Greeting.ClickedGreet,
  Greeting.ClickedReset,
  Counter.PointerDown,
  Counter.PressedIncrement,
  Counter.PressedDecrement,
  Counter.ClickedReset,
  Counter.ClickedSettings,
  Counter.DismissSettings,
  Counter.SetRate,
  Counter.SetPitch,
  Counter.SetLanguage,
  Peekaboo.ClickedCell,
  Peekaboo.ClickedNext,
  Peekaboo.ClickedReset,
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
  const [next, cmds] = Greeting.update(model.greeting, message)
  return [{ ...model, greeting: next }, cmds]
}

const updateCounter = (
  model: Model,
  message: Counter.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = Counter.update(model.counter, message)
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
      ClickedGreeting: () => [{ ...model, page: PageGreeting() }, []],
      ClickedCounter: () => [{ ...model, page: PageCounter() }, []],
      ClickedPeekaboo: () => [{ ...model, page: PagePeekaboo() }, []],
      ClickedBubbles: () => [{ ...model, page: PageBubbles() }, []],
      GreetingClickedGreet: (msg) => updateGreeting(model, msg),
      GreetingClickedReset: (msg) => updateGreeting(model, msg),
      CounterPointerDown: (msg) => updateCounter(model, msg),
      CounterPressedIncrement: (msg) => updateCounter(model, msg),
      CounterPressedDecrement: (msg) => updateCounter(model, msg),
      CounterClickedReset: (msg) => updateCounter(model, msg),
      CounterClickedSettings: (msg) => updateCounter(model, msg),
      CounterDismissSettings: (msg) => updateCounter(model, msg),
      CounterSetRate: (msg) => updateCounter(model, msg),
      CounterSetPitch: (msg) => updateCounter(model, msg),
      CounterSetLanguage: (msg) => updateCounter(model, msg),
      PeekabooClickedCell: (msg) => updatePeekaboo(model, msg),
      PeekabooClickedNext: (msg) => updatePeekaboo(model, msg),
      PeekabooClickedReset: (msg) => updatePeekaboo(model, msg),
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
              h.button(
                [h.OnClick(ClickedDarkMode()), h.Class('back-btn')],
                [darkLabel],
              ),
            ],
          )
          : h.div(
            [h.Class('nav-bar nav-bar--landing')],
            [
              h.button(
                [h.OnClick(ClickedDarkMode()), h.Class('back-btn')],
                [darkLabel],
              ),
            ],
          ),
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
