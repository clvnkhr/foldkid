import { Effect, Match as M, Option, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { Document, html } from 'foldkit/html'

import { ApplyImport, CancelResetSettings, ClickedAudioTest, ClickedBubbles, ClickedCounter, ClickedDarkMode, ClickedFindIt, ClickedGreeting, ClickedLanding, ClickedMusicBox, ClickedSettings, ConfirmResetSettings, CopyExportData, DismissMessage, ExportSettings, ImportSettings, ImportedSettings, ResetSettings, SetExportData, SetLanguage, SettingsDragEnded, SettingsDragMoved, SettingsDragStarted, SettingsImportFailed, SettingsPersisted, SystemDarkModeChanged, ToggleMute } from './message'

import { Page, PageAudioTest, PageBubbles, PageCounter, PageFindIt, PageGreeting, PageLanding, PageMusicBox } from './route'

import * as FindIt from './games/findit'
import * as MusicBox from './games/musicbox'
import * as Counter from './games/counter'
import * as Greeting from './games/greeting'
import * as Bubbles from './games/bubbles'
import { view as landingView } from './pages/landing'
import { view as audioTestView } from './pages/audiotest'
import { t, tf } from './i18n'
import { speak } from './speech'

const ICON_UNMUTED = '🔊'
const ICON_MUTED = '🔇'
const ICON_TEXT_MODE = '📝'
const ICON_VOICE_MODE = '🔊'

// PERSISTENCE

const STORAGE_KEY = 'foldkid-settings'
const SETTINGS_VERSION = 1

interface PersistedSettings {
  version: number
  language: string
  darkMode: string
  muted: boolean
  counterRate: number
  counterPitch: number
  counterDisplayMode: string
  findItAnyWins: boolean
  findItVoiceMode: boolean
  findItPairsMode: boolean
  bubblesPopLabel: boolean
  bubblesSayColor: boolean
  bubblesSelectedColor: string
  greetingVoiceEffect: string
  musicBoxSongOrder: readonly number[]
  musicBoxHiddenSongs: readonly boolean[]
}

const DarkModeValues = ['auto', 'light', 'dark'] as const
type DarkMode = typeof DarkModeValues[number]
const DisplayModeValues = ['number', 'word', 'both'] as const

const loadSettings = (): Partial<PersistedSettings> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const isDarkMode = (value: string | undefined): value is DarkMode =>
  value !== undefined && (DarkModeValues as readonly string[]).includes(value)

const sanitizeDarkMode = (value: string | undefined, fallback: DarkMode): DarkMode =>
  isDarkMode(value) ? value : fallback

const isDisplayMode = (value: string | undefined): value is 'number' | 'word' | 'both' =>
  value !== undefined && (DisplayModeValues as readonly string[]).includes(value)

const sanitizeDisplayMode = (value: string | undefined, fallback: 'number' | 'word' | 'both'): 'number' | 'word' | 'both' =>
  isDisplayMode(value) ? value : fallback

const VOICE_EFFECT_VALUES = ['normal', 'high', 'low', 'echo', 'highpass', 'lowpass', 'reverse', 'robot', 'alien', 'chipmunk'] as const

type VoiceEffectValue = typeof VOICE_EFFECT_VALUES[number]

const isVoiceEffect = (value: string | undefined): value is VoiceEffectValue =>
  value !== undefined && (VOICE_EFFECT_VALUES).includes(value as VoiceEffectValue)

const sanitizeVoiceEffect = (value: string | undefined, fallback: VoiceEffectValue): VoiceEffectValue =>
  isVoiceEffect(value) ? value : fallback

const buildSettingsData = (model: Model): PersistedSettings => ({
  version: SETTINGS_VERSION,
  language: model.language,
  darkMode: model.darkMode,
  muted: model.muted,
  counterRate: model.counter.rate,
  counterPitch: model.counter.pitch,
  counterDisplayMode: model.counter.displayMode,
  findItAnyWins: model.findIt.anyWins,
  findItVoiceMode: model.findIt.voiceMode,
  findItPairsMode: model.findIt.pairsMode,
  bubblesPopLabel: model.bubbles.popLabel,
  bubblesSayColor: model.bubbles.sayColor,
  bubblesSelectedColor: model.bubbles.selectedColor,
  greetingVoiceEffect: model.greeting.voiceEffect,
  musicBoxSongOrder: model.musicBox.songOrder,
  musicBoxHiddenSongs: model.musicBox.hiddenSongs,
})

let persistTimer: ReturnType<typeof setTimeout> | undefined

const persistSettings = (model: Model): Command.Command<Message> => {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSettingsData(model)))
  }, 200)
  return {
    name: 'PersistSettings',
    effect: Effect.succeed(SettingsPersisted()),
  }
}

