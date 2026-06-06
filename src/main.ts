import { Match as M, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { Document, html } from 'foldkit/html'

import { ClickedBubbles, ClickedCounter, ClickedDarkMode, ClickedGreeting, ClickedLanding, ClickedPeekaboo, ClickedSettings, SetLanguage, SystemDarkModeChanged, ToggleMute } from './message'
import { Page, PageBubbles, PageCounter, PageGreeting, PageLanding, PagePeekaboo } from './route'
import * as Bubbles from './games/bubbles'
import * as Counter from './games/counter'
import * as Greeting from './games/greeting'
import * as Peekaboo from './games/peekaboo'
import { view as landingView } from './pages/landing'
import { t, tf } from './i18n'
import { speak } from './speech'

const ICON_UNMUTED = '🔊'
const ICON_MUTED = '🔇'
const ICON_TEXT_MODE = '📝'
const ICON_VOICE_MODE = '🔊'

// PERSISTENCE

const STORAGE_KEY = 'foldkid-settings'

interface PersistedSettings {
  language: string
  darkMode: string
  muted: boolean
  counterRate: number
  counterPitch: number
  counterDisplayMode: string
  peekabooAnyWins: boolean
  peekabooVoiceMode: boolean
}

const loadSettings = (): Partial<PersistedSettings> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const saveSettings = (model: Model): void => {
  try {
    const data: PersistedSettings = {
      language: model.language,
      darkMode: model.darkMode,
      muted: model.muted,
      counterRate: model.counter.rate,
      counterPitch: model.counter.pitch,
      counterDisplayMode: model.counter.displayMode,
      peekabooAnyWins: model.peekaboo.anyWins,
      peekabooVoiceMode: model.peekaboo.voiceMode,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* ignore */ }
}

// MODEL

export const Model = S.Struct({
  page: Page,
  darkMode: S.String,
  language: S.String,
  showSettings: S.Boolean,
  muted: S.Boolean,
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
  ToggleMute,
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
  Counter.SetDisplayMode,
  Peekaboo.ClickedCell,
  Peekaboo.ClickedNext,
  Peekaboo.SetAnyWins,
  Peekaboo.SetVoiceMode,
  Peekaboo.ReplayQuestion,
  Peekaboo.ClickedCollectionEmoji,
  Peekaboo.ClickedReset,
  Peekaboo.DismissTooltip,
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

export const init = (): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const saved = loadSettings()
  const peekabooInit = Peekaboo.init()
  const cmds: Command.Command<Message>[] = []
  const voiceMode = saved.peekabooVoiceMode ?? false
  if (voiceMode && !saved.peekabooAnyWins && !saved.muted) {
    cmds.push(speak(tf('whereIs', saved.language ?? 'en', peekabooInit.target), Peekaboo.SoundPlayed(), { lang: saved.language ?? 'en' }))
  }
  return [
    {
      page: PageLanding(),
      darkMode: saved.darkMode ?? 'auto',
      language: saved.language ?? 'en',
      showSettings: false,
      muted: saved.muted ?? false,
      greeting: Greeting.init,
      counter: {
        ...Counter.init,
        rate: saved.counterRate ?? Counter.init.rate,
        pitch: saved.counterPitch ?? Counter.init.pitch,
        displayMode: saved.counterDisplayMode ?? Counter.init.displayMode,
      },
      peekaboo: { ...peekabooInit, anyWins: saved.peekabooAnyWins ?? false, voiceMode },
      bubbles: Bubbles.init(),
    },
    cmds,
  ]
}

// UPDATE

const updateGreeting = (
  model: Model,
  message: Greeting.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = Greeting.update(model.greeting, message, model.language, model.muted)
  return [{ ...model, greeting: next }, cmds]
}

const updateCounter = (
  model: Model,
  message: Counter.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = Counter.update(model.counter, message, model.language, model.muted)
  return [{ ...model, counter: next }, cmds]
}

const updatePeekaboo = (
  model: Model,
  message: Peekaboo.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = Peekaboo.update(model.peekaboo, message, model.muted, model.language)
  return [{ ...model, peekaboo: next }, cmds]
}

const updateBubbles = (
  model: Model,
  message: Bubbles.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = Bubbles.update(model.bubbles, message, model.muted)
  return [{ ...model, bubbles: next }, cmds]
}

const cycleDarkMode = (current: string): string =>
  current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto'

const _update = (
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
      ToggleMute: () => [{ ...model, muted: !model.muted }, []],
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
      CounterSetDisplayMode: (msg) => updateCounter(model, msg),
      PeekabooClickedCell: (msg) => updatePeekaboo(model, msg),
      PeekabooClickedNext: (msg) => updatePeekaboo(model, msg),
      PeekabooSetAnyWins: (msg) => updatePeekaboo(model, msg),
      PeekabooSetVoiceMode: (msg) => updatePeekaboo(model, msg),
      PeekabooReplayQuestion: (msg) => updatePeekaboo(model, msg),
      PeekabooClickedCollectionEmoji: (msg) => updatePeekaboo(model, msg),
      PeekabooClickedReset: (msg) => updatePeekaboo(model, msg),
      PeekabooDismissTooltip: (msg) => updatePeekaboo(model, msg),
      BubblesClickedPop: (msg) => updateBubbles(model, msg),
      BubblesClickedAdd: (msg) => updateBubbles(model, msg),
      BubblesClickedReset: (msg) => updateBubbles(model, msg),
      GreetingSoundPlayed: (msg) => updateGreeting(model, msg),
      CounterSoundPlayed: (msg) => updateCounter(model, msg),
      PeekabooSoundPlayed: (msg) => updatePeekaboo(model, msg),
      BubblesSoundPlayed: (msg) => updateBubbles(model, msg),
    }),
  )

const SETTINGS_TAGS = new Set([
  'ClickedDarkMode', 'SetLanguage', 'ToggleMute',
  'CounterSetRate', 'CounterSetPitch', 'CounterSetDisplayMode',
  'PeekabooSetAnyWins', 'PeekabooSetVoiceMode',
])

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const result = _update(model, message)
  if (SETTINGS_TAGS.has(message._tag)) saveSettings(result[0])
  return result
}