const copyExportCmd = (text: string): Command.Command<Message> => ({
  name: 'CopyExport',
  effect: Effect.sync(() => {
    navigator.clipboard.writeText(text).catch(() => {})
  }).pipe(Effect.as(DismissMessage())),
})

// MODEL

const DarkModeType = S.Union([S.Literal('auto'), S.Literal('light'), S.Literal('dark')])

export const Model = S.Struct({
  page: Page,
  darkMode: DarkModeType,
  language: S.String,
  showSettings: S.Boolean,
  muted: S.Boolean,
  greeting: Greeting.Model,
  musicBox: MusicBox.Model,
  counter: Counter.Model,
  findIt: FindIt.Model,
  bubbles: Bubbles.Model,
  settingsPanelWidth: S.Number,
  isDraggingSettings: S.Boolean,
  settingsDragStartMouseX: S.Number,
  showResetConfirm: S.Boolean,
  importExportMessage: S.String,
  exportData: S.String,
  settingsOverlay: S.String,
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
  ClickedFindIt,
  ClickedBubbles,
  ClickedMusicBox,
  ClickedAudioTest,
  Greeting.ClickedReset,
  Greeting.ClickedRecord,
  Greeting.ClickedStopRecording,
  Greeting.RecordedAudio,
  Greeting.RecordingFailed,
  Greeting.ClickedPlay,
  Greeting.SetVoiceEffect,
  Greeting.HideHello,
  Counter.PointerDown,
  Counter.PressedIncrement,
  Counter.PressedDecrement,
  Counter.ClickedReset,
  Counter.SetRate,
  Counter.SetPitch,
  Counter.SetDisplayMode,
  FindIt.ClickedCell,
  FindIt.ClickedNext,
  FindIt.SetAnyWins,
  FindIt.SetVoiceMode,
  FindIt.SetPairsMode,
  FindIt.ReplayQuestion,
  FindIt.ClickedCollectionEmoji,
  FindIt.SetDragIndex,
  FindIt.DroppedOn,
  FindIt.DragEnded,
  FindIt.GridDragStarted,
  FindIt.GridDroppedOn,
  FindIt.GridDragEnded,
  FindIt.ClickedReset,
  FindIt.DismissTooltip,
  Bubbles.ClickedPop,
  Bubbles.ClickedReset,
  Greeting.SoundPlayed,
  Counter.SoundPlayed,
  FindIt.SoundPlayed,
  Bubbles.SoundPlayed,
  Bubbles.SetRainbowMode,
  Bubbles.SetPopLabel,
  Bubbles.SetSayColor,
  Bubbles.ClickedColor,
  MusicBox.Play,
  MusicBox.Stop,
  MusicBox.SetSong,
  MusicBox.SetInstrument,
  MusicBox.SongEnded,
  MusicBox.NoteOn,
  MusicBox.NoteOff,
  MusicBox.AddKey,
  MusicBox.RemoveKey,
  MusicBox.OctaveUp,
  MusicBox.OctaveDown,
  MusicBox.ToggleBottomKeyboard,
  MusicBox.ShiftBottom,
  MusicBox.ShiftTop,
  MusicBox.TempoUp,
  MusicBox.TempoDown,
  MusicBox.ToggleLyrics,
  MusicBox.TogglePause,
  MusicBox.TransposeUp,
  MusicBox.TransposeDown,
  MusicBox.ToggleSongVisibility,
  MusicBox.SongDragStarted,
  MusicBox.SongDroppedOn,
  MusicBox.SongDragEnded,
  SettingsPersisted,
  SettingsDragStarted,
  SettingsDragMoved,
  SettingsDragEnded,
  ResetSettings,
  ConfirmResetSettings,
  CancelResetSettings,
  ExportSettings,
  CopyExportData,
  ImportSettings,
  ImportedSettings,
  SettingsImportFailed,
  DismissMessage,
  SetExportData,
  ApplyImport,
])

export type Message = typeof Message.Type

// INIT

export const init = (): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const saved = loadSettings()
  const pairsMode = saved.findItPairsMode ?? false
  const findItInit = FindIt.init(pairsMode)
  const cmds: Command.Command<Message>[] = []
  const voiceMode = saved.findItVoiceMode ?? false
  if (voiceMode && !saved.findItAnyWins && !saved.muted) {
    cmds.push(speak(tf('whereIs', saved.language ?? 'en', FindIt.emojiName(findItInit.target, saved.language ?? 'en')), FindIt.SoundPlayed(), { lang: saved.language ?? 'en' }))
  }
  const bubblesSelectedColor = saved.bubblesSelectedColor ?? ''
  return [
    {
      page: PageLanding(),
      darkMode: sanitizeDarkMode(saved.darkMode, 'auto'),
      language: saved.language ?? 'en',
      showSettings: false,
      muted: saved.muted ?? false,
      musicBox: {
        ...MusicBox.init(),
        songOrder: Array.isArray(saved.musicBoxSongOrder)
          ? saved.musicBoxSongOrder.filter((i: number) => typeof i === 'number' && i >= 0 && i < MusicBox.SONGS.length)
          : MusicBox.init().songOrder,
        hiddenSongs: Array.isArray(saved.musicBoxHiddenSongs)
          ? saved.musicBoxHiddenSongs.map((h: boolean) => h === true)
          : MusicBox.init().hiddenSongs,
      },
      greeting: { ...Greeting.init, voiceEffect: sanitizeVoiceEffect(saved.greetingVoiceEffect, 'normal') },
      counter: {
        ...Counter.init,
        rate: saved.counterRate ?? Counter.init.rate,
        pitch: saved.counterPitch ?? Counter.init.pitch,
        displayMode: sanitizeDisplayMode(saved.counterDisplayMode, Counter.init.displayMode),
      },
      findIt: { ...findItInit, anyWins: saved.findItAnyWins ?? false, voiceMode, pairsMode },
      bubbles: {
        ...Bubbles.init(),
        selectedColor: bubblesSelectedColor,
        rainbowMode: bubblesSelectedColor === 'rainbow',
        popLabel: saved.bubblesPopLabel ?? false,
        sayColor: saved.bubblesSayColor ?? false,
      },
      settingsPanelWidth: 150,
      isDraggingSettings: false,
      settingsDragStartMouseX: 0,
      showResetConfirm: false,
      importExportMessage: '',
      exportData: '',
      settingsOverlay: '',
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

const updateFindIt = (
  model: Model,
  message: FindIt.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = FindIt.update(model.findIt, message, model.muted, model.language)
  return [{ ...model, findIt: next }, cmds]
}

const updateMusicBox = (
  model: Model,
  message: MusicBox.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = MusicBox.update(model.musicBox, message)
  return [{ ...model, musicBox: next }, cmds]
}

const updateBubbles = (
  model: Model,
  message: Bubbles.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = Bubbles.update(model.bubbles, message, model.muted)
  return [{ ...model, bubbles: next }, cmds]
}

const cycleDarkMode = (current: DarkMode): DarkMode => {
  if (current === 'auto') return 'light'
  if (current === 'light') return 'dark'
  return 'auto'
}

const applyImportData = (model: Model, s: PersistedSettings): Model => ({
  ...model,
  settingsOverlay: '',
  language: s.language ?? model.language,
  darkMode: sanitizeDarkMode(s.darkMode, model.darkMode),
  muted: s.muted ?? model.muted,
  greeting: { ...model.greeting, voiceEffect: sanitizeVoiceEffect(s.greetingVoiceEffect, model.greeting.voiceEffect) },
  counter: {
    ...model.counter,
    rate: s.counterRate ?? model.counter.rate,
    pitch: s.counterPitch ?? model.counter.pitch,
    displayMode: sanitizeDisplayMode(s.counterDisplayMode, model.counter.displayMode),
  },
  findIt: {
    ...model.findIt,
    anyWins: s.findItAnyWins ?? model.findIt.anyWins,
    voiceMode: s.findItVoiceMode ?? model.findIt.voiceMode,
    pairsMode: s.findItPairsMode ?? model.findIt.pairsMode,
  },
  bubbles: {
    ...model.bubbles,
    popLabel: s.bubblesPopLabel ?? model.bubbles.popLabel,
    sayColor: s.bubblesSayColor ?? model.bubbles.sayColor,
    selectedColor: s.bubblesSelectedColor ?? model.bubbles.selectedColor,
    rainbowMode: (s.bubblesSelectedColor ?? model.bubbles.selectedColor) === 'rainbow',
  },
  musicBox: {
    ...model.musicBox,
    songOrder: Array.isArray(s.musicBoxSongOrder)
      ? s.musicBoxSongOrder.filter((i: number) => typeof i === 'number' && i >= 0 && i < MusicBox.SONGS.length)
      : model.musicBox.songOrder,
    hiddenSongs: Array.isArray(s.musicBoxHiddenSongs)
      ? s.musicBoxHiddenSongs.map((h: boolean) => h === true)
      : model.musicBox.hiddenSongs,
  },
  showResetConfirm: false,
  importExportMessage: t('settingsImportSuccess', model.language),
})

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
      ClickedFindIt: () => [{ ...model, page: PageFindIt() }, []],
      ClickedBubbles: () => [{ ...model, page: PageBubbles() }, []],
      ClickedMusicBox: () => [{ ...model, page: PageMusicBox() }, []],
      ClickedAudioTest: () => [{ ...model, page: PageAudioTest() }, []],
      GreetingClickedRecord: (msg) => updateGreeting(model, msg),
      GreetingClickedStopRecording: (msg) => updateGreeting(model, msg),
      GreetingRecordedAudio: (msg) => updateGreeting(model, msg),
      GreetingRecordingFailed: (msg) => updateGreeting(model, msg),
      GreetingClickedPlay: (msg) => updateGreeting(model, msg),
      GreetingClickedReset: (msg) => updateGreeting(model, msg),
      GreetingSetVoiceEffect: (msg) => updateGreeting(model, msg),
      GreetingHideHello: (msg) => updateGreeting(model, msg),
      CounterPointerDown: (msg) => updateCounter(model, msg),
      CounterPressedIncrement: (msg) => updateCounter(model, msg),
      CounterPressedDecrement: (msg) => updateCounter(model, msg),
      CounterClickedReset: (msg) => updateCounter(model, msg),
      CounterSetRate: (msg) => updateCounter(model, msg),
      CounterSetPitch: (msg) => updateCounter(model, msg),
      CounterSetDisplayMode: (msg) => updateCounter(model, msg),
      FindItClickedCell: (msg) => updateFindIt(model, msg),
      FindItClickedNext: (msg) => updateFindIt(model, msg),
      FindItSetAnyWins: (msg) => updateFindIt(model, msg),
      FindItSetVoiceMode: (msg) => updateFindIt(model, msg),
      FindItSetPairsMode: (msg) => updateFindIt(model, msg),
      FindItReplayQuestion: (msg) => updateFindIt(model, msg),
      FindItClickedCollectionEmoji: (msg) => updateFindIt(model, msg),
      FindItSetDragIndex: (msg) => updateFindIt(model, msg),
      FindItDroppedOn: (msg) => updateFindIt(model, msg),
      FindItDragEnded: (msg) => updateFindIt(model, msg),
      FindItGridDragStarted: (msg) => updateFindIt(model, msg),
      FindItGridDroppedOn: (msg) => updateFindIt(model, msg),
      FindItGridDragEnded: (msg) => updateFindIt(model, msg),
      FindItClickedReset: (msg) => updateFindIt(model, msg),
      FindItDismissTooltip: (msg) => updateFindIt(model, msg),
      BubblesClickedPop: (msg) => updateBubbles(model, msg),
      BubblesClickedReset: (msg) => updateBubbles(model, msg),
      GreetingSoundPlayed: (msg) => updateGreeting(model, msg),
      CounterSoundPlayed: (msg) => updateCounter(model, msg),
      FindItSoundPlayed: (msg) => updateFindIt(model, msg),
      BubblesSoundPlayed: (msg) => updateBubbles(model, msg),
      BubblesClickedColor: (msg) => updateBubbles(model, msg),
      BubblesSetRainbowMode: (msg) => updateBubbles(model, msg),
      BubblesSetPopLabel: (msg) => updateBubbles(model, msg),
      BubblesSetSayColor: (msg) => updateBubbles(model, msg),
      MusicBoxPlay: (msg) => updateMusicBox(model, msg),
      MusicBoxStop: (msg) => updateMusicBox(model, msg),
      MusicBoxSetSong: (msg) => updateMusicBox(model, msg),
      MusicBoxSetInstrument: (msg) => updateMusicBox(model, msg),
      MusicBoxSongEnded: (msg) => updateMusicBox(model, msg),
      MusicBoxNoteOn: (msg) => updateMusicBox(model, msg),
      MusicBoxNoteOff: (msg) => updateMusicBox(model, msg),
      MusicBoxAddKey: (msg) => updateMusicBox(model, msg),
      MusicBoxRemoveKey: (msg) => updateMusicBox(model, msg),
      MusicBoxOctaveUp: (msg) => updateMusicBox(model, msg),
      MusicBoxOctaveDown: (msg) => updateMusicBox(model, msg),
      MusicBoxShiftBottom: (msg) => updateMusicBox(model, msg),
      MusicBoxShiftTop: (msg) => updateMusicBox(model, msg),
      MusicBoxTempoUp: (msg) => updateMusicBox(model, msg),
      MusicBoxTempoDown: (msg) => updateMusicBox(model, msg),
      MusicBoxToggleBottomKeyboard: (msg) => updateMusicBox(model, msg),
      MusicBoxToggleLyrics: (msg) => updateMusicBox(model, msg),
      MusicBoxTogglePause: (msg) => updateMusicBox(model, msg),
      MusicBoxTransposeUp: (msg) => updateMusicBox(model, msg),
      MusicBoxTransposeDown: (msg) => updateMusicBox(model, msg),
      MusicBoxToggleSongVisibility: (msg) => updateMusicBox(model, msg),
      MusicBoxSongDragStarted: (msg) => updateMusicBox(model, msg),
      MusicBoxSongDroppedOn: (msg) => updateMusicBox(model, msg),
      MusicBoxSongDragEnded: (msg) => updateMusicBox(model, msg),
      SettingsDragStarted: (msg) => [
        { ...model, isDraggingSettings: true, settingsDragStartMouseX: msg.screenX },
        [],
      ],
      SettingsDragMoved: (msg) => {
        const delta = model.settingsDragStartMouseX - msg.screenX
        const newWidth = Math.max(60, Math.min(400, model.settingsPanelWidth + delta))
        return [{ ...model, settingsPanelWidth: newWidth, settingsDragStartMouseX: msg.screenX }, []]
      },
      SettingsDragEnded: () => {
        let next = { ...model, isDraggingSettings: false }
        if (model.settingsPanelWidth < 90) {
          next = { ...next, showSettings: false, settingsPanelWidth: 150 }
        }
        return [next, []]
      },
      SettingsPersisted: () => [model, []],
      ResetSettings: () => [{ ...model, showResetConfirm: true }, []],
      CancelResetSettings: () => [{ ...model, showResetConfirm: false }, []],
      ConfirmResetSettings: () => {
        localStorage.removeItem(STORAGE_KEY)
        const fresh = init()[0]
        return [{ ...fresh, showSettings: model.showSettings, settingsPanelWidth: model.settingsPanelWidth, showResetConfirm: false, importExportMessage: t('settingsResetConfirm', model.language) }, []]
      },
      ExportSettings: () => {
        const data = {
          version: SETTINGS_VERSION,
          exportedAt: new Date().toISOString(),
          settings: buildSettingsData(model),
        }
        return [{ ...model, settingsOverlay: 'export', exportData: JSON.stringify(data, null, 2), showResetConfirm: false, importExportMessage: '' }, []]
      },
      CopyExportData: () => [model, [copyExportCmd(model.exportData)]],
      ImportSettings: () => [{ ...model, settingsOverlay: 'import', exportData: '', showResetConfirm: false, importExportMessage: '' }, []],
      SetExportData: (msg) => [{ ...model, exportData: msg.value }, []],
      ImportedSettings: (msg) => {
        try {
          const parsed = JSON.parse(msg.data)
          if (!parsed || parsed.version !== SETTINGS_VERSION) {
            return [{ ...model, importExportMessage: t('settingsImportVersionMismatch', model.language), showResetConfirm: false }, []]
          }
          const s = parsed.settings
          if (!s || typeof s.language !== 'string') {
            return [{ ...model, importExportMessage: t('settingsImportInvalid', model.language), showResetConfirm: false }, []]
          }
          const next = applyImportData(model, s)
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSettingsData(next))) } catch { /* ok */ }
          return [next, []]
        } catch {
          return [{ ...model, importExportMessage: t('settingsImportInvalid', model.language), showResetConfirm: false }, []]
        }
      },
      ApplyImport: () => {
        try {
          const parsed = JSON.parse(model.exportData)
          if (!parsed || parsed.version !== SETTINGS_VERSION) {
            return [{ ...model, importExportMessage: t('settingsImportVersionMismatch', model.language), showResetConfirm: false, settingsOverlay: '' }, []]
          }
          const s = parsed.settings
          if (!s || typeof s.language !== 'string') {
            return [{ ...model, importExportMessage: t('settingsImportInvalid', model.language), showResetConfirm: false, settingsOverlay: '' }, []]
          }
          const next = applyImportData(model, s)
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSettingsData(next))) } catch { /* ok */ }
          return [next, []]
        } catch {
          return [{ ...model, importExportMessage: t('settingsImportInvalid', model.language), showResetConfirm: false, settingsOverlay: '' }, []]
        }
      },
      SettingsImportFailed: () => [{ ...model, importExportMessage: t('settingsImportFailed', model.language) }, []],
      DismissMessage: () => [{ ...model, settingsOverlay: '', importExportMessage: '', exportData: '' }, []],
    }),
  )