// VIEW

const pageTitle = (model: Model): string =>
  M.value(model.page).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      PageLanding: () => t('pageTitleLanding', model.language),
      PageGreeting: () => t('pageTitleGreeting', model.language),
      PageCounter: () => t('pageTitleCounter', model.language),
      PagePeekaboo: () => t('pageTitlePeekaboo', model.language),
      PageBubbles: () => t('pageTitleBubbles', model.language),
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
                  [t('backToGames', model.language)],
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
            h.h2([], [t('settings', model.language)]),
            h.button(
              [h.OnClick(ClickedSettings()), h.Class('settings-close')],
              ['✕'],
            ),
          ]),
          h.div([h.Class('setting-section')], [
            h.h3([], [t('language', model.language)]),
            h.div([h.Class('lang-buttons')], [
              ...[
                ['en', t('langEn', model.language)] as const,
                ['zh', t('langZh', model.language)] as const,
                ['fr', t('langFr', model.language)] as const,
                ['de', t('langDe', model.language)] as const,
                ['fa', t('langFa', model.language)] as const,
                ['ms', t('langMs', model.language)] as const,
                ['zh-HK', t('langZhHK', model.language)] as const,
                ['ja', t('langJa', model.language)] as const,
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
          h.div([h.Class('setting-section')], [
            h.h3([], [t('sound', model.language)]),
            h.button(
              [
                h.Class('mute-toggle'),
                h.OnClick(ToggleMute()),
              ],
              [model.muted ? ICON_MUTED : ICON_UNMUTED],
            ),
          ]),
          model.page._tag === 'PageCounter'
            ? h.div([h.Class('setting-section')], [
              h.h3([], [t('counterSpeech', model.language)]),
              h.div([h.Class('setting-row')], [
                h.label([], [t('rate', model.language)]),
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
                h.label([], [t('pitch', model.language)]),
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
              h.div([h.Class('setting-row')], [
                h.label([], [t('display', model.language)]),
                h.div([h.Class('lang-buttons')], [
                  ...([
                    ['number', '123'] as const,
                    ['word', 'Word'] as const,
                    ['both', 'Both'] as const,
                  ] as const).map(([val, label]) =>
                    h.button(
                      [
                        h.Class(val === model.counter.displayMode ? 'btn btn-primary' : 'btn btn-secondary'),
                        h.OnClick(Counter.SetDisplayMode({ value: val })),
                      ],
                      [label],
                    ),
                  ),
                ]),
              ]),
            ])
            : null,
          model.page._tag === 'PagePeekaboo'
            ? h.div([h.Class('setting-section')], [
              h.h3([], [t('peekabooTitle', model.language)]),
              h.div([h.Class('lang-buttons')], [
                ...[
                  [false, t('findMode', model.language)] as const,
                  [true, t('anyMode', model.language)] as const,
                ].map(([val, label]) =>
                  h.button(
                    [
                      h.Class(val === model.peekaboo.anyWins ? 'btn btn-primary' : 'btn btn-secondary'),
                      h.OnClick(Peekaboo.SetAnyWins({ value: val })),
                    ],
                    [label],
                  ),
                ),
              ]),
              h.div([h.Class('lang-buttons'), h.Style({ marginTop: '0.5rem' })], [
                h.button(
                  [h.Class(!model.peekaboo.voiceMode ? 'btn btn-primary' : 'btn btn-secondary'), h.OnClick(Peekaboo.SetVoiceMode({ value: false }))],
                  [ICON_TEXT_MODE],
                ),
                h.button(
                  [h.Class(model.peekaboo.voiceMode ? 'btn btn-primary' : 'btn btn-secondary'), h.OnClick(Peekaboo.SetVoiceMode({ value: true }))],
                  [`${ICON_VOICE_MODE} ${t('voiceMode', model.language)}`],
                ),
              ]),
            ])
            : null,
          h.p([h.Class('settings-note')], [t('voiceNote', model.language)]),
        ]),
        M.value(model.page).pipe(
          M.tagsExhaustive({
            PageLanding: () => landingView(model.language),
            PageGreeting: () => Greeting.view(model.greeting, model.language),
            PageCounter: () => Counter.view(model.counter, model.language),
            PagePeekaboo: () => Peekaboo.view(model.peekaboo, model.language),
            PageBubbles: () => Bubbles.view(model.bubbles, model.language),
          }),
        ),
      ],
    ),
  }
}