const SETTINGS_TAGS = new Set([
  'ClickedDarkMode', 'SetLanguage', 'ToggleMute',
  'CounterSetRate', 'CounterSetPitch', 'CounterSetDisplayMode',
  'FindItSetAnyWins', 'FindItSetVoiceMode', 'FindItSetPairsMode',
  'BubblesSetPopLabel', 'BubblesSetSayColor',
  'GreetingSetVoiceEffect',
  'MusicBoxToggleSongVisibility', 'MusicBoxSongDroppedOn',
])

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const result = _update(model, message)
  if (SETTINGS_TAGS.has(message._tag)) {
    return [result[0], [...result[1], persistSettings(result[0])]]
  }
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
      PageFindIt: () => t('pageTitleFindIt', model.language),
      PageBubbles: () => t('pageTitleBubbles', model.language),
      PageMusicBox: () => t('pageTitleMusicBox', model.language),
      PageAudioTest: () => t('pageTitleAudioTest', model.language),
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
      [h.Class(`app${isDark ? ' dark' : ''} lang-${model.language}`), h.OnMount({
        name: 'watchDarkMode',
        f: () => Stream.fromEventListener(
          window.matchMedia('(prefers-color-scheme: dark)'),
          'change',
        ).pipe(
          Stream.map(() => SystemDarkModeChanged()),
        ),
      }), h.OnMount({
        name: 'preventDoubleTapZoom',
        f: () => {
          let lastTouchEnd = 0
          document.addEventListener('touchend', (e) => {
            const now = Date.now()
            if (now - lastTouchEnd <= 300) e.preventDefault()
            lastTouchEnd = now
          }, { passive: false })
          return Stream.never
        },
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
        h.div([h.Class('settings-panel'), h.Style({ display: model.showSettings ? '' : 'none', width: `${model.settingsPanelWidth}px` })], [
          h.div([
            h.Class('settings-drag-handle'),
            h.OnPointerDown((_pointerType, _button, screenX) => Option.some(SettingsDragStarted({ screenX }))),
          ], ['⠿']),
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
            h.div([h.Class('setting-section-row')], [
              h.h3([], [t('sound', model.language)]),
              h.button(
                [
                  h.Class('mute-toggle'),
                  h.OnClick(ToggleMute()),
                ],
                [model.muted ? ICON_MUTED : ICON_UNMUTED],
              ),
            ]),
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
          model.page._tag === 'PageFindIt'
            ? h.div([h.Class('setting-section')], [
              h.h3([], [t('findItTitle', model.language)]),
              h.div([h.Class('lang-buttons')], [
                ...[
                  [false, t('findMode', model.language)] as const,
                  [true, t('anyMode', model.language)] as const,
                ].map(([val, label]) =>
                  h.button(
                    [
                      h.Class(val === model.findIt.anyWins ? 'btn btn-primary' : 'btn btn-secondary'),
                      h.OnClick(FindIt.SetAnyWins({ value: val })),
                    ],
                    [label],
                  ),
                ),
              ]),
              h.div([h.Class('lang-buttons'), h.Style({ marginTop: '0.5rem' })], [
                h.button(
                  [h.Class(!model.findIt.voiceMode ? 'btn btn-primary' : 'btn btn-secondary'), h.OnClick(FindIt.SetVoiceMode({ value: false }))],
                  [ICON_TEXT_MODE],
                ),
                h.button(
                  [h.Class(model.findIt.voiceMode ? 'btn btn-primary' : 'btn btn-secondary'), h.OnClick(FindIt.SetVoiceMode({ value: true }))],
                  [`${ICON_VOICE_MODE} ${t('voiceMode', model.language)}`],
                ),
              ]),
              h.div([h.Class('lang-buttons'), h.Style({ marginTop: '0.5rem' })], [
                h.button(
                  [h.Class(!model.findIt.pairsMode ? 'btn btn-primary' : 'btn btn-secondary'), h.OnClick(FindIt.SetPairsMode({ value: false }))],
                  [t('singleMode', model.language)],
                ),
                h.button(
                  [h.Class(model.findIt.pairsMode ? 'btn btn-primary' : 'btn btn-secondary'), h.OnClick(FindIt.SetPairsMode({ value: true }))],
                  [t('pairsMode', model.language)],
                ),
              ]),
            ])
            : null,
          model.page._tag === 'PageBubbles'
            ? h.div([h.Class('setting-section')], [
              h.h3([], [t('bubblesTitle', model.language)]),
              h.div([h.Class('lang-buttons')], [
                h.button(
                  [h.Class(!model.bubbles.popLabel && !model.bubbles.sayColor ? 'btn btn-primary' : 'btn btn-secondary'), h.OnClick(Bubbles.SetPopLabel({ value: false }))],
                  [t('normal', model.language)],
                ),
                h.button(
                  [h.Class(model.bubbles.popLabel && !model.bubbles.sayColor ? 'btn btn-primary' : 'btn btn-secondary'), h.OnClick(Bubbles.SetPopLabel({ value: true }))],
                  [t('popLabel', model.language)],
                ),
                h.button(
                  [h.Class(model.bubbles.sayColor ? 'btn btn-primary' : 'btn btn-secondary'), h.OnClick(Bubbles.SetSayColor({ value: true }))],
                  [t('sayColor', model.language)],
                ),
              ]),
            ])
            : null,
          model.page._tag === 'PageMusicBox'
            ? h.div([h.Class('setting-section')], [
              h.h3([], [t('musicBoxTitle', model.language)]),
              h.div([h.Class('settings-song-list')], [
                ...model.musicBox.songOrder
                  .filter(songIdx => songIdx < MusicBox.SONGS.length && MusicBox.SONGS[songIdx] !== undefined)
                  .map((songIdx, displayIdx) => {
                    const song = MusicBox.SONGS[songIdx]!
                    const isHidden = model.musicBox.hiddenSongs[songIdx]
                    const isDragged = model.musicBox.dragIndex === displayIdx
                    const songKey = MusicBox.SONG_TKEYS[song.key]
                    return h.div(
                      [
                        h.Key(songIdx.toString()),
                        h.Class('settings-song-item' + (isHidden ? ' settings-song-item--hidden' : '') + (isDragged ? ' settings-song-item--dragging' : '')),
                        h.Attribute('draggable', 'true'),
                        h.OnDragStart(MusicBox.SongDragStarted({ index: displayIdx })),
                        h.AllowDrop(),
                        h.OnDrop(MusicBox.SongDroppedOn({ index: displayIdx })),
                        h.OnDragEnd(MusicBox.SongDragEnded()),
                      ],
                      [
                        h.span([h.Class('settings-song-drag')], ['⠿']),
                        h.span([h.Class('settings-song-name')], [
                          `${song.emoji} ${t(songKey ?? 'musicBoxTwinkle', model.language)}`,
                        ]),
                        h.button(
                          [h.Class('btn btn-tiny'), h.OnClick(MusicBox.ToggleSongVisibility({ index: songIdx }))],
                          [isHidden ? t('musicBoxShow', model.language) : t('musicBoxHide', model.language)],
                        ),
                    ],
                  )
                }),
              ]),
            ])
            : null,
          h.div([h.Class('setting-section settings-actions')], [
            model.showResetConfirm
              ? h.div([h.Class('reset-confirm')], [
                h.p([h.Class('reset-confirm-text')], [t('settingsReset', model.language)]),
                h.div([h.Class('lang-buttons')], [
                  h.button(
                    [h.OnClick(ConfirmResetSettings()), h.Class('btn btn-danger')],
                    [t('confirm', model.language)],
                  ),
                  h.button(
                    [h.OnClick(CancelResetSettings()), h.Class('btn btn-secondary')],
                    [t('cancel', model.language)],
                  ),
                ]),
              ])
              : null,
            h.div([h.Class('lang-buttons')], [
              h.button(
                [h.OnClick(ResetSettings()), h.Class('btn btn-secondary')],
                [t('settingsReset', model.language)],
              ),
              h.button(
                [h.OnClick(ExportSettings()), h.Class('btn btn-secondary')],
                [t('settingsExport', model.language)],
              ),
              h.button(
                [h.OnClick(ImportSettings()), h.Class('btn btn-secondary')],
                [t('settingsImport', model.language)],
              ),
            ]),
            model.importExportMessage
              ? h.div([h.Class('settings-message'), h.OnClick(DismissMessage())], [model.importExportMessage])
              : null,
          ]),
          h.p([h.Class('settings-note')], [t('voiceNote', model.language)]),
        ]),
          M.value(model.page).pipe(
            M.tagsExhaustive({
              PageLanding: () => landingView(model.language),
              PageGreeting: () => Greeting.view(model.greeting, model.language),
              PageCounter: () => Counter.view(model.counter, model.language),
              PageFindIt: () => FindIt.view(model.findIt, model.language),
              PageBubbles: () => Bubbles.view(model.bubbles, model.language),
              PageMusicBox: () => MusicBox.view(model.musicBox, model.language),
              PageAudioTest: () => audioTestView(model.language),
            }),
          ),
          model.settingsOverlay
            ? h.div([
              h.Style({
                position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: '1000',
              }),
            ], [
              h.div([
                h.Style({
                  background: '#fff', borderRadius: '8px', padding: '1.5rem',
                  maxWidth: '90vw', maxHeight: '90vh', display: 'flex',
                  flexDirection: 'column', gap: '1rem', minWidth: '300px',
                }),
              ], [
                ...(model.settingsOverlay === 'export'
                  ? [
                    h.h3([h.Style({ margin: '0' })], [t('settingsExportSuccess', model.language)]),
                    h.textarea([
                      h.Value(model.exportData),
                      h.Readonly(true),
                      h.Style({ width: '100%', minHeight: '300px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical', boxSizing: 'border-box' }),
                    ], []),
                    h.div([h.Style({ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' })], [
                      h.button([h.OnClick(CopyExportData()), h.Class('btn btn-primary')], [t('settingsCopy', model.language)]),
                      h.button([h.OnClick(DismissMessage()), h.Class('btn btn-secondary')], [t('cancel', model.language)]),
                    ]),
                  ]
                  : model.settingsOverlay === 'import'
                    ? [
                      h.h3([h.Style({ margin: '0' })], [t('settingsImport', model.language)]),
                      h.textarea([
                        h.Value(model.exportData),
                        h.OnInput((v) => SetExportData({ value: v })),
                        h.Placeholder('Paste settings JSON here...'),
                        h.Style({ width: '100%', minHeight: '300px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical', boxSizing: 'border-box' }),
                      ], []),
                      h.div([h.Style({ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' })], [
                        h.button([h.OnClick(ApplyImport()), h.Class('btn btn-primary')], [t('settingsImport', model.language)]),
                        h.button([h.OnClick(DismissMessage()), h.Class('btn btn-secondary')], [t('cancel', model.language)]),
                      ]),
                    ]
                    : []),
              ]),
            ])
            : null,
        ],
      ),
    };
  }

