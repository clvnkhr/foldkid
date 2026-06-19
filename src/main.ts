import { Effect, Match as M, Option, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { Document, html } from 'foldkit/html'

import { ApplyImport, CancelResetSettings, ClickedAudioTest, ClickedBubbles, ClickedCounter, ClickedDarkMode, ClickedFindIt, ClickedLanding, ClickedDraw, ClickedMusicBox, ClickedSettings, ConfirmResetSettings, CopyExportData, DismissMessage, ExportSettings, ImportSettings, ImportedSettings, LandingDragEnded, LandingDragStarted, LandingDroppedOn, ResetSettings, SetExportData, SetLanguage, SetSpeechPitch, SetSpeechRate, SettingsDragEnded, SettingsDragMoved, SettingsDragStarted, SettingsImportFailed, SettingsPersisted, SystemDarkModeChanged, ToggleMute } from './message'

import { Page, PageAudioTest, PageBubbles, PageCounter, PageFindIt, PageLanding, PageDraw, PageMusicBox } from './route'

import * as FindIt from './games/findit'
import * as MusicBox from './games/musicbox'
import * as Counter from './games/counter'
import * as Bubbles from './games/bubbles'
import * as Draw from './games/draw'
import { LANDING_GAME_COUNT, view as landingView } from './pages/landing'
import { view as audioTestView } from './pages/audiotest'
import { Language, normalizeLanguage, t, tf } from './i18n'
import { DEFAULT_SPEECH_PITCH, DEFAULT_SPEECH_RATE, speak } from './speech'

const ICON_UNMUTED = '🔊'
const ICON_MUTED = '🔇'
const ICON_TEXT_MODE = '📝'
const ICON_VOICE_MODE = '🔊'

// PERSISTENCE

const STORAGE_KEY = 'foldkid-settings'
const SETTINGS_VERSION = 1
const DEFAULT_LANDING_ORDER = Array.from({ length: LANDING_GAME_COUNT }, (_, i) => i)

const DarkModeValues = ['auto', 'light', 'dark'] as const
type DarkMode = typeof DarkModeValues[number]
const DarkModeType = S.Union([S.Literal('auto'), S.Literal('light'), S.Literal('dark')])
const SettingsOverlay = S.Union([S.Literal(''), S.Literal('export'), S.Literal('import')])

const PersistedSettingsSchema = S.Struct({
  version: S.optionalKey(S.Number),
  language: S.optionalKey(Language),
  darkMode: S.optionalKey(DarkModeType),
  muted: S.optionalKey(S.Boolean),
  speechRate: S.optionalKey(S.Number),
  speechPitch: S.optionalKey(S.Number),
  counterDisplayMode: S.optionalKey(Counter.DisplayMode),
  findItAnyWins: S.optionalKey(S.Boolean),
  findItVoiceMode: S.optionalKey(S.Boolean),
  findItPairsMode: S.optionalKey(S.Boolean),
  findItEnabledPacks: S.optionalKey(S.Array(FindIt.EmojiPackKey)),
  bubblesPopLabel: S.optionalKey(S.Boolean),
  bubblesSayColor: S.optionalKey(S.Boolean),
  drawTopN: S.optionalKey(S.Number),
  drawRecognitionMode: S.optionalKey(Draw.RecognitionMode),
  drawFreeMode: S.optionalKey(S.Boolean),
  musicBoxSongOrder: S.optionalKey(S.Array(S.Number)),
  musicBoxHiddenSongs: S.optionalKey(S.Array(S.Boolean)),
  musicBoxDrumVolume: S.optionalKey(S.Number),
  landingOrder: S.optionalKey(S.Array(S.Number)),
})
type PersistedSettings = typeof PersistedSettingsSchema.Type

const SettingsExportSchema = S.Struct({
  version: S.Number,
  exportedAt: S.optionalKey(S.String),
  settings: PersistedSettingsSchema,
})

const decodePersistedSettings = S.decodeUnknownOption(PersistedSettingsSchema)
const decodeSettingsExport = S.decodeUnknownOption(SettingsExportSchema)

const loadSettings = (): Partial<PersistedSettings> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const decoded = decodePersistedSettings(JSON.parse(raw))
    return Option.isSome(decoded) ? decoded.value : {}
  } catch {
    return {}
  }
}

const isDarkMode = (value: string | undefined): value is DarkMode =>
  value !== undefined && (DarkModeValues as readonly string[]).includes(value)

const sanitizeDarkMode = (value: string | undefined, fallback: DarkMode): DarkMode =>
  isDarkMode(value) ? value : fallback

const sameStringArray = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index])

const isLandingOrder = (value: readonly number[] | undefined): value is number[] =>
  Array.isArray(value) &&
  value.length === LANDING_GAME_COUNT &&
  new Set(value).size === LANDING_GAME_COUNT &&
  value.every(index => Number.isInteger(index) && index >= 0 && index < LANDING_GAME_COUNT)

const normalizeSongOrder = (value: readonly number[] | undefined, fallback: readonly number[]): number[] => {
  if (!Array.isArray(value)) return [...fallback]
  const seen = new Set<number>()
  const valid = value.filter((index): index is number => {
    if (!Number.isInteger(index) || index < 0 || index >= MusicBox.SONGS.length || seen.has(index)) return false
    seen.add(index)
    return true
  })
  const missing = MusicBox.SONGS
    .map((_, index) => index)
    .filter(index => !seen.has(index))
  return [...valid, ...missing]
}

const normalizeHiddenSongs = (value: readonly boolean[] | undefined): boolean[] =>
  MusicBox.SONGS.map((_, index) => value?.[index] === true)

const normalizeDrumVolume = (value: number | undefined, fallback: number): number =>
  value === undefined ? fallback : Math.min(1, Math.max(0, value))

const buildSettingsData = (model: Model): PersistedSettings => ({
  version: SETTINGS_VERSION,
  language: model.language,
  darkMode: model.darkMode,
  muted: model.muted,
  speechRate: model.speechRate,
  speechPitch: model.speechPitch,
  counterDisplayMode: model.counter.displayMode,
  findItAnyWins: model.findIt.anyWins,
  findItVoiceMode: model.findIt.voiceMode,
  findItPairsMode: model.findIt.pairsMode,
  findItEnabledPacks: model.findIt.enabledPacks,
  bubblesPopLabel: model.bubbles.popLabel,
  bubblesSayColor: model.bubbles.sayColor,
  drawTopN: model.draw.topN,
  drawRecognitionMode: model.draw.recognitionMode,
  drawFreeMode: model.draw.freeMode,
  musicBoxSongOrder: model.musicBox.songOrder,
  musicBoxHiddenSongs: model.musicBox.hiddenSongs,
  musicBoxDrumVolume: model.musicBox.drumVolume,
  landingOrder: model.landingOrder,
})

const persistSettings = (model: Model): Command.Command<Message> => {
  const settings = buildSettingsData(model)
  return {
    name: 'PersistSettings',
    effect: Effect.sync(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    }).pipe(Effect.as(SettingsPersisted())),
  }
}

const removeSettings = (): Command.Command<Message> => ({
  name: 'RemoveSettings',
  effect: Effect.sync(() => {
    localStorage.removeItem(STORAGE_KEY)
  }).pipe(Effect.as(SettingsPersisted())),
})

const copyExportCmd = (text: string): Command.Command<Message> => ({
  name: 'CopyExport',
  effect: Effect.sync(() => {
    navigator.clipboard.writeText(text).catch(() => {})
  }).pipe(Effect.as(DismissMessage())),
})

// MODEL

export const Model = S.Struct({
  page: Page,
  darkMode: DarkModeType,
  language: Language,
  showSettings: S.Boolean,
  muted: S.Boolean,
  speechRate: S.Number,
  speechPitch: S.Number,
  musicBox: MusicBox.Model,
  counter: Counter.Model,
  findIt: FindIt.Model,
  bubbles: Bubbles.Model,
  draw: Draw.Model,
  settingsPanelWidth: S.Number,
  isDraggingSettings: S.Boolean,
  settingsDragStartMouseX: S.Number,
  showResetConfirm: S.Boolean,
  importExportMessage: S.String,
  exportData: S.String,
  settingsOverlay: SettingsOverlay,
  landingOrder: S.Array(S.Number),
  landingDragIndex: S.Number,
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
  SetSpeechRate,
  SetSpeechPitch,
  ClickedCounter,
  ClickedFindIt,
  ClickedBubbles,
  ClickedDraw,
  ClickedMusicBox,
  ClickedAudioTest,
  LandingDragStarted,
  LandingDroppedOn,
  LandingDragEnded,
  Counter.PointerDown,
  Counter.PressedIncrement,
  Counter.PressedDecrement,
  Counter.ClickedReset,
  Counter.SetDisplayMode,
  FindIt.ClickedCell,
  FindIt.ClickedNext,
  FindIt.SetAnyWins,
  FindIt.SetVoiceMode,
  FindIt.SetPairsMode,
  FindIt.SetEmojiPackEnabled,
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
  Counter.SoundPlayed,
  FindIt.SoundPlayed,
  Bubbles.SoundPlayed,
  Bubbles.SetRainbowMode,
  Bubbles.SetPopLabel,
  Bubbles.SetSayColor,
  Bubbles.ClickedColor,
  Draw.BoardRecognized,
  Draw.SubmitBoard,
  Draw.NextRound,
  Draw.SkipTarget,
  Draw.ShuffleTarget,
  Draw.ClearBoard,
  Draw.SetTopN,
  Draw.SetRecognitionMode,
  Draw.SetFreeMode,
  Draw.RecognitionFailed,
  MusicBox.Play,
  MusicBox.Stop,
  MusicBox.SetSong,
  MusicBox.SetInstrument,
  MusicBox.SongEnded,
  MusicBox.PreviousSong,
  MusicBox.SkipSong,
  MusicBox.NoteOn,
  MusicBox.NoteOff,
  MusicBox.AddKey,
  MusicBox.RemoveKey,
  MusicBox.OctaveUp,
  MusicBox.OctaveDown,
  MusicBox.ToggleBottomKeyboard,
  MusicBox.SetBottomPanelMode,
  MusicBox.ShiftBottom,
  MusicBox.ShiftTop,
  MusicBox.TempoUp,
  MusicBox.TempoDown,
  MusicBox.ToggleLyrics,
  MusicBox.TogglePause,
  MusicBox.TransposeUp,
  MusicBox.TransposeDown,
  MusicBox.CycleRepeatMode,
  MusicBox.SetDrumVolume,
  MusicBox.DrumPadHit,
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
  const language = normalizeLanguage(saved.language)
  const speechRate = saved.speechRate ?? DEFAULT_SPEECH_RATE
  const speechPitch = saved.speechPitch ?? DEFAULT_SPEECH_PITCH
  const pairsMode = saved.findItPairsMode ?? false
  const findItEnabledPacks = FindIt.normalizeEmojiPackKeys(saved.findItEnabledPacks)
  const findItInit = FindIt.init(pairsMode, findItEnabledPacks)
  const cmds: Command.Command<Message>[] = []
  const voiceMode = saved.findItVoiceMode ?? false
  if (voiceMode && !saved.findItAnyWins && !saved.muted) {
    cmds.push(speak(tf('whereIs', language, FindIt.emojiName(findItInit.target, language)), FindIt.SoundPlayed(), { rate: speechRate, pitch: speechPitch, lang: language }))
  }
  const musicBoxInit = MusicBox.init()
  return [
    {
      page: PageLanding(),
      darkMode: sanitizeDarkMode(saved.darkMode, 'auto'),
      language,
      showSettings: false,
      muted: saved.muted ?? false,
      speechRate,
      speechPitch,
      musicBox: {
        ...musicBoxInit,
        songOrder: normalizeSongOrder(saved.musicBoxSongOrder, musicBoxInit.songOrder),
        hiddenSongs: normalizeHiddenSongs(saved.musicBoxHiddenSongs),
        drumVolume: normalizeDrumVolume(saved.musicBoxDrumVolume, musicBoxInit.drumVolume),
      },
      counter: {
        ...Counter.init,
        displayMode: saved.counterDisplayMode ?? Counter.init.displayMode,
      },
      findIt: { ...findItInit, anyWins: saved.findItAnyWins ?? false, voiceMode, pairsMode, enabledPacks: findItEnabledPacks },
      bubbles: {
        ...Bubbles.init(),
        popLabel: saved.bubblesPopLabel ?? false,
        sayColor: saved.bubblesSayColor ?? false,
      },
      draw: {
        ...Draw.init(),
        topN: Draw.normalizeTopN(saved.drawTopN),
        recognitionMode: saved.drawRecognitionMode ?? Draw.DEFAULT_RECOGNITION_MODE,
        freeMode: saved.drawFreeMode ?? false,
      },
      settingsPanelWidth: 150,
      isDraggingSettings: false,
      settingsDragStartMouseX: 0,
      showResetConfirm: false,
      importExportMessage: '',
      exportData: '',
      settingsOverlay: '',
      landingOrder: isLandingOrder(saved.landingOrder)
        ? [...saved.landingOrder]
        : [...DEFAULT_LANDING_ORDER],
      landingDragIndex: -1,
    },
    cmds,
  ]
}

// UPDATE

const updateCounter = (
  model: Model,
  message: Counter.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = Counter.update(model.counter, message, model.language, model.muted, { rate: model.speechRate, pitch: model.speechPitch })
  return [{ ...model, counter: next }, cmds]
}

const updateFindIt = (
  model: Model,
  message: FindIt.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = FindIt.update(model.findIt, message, model.muted, model.language, { rate: model.speechRate, pitch: model.speechPitch })
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

const updateDraw = (
  model: Model,
  message: Draw.Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const [next, cmds] = Draw.update(model.draw, message)
  return [{ ...model, draw: next }, cmds]
}

const cycleDarkMode = (current: DarkMode): DarkMode => {
  if (current === 'auto') return 'light'
  if (current === 'light') return 'dark'
  return 'auto'
}

const applyImportData = (model: Model, s: PersistedSettings): Model => {
  const findItAnyWins = s.findItAnyWins ?? model.findIt.anyWins
  const findItVoiceMode = s.findItVoiceMode ?? model.findIt.voiceMode
  const findItPairsMode = s.findItPairsMode ?? model.findIt.pairsMode
  const findItEnabledPacks = FindIt.normalizeEmojiPackKeys(s.findItEnabledPacks ?? model.findIt.enabledPacks)
  const shouldRegenerateFindIt = findItPairsMode !== model.findIt.pairsMode || !sameStringArray(findItEnabledPacks, model.findIt.enabledPacks)
  const importedFindIt = shouldRegenerateFindIt
    ? {
        ...FindIt.init(findItPairsMode, findItEnabledPacks),
        anyWins: findItAnyWins,
        voiceMode: findItVoiceMode,
        pairsMode: findItPairsMode,
        enabledPacks: findItEnabledPacks,
      }
    : {
        ...model.findIt,
        anyWins: findItAnyWins,
        voiceMode: findItVoiceMode,
        pairsMode: findItPairsMode,
        enabledPacks: findItEnabledPacks,
      }

  return {
    ...model,
    settingsOverlay: '',
    language: s.language ?? model.language,
    darkMode: sanitizeDarkMode(s.darkMode, model.darkMode),
    muted: s.muted ?? model.muted,
    speechRate: s.speechRate ?? model.speechRate,
    speechPitch: s.speechPitch ?? model.speechPitch,
    counter: {
      ...model.counter,
      displayMode: s.counterDisplayMode ?? model.counter.displayMode,
    },
    findIt: importedFindIt,
    bubbles: {
      ...model.bubbles,
      popLabel: s.bubblesPopLabel ?? model.bubbles.popLabel,
      sayColor: s.bubblesSayColor ?? model.bubbles.sayColor,
    },
    draw: {
      ...model.draw,
      topN: Draw.normalizeTopN(s.drawTopN ?? model.draw.topN),
      recognitionMode: s.drawRecognitionMode ?? model.draw.recognitionMode,
      freeMode: s.drawFreeMode ?? model.draw.freeMode,
    },
    musicBox: {
      ...model.musicBox,
      songOrder: normalizeSongOrder(s.musicBoxSongOrder, model.musicBox.songOrder),
      hiddenSongs: normalizeHiddenSongs(s.musicBoxHiddenSongs),
      drumVolume: normalizeDrumVolume(s.musicBoxDrumVolume, model.musicBox.drumVolume),
    },
    landingOrder: isLandingOrder(s.landingOrder)
      ? [...s.landingOrder]
      : model.landingOrder,
    showResetConfirm: false,
    importExportMessage: t('settingsImportSuccess', model.language),
  }
}

type ParseImportResult =
  | { readonly _tag: 'Success'; readonly value: PersistedSettings }
  | { readonly _tag: 'Invalid' }
  | { readonly _tag: 'VersionMismatch' }

const parseImportData = (data: string): ParseImportResult => {
  try {
    const parsed: unknown = JSON.parse(data)
    if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
      return { _tag: 'Invalid' }
    }
    if ((parsed as { version?: unknown }).version !== SETTINGS_VERSION) {
      return { _tag: 'VersionMismatch' }
    }
    const decoded = decodeSettingsExport(parsed)
    if (Option.isSome(decoded)) return { _tag: 'Success', value: decoded.value.settings }
    return { _tag: 'Invalid' }
  } catch {
    return { _tag: 'Invalid' }
  }
}

const importSettingsResult = (
  model: Model,
  data: string,
  closeOverlay: boolean,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const close: Partial<Pick<Model, 'settingsOverlay'>> = closeOverlay ? { settingsOverlay: '' } : {}
  const parsed = parseImportData(data)
  switch (parsed._tag) {
    case 'VersionMismatch':
      return [{ ...model, ...close, importExportMessage: t('settingsImportVersionMismatch', model.language), showResetConfirm: false }, []]
    case 'Invalid':
      return [{ ...model, ...close, importExportMessage: t('settingsImportInvalid', model.language), showResetConfirm: false }, []]
    case 'Success': {
      const next = applyImportData(model, parsed.value)
      return [{ ...next, ...close }, [persistSettings(next)]]
    }
  }
}

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
      SetSpeechRate: (msg) => [{ ...model, speechRate: msg.value }, []],
      SetSpeechPitch: (msg) => [{ ...model, speechPitch: msg.value }, []],
      ClickedCounter: () => [{ ...model, page: PageCounter() }, []],
      ClickedFindIt: () => [{ ...model, page: PageFindIt() }, []],
      ClickedBubbles: () => [{ ...model, page: PageBubbles() }, []],
      ClickedDraw: () => [{ ...model, page: PageDraw() }, []],
      ClickedMusicBox: () => [{ ...model, page: PageMusicBox() }, []],
      ClickedAudioTest: () => [{ ...model, page: PageAudioTest() }, []],
      LandingDragStarted: (msg) => [{ ...model, landingDragIndex: msg.index }, []],
      LandingDroppedOn: (msg) => {
        if (model.landingDragIndex < 0 || model.landingDragIndex === msg.index) return [{ ...model, landingDragIndex: -1 }, []]
        const order = [...model.landingOrder]
        const tmp = order[model.landingDragIndex]
        order[model.landingDragIndex] = order[msg.index]!
        order[msg.index] = tmp!
        const next = { ...model, landingOrder: order, landingDragIndex: -1 }
        return [next, [persistSettings(next)]]
      },
      LandingDragEnded: () => [{ ...model, landingDragIndex: -1 }, []],
      CounterPointerDown: (msg) => updateCounter(model, msg),
      CounterPressedIncrement: (msg) => updateCounter(model, msg),
      CounterPressedDecrement: (msg) => updateCounter(model, msg),
      CounterClickedReset: (msg) => updateCounter(model, msg),
      CounterSetDisplayMode: (msg) => updateCounter(model, msg),
      FindItClickedCell: (msg) => updateFindIt(model, msg),
      FindItClickedNext: (msg) => updateFindIt(model, msg),
      FindItSetAnyWins: (msg) => updateFindIt(model, msg),
      FindItSetVoiceMode: (msg) => updateFindIt(model, msg),
      FindItSetPairsMode: (msg) => updateFindIt(model, msg),
      FindItSetEmojiPackEnabled: (msg) => updateFindIt(model, msg),
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
      CounterSoundPlayed: (msg) => updateCounter(model, msg),
      FindItSoundPlayed: (msg) => updateFindIt(model, msg),
      BubblesSoundPlayed: (msg) => updateBubbles(model, msg),
      BubblesClickedColor: (msg) => updateBubbles(model, msg),
      BubblesSetRainbowMode: (msg) => updateBubbles(model, msg),
      BubblesSetPopLabel: (msg) => updateBubbles(model, msg),
      BubblesSetSayColor: (msg) => updateBubbles(model, msg),
      DrawBoardRecognized: (msg) => updateDraw(model, msg),
      DrawSubmitBoard: (msg) => updateDraw(model, msg),
      DrawNextRound: (msg) => updateDraw(model, msg),
      DrawSkipTarget: (msg) => updateDraw(model, msg),
      DrawShuffleTarget: (msg) => updateDraw(model, msg),
      DrawClearBoard: (msg) => updateDraw(model, msg),
      DrawSetTopN: (msg) => updateDraw(model, msg),
      DrawSetRecognitionMode: (msg) => updateDraw(model, msg),
      DrawSetFreeMode: (msg) => updateDraw(model, msg),
      DrawRecognitionFailed: (msg) => updateDraw(model, msg),
      MusicBoxPlay: (msg) => updateMusicBox(model, msg),
      MusicBoxStop: (msg) => updateMusicBox(model, msg),
      MusicBoxSetSong: (msg) => updateMusicBox(model, msg),
      MusicBoxSetInstrument: (msg) => updateMusicBox(model, msg),
      MusicBoxSongEnded: (msg) => updateMusicBox(model, msg),
      MusicBoxPreviousSong: (msg) => updateMusicBox(model, msg),
      MusicBoxSkipSong: (msg) => updateMusicBox(model, msg),
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
      MusicBoxSetBottomPanelMode: (msg) => updateMusicBox(model, msg),
      MusicBoxToggleLyrics: (msg) => updateMusicBox(model, msg),
      MusicBoxTogglePause: (msg) => updateMusicBox(model, msg),
      MusicBoxTransposeUp: (msg) => updateMusicBox(model, msg),
      MusicBoxTransposeDown: (msg) => updateMusicBox(model, msg),
      MusicBoxCycleRepeatMode: (msg) => updateMusicBox(model, msg),
      MusicBoxSetDrumVolume: (msg) => updateMusicBox(model, msg),
      MusicBoxDrumPadHit: (msg) => updateMusicBox(model, msg),
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
        const fresh = init()[0]
        return [
          { ...fresh, showSettings: model.showSettings, settingsPanelWidth: model.settingsPanelWidth, showResetConfirm: false, importExportMessage: t('settingsResetConfirm', model.language) },
          [removeSettings()],
        ]
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
      ImportedSettings: (msg) => importSettingsResult(model, msg.data, false),
      ApplyImport: () => importSettingsResult(model, model.exportData, true),
      SettingsImportFailed: () => [{ ...model, importExportMessage: t('settingsImportFailed', model.language) }, []],
      DismissMessage: () => [{ ...model, settingsOverlay: '', importExportMessage: '', exportData: '' }, []],
    }),
  )

export const PERSISTED_SETTINGS_MESSAGE_TAGS = [
  'ClickedDarkMode', 'SetLanguage', 'ToggleMute', 'SetSpeechRate', 'SetSpeechPitch',
  'CounterSetDisplayMode',
  'FindItSetAnyWins', 'FindItSetVoiceMode', 'FindItSetPairsMode', 'FindItSetEmojiPackEnabled',
  'BubblesSetPopLabel', 'BubblesSetSayColor',
  'DrawSetTopN', 'DrawSetRecognitionMode', 'DrawSetFreeMode',
  'MusicBoxSetDrumVolume', 'MusicBoxToggleSongVisibility', 'MusicBoxSongDroppedOn',
] as const satisfies ReadonlyArray<Message['_tag']>

type PersistedSettingsMessageTag = typeof PERSISTED_SETTINGS_MESSAGE_TAGS[number]
type PersistedSettingsMessage = Extract<Message, { readonly _tag: PersistedSettingsMessageTag }>

const persistedSettingsMessageTags = new Set<Message['_tag']>(PERSISTED_SETTINGS_MESSAGE_TAGS)

export const shouldPersistSettings = (message: Message): boolean =>
  persistedSettingsMessageTags.has(message._tag)

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const result = _update(model, message)
  if (shouldPersistSettings(message)) {
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
      PageCounter: () => t('pageTitleCounter', model.language),
      PageFindIt: () => t('pageTitleFindIt', model.language),
      PageBubbles: () => t('pageTitleBubbles', model.language),
      PageDraw: () => t('pageTitleDraw', model.language),
      PageMusicBox: () => t('pageTitleMusicBox', model.language),
      PageAudioTest: () => t('pageTitleAudioTest', model.language),
    }),
  )

export const preventDoubleTapZoomStream = (): Stream.Stream<never> =>
  Stream.callback<never>(() =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          let lastTouchEnd = 0
          const onTouchEnd = (event: TouchEvent): void => {
            const now = Date.now()
            if (now - lastTouchEnd <= 300) event.preventDefault()
            lastTouchEnd = now
          }
          document.addEventListener('touchend', onTouchEnd, { passive: false })
          return onTouchEnd
        }),
        onTouchEnd => Effect.sync(() => {
          document.removeEventListener('touchend', onTouchEnd)
        }),
      )
      return yield* Effect.never
    }),
  )

export const view = (model: Model): Document => {
  const h = html<Message>()
  const settingsOnClick = (message: PersistedSettingsMessage) => h.OnClick(message)
  const settingsOnDrop = (message: PersistedSettingsMessage) => h.OnDrop(message)
  const settingsOnInput = (toMessage: (value: string) => PersistedSettingsMessage) => h.OnInput(toMessage)

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
        f: preventDoubleTapZoomStream,
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
                    settingsOnClick(SetLanguage({ value: val })),
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
                  settingsOnClick(ToggleMute()),
                ],
                [model.muted ? ICON_MUTED : ICON_UNMUTED],
              ),
            ]),
            h.div([h.Class('setting-row')], [
              h.label([], [t('speechRate', model.language)]),
              h.div([h.Class('slider-row')], [
                h.input([
                  h.Type('range'),
                  h.Min('0.2'),
                  h.Max('3'),
                  h.Step('0.1'),
                  h.Value(model.speechRate.toString()),
                  settingsOnInput((v) => SetSpeechRate({ value: parseFloat(v) })),
                ]),
                h.span([], [model.speechRate.toFixed(1)]),
              ]),
            ]),
            h.div([h.Class('setting-row')], [
              h.label([], [t('speechPitch', model.language)]),
              h.div([h.Class('slider-row')], [
                h.input([
                  h.Type('range'),
                  h.Min('0.2'),
                  h.Max('4'),
                  h.Step('0.1'),
                  h.Value(model.speechPitch.toString()),
                  settingsOnInput((v) => SetSpeechPitch({ value: parseFloat(v) })),
                ]),
                h.span([], [model.speechPitch.toFixed(1)]),
              ]),
            ]),
          ]),
          model.page._tag === 'PageCounter'
            ? h.div([h.Class('setting-section')], [
              h.h3([], [t('counterTitle', model.language)]),
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
                        settingsOnClick(Counter.SetDisplayMode({ value: val })),
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
                      settingsOnClick(FindIt.SetAnyWins({ value: val })),
                    ],
                    [label],
                  ),
                ),
              ]),
              h.div([h.Class('lang-buttons'), h.Style({ marginTop: '0.5rem' })], [
                h.button(
                  [h.Class(!model.findIt.voiceMode ? 'btn btn-primary' : 'btn btn-secondary'), settingsOnClick(FindIt.SetVoiceMode({ value: false }))],
                  [ICON_TEXT_MODE],
                ),
                h.button(
                  [h.Class(model.findIt.voiceMode ? 'btn btn-primary' : 'btn btn-secondary'), settingsOnClick(FindIt.SetVoiceMode({ value: true }))],
                  [`${ICON_VOICE_MODE} ${t('voiceMode', model.language)}`],
                ),
              ]),
              h.div([h.Class('lang-buttons'), h.Style({ marginTop: '0.5rem' })], [
                h.button(
                  [h.Class(!model.findIt.pairsMode ? 'btn btn-primary' : 'btn btn-secondary'), settingsOnClick(FindIt.SetPairsMode({ value: false }))],
                  [t('singleMode', model.language)],
                ),
                h.button(
                  [h.Class(model.findIt.pairsMode ? 'btn btn-primary' : 'btn btn-secondary'), settingsOnClick(FindIt.SetPairsMode({ value: true }))],
                  [t('pairsMode', model.language)],
                ),
              ]),
              h.div([h.Class('setting-row')], [
                h.label([], [t('findItEmojiPacks', model.language)]),
                h.div([h.Class('emoji-pack-buttons')], [
                  ...FindIt.EMOJI_PACKS.map((pack) => {
                    const enabled = model.findIt.enabledPacks.includes(pack.key)
                    const isLastEnabled = enabled && model.findIt.enabledPacks.length === 1
                    return h.button(
                      [
                        h.Class(enabled ? 'btn btn-primary emoji-pack-btn' : 'btn btn-secondary emoji-pack-btn'),
                        h.Disabled(isLastEnabled),
                        settingsOnClick(FindIt.SetEmojiPackEnabled({ key: pack.key, value: !enabled })),
                      ],
                      [
                        h.span([h.Class('emoji-pack-sample')], [pack.sample]),
                        h.span([], [t(pack.labelKey, model.language)]),
                      ],
                    )
                  }),
                ]),
              ]),
            ])
            : null,
          model.page._tag === 'PageBubbles'
            ? h.div([h.Class('setting-section')], [
              h.h3([], [t('bubblesTitle', model.language)]),
              h.div([h.Class('lang-buttons')], [
                h.button(
                  [h.Class(!model.bubbles.popLabel && !model.bubbles.sayColor ? 'btn btn-primary' : 'btn btn-secondary'), settingsOnClick(Bubbles.SetPopLabel({ value: false }))],
                  [t('normal', model.language)],
                ),
                h.button(
                  [h.Class(model.bubbles.popLabel && !model.bubbles.sayColor ? 'btn btn-primary' : 'btn btn-secondary'), settingsOnClick(Bubbles.SetPopLabel({ value: true }))],
                  [t('popLabel', model.language)],
                ),
                h.button(
                  [h.Class(model.bubbles.sayColor ? 'btn btn-primary' : 'btn btn-secondary'), settingsOnClick(Bubbles.SetSayColor({ value: true }))],
                  [t('sayColor', model.language)],
                ),
              ]),
            ])
            : null,
          model.page._tag === 'PageDraw'
            ? h.div([h.Class('setting-section')], [
              h.h3([], [t('drawTitle', model.language)]),
              h.div([h.Class('lang-buttons')], [
                h.button(
                  [h.Class(model.draw.recognitionMode === 'model' ? 'btn btn-primary' : 'btn btn-secondary'), settingsOnClick(Draw.SetRecognitionMode({ value: 'model' }))],
                  ['Model'],
                ),
                h.button(
                  [h.Class(model.draw.recognitionMode === 'template' ? 'btn btn-primary' : 'btn btn-secondary'), settingsOnClick(Draw.SetRecognitionMode({ value: 'template' }))],
                  ['Template'],
                ),
              ]),
              h.div([h.Class('lang-buttons')], [
                h.button(
                  [h.Class(!model.draw.freeMode ? 'btn btn-primary' : 'btn btn-secondary'), settingsOnClick(Draw.SetFreeMode({ value: false }))],
                  ['Prompt'],
                ),
                h.button(
                  [h.Class(model.draw.freeMode ? 'btn btn-primary' : 'btn btn-secondary'), settingsOnClick(Draw.SetFreeMode({ value: true }))],
                  ['Free mode'],
                ),
              ]),
              h.div([h.Class('setting-row')], [
                h.label([], ['Top predictions']),
                h.div([h.Class('slider-row')], [
                  h.input([
                    h.Type('range'),
                    h.Min(Draw.MIN_TOP_N.toString()),
                    h.Max(Draw.MAX_TOP_N.toString()),
                    h.Step('1'),
                    h.Value(model.draw.topN.toString()),
                    settingsOnInput((v) => Draw.SetTopN({ value: parseFloat(v) })),
                  ]),
                  h.span([], [model.draw.topN.toString()]),
                ]),
              ]),
            ])
            : null,
          model.page._tag === 'PageMusicBox'
            ? h.div([h.Class('setting-section')], [
              h.h3([], [t('musicBoxTitle', model.language)]),
              h.div([h.Class('setting-row')], [
                h.label([], [t('musicBoxDrumVolume', model.language)]),
                h.div([h.Class('slider-row')], [
                  h.input([
                    h.Type('range'),
                    h.Min('0'),
                    h.Max('1'),
                    h.Step('0.05'),
                    h.Value(model.musicBox.drumVolume.toString()),
                    settingsOnInput((v) => MusicBox.SetDrumVolume({ value: parseFloat(v) })),
                  ]),
                  h.span([], [`${Math.round(model.musicBox.drumVolume * 100)}%`]),
                ]),
              ]),
              h.div([h.Class('settings-song-list')], [
                ...model.musicBox.songOrder
                  .filter(songIdx => songIdx < MusicBox.SONGS.length && MusicBox.SONGS[songIdx] !== undefined)
                  .map((songIdx, displayIdx) => {
                    const song = MusicBox.SONGS[songIdx]!
                    const isHidden = model.musicBox.hiddenSongs[songIdx]
                    const isLastVisibleSong = !isHidden && model.musicBox.songOrder.filter(i => !model.musicBox.hiddenSongs[i]).length <= 1
                    const isDragged = model.musicBox.dragIndex === displayIdx
                    const songKey = MusicBox.SONG_TKEYS[song.key]
                    return h.div(
                      [
                        h.Key(songIdx.toString()),
                        h.Class('settings-song-item' + (isHidden ? ' settings-song-item--hidden' : '') + (isDragged ? ' settings-song-item--dragging' : '')),
                        h.Attribute('draggable', 'true'),
                        h.OnDragStart(MusicBox.SongDragStarted({ index: displayIdx })),
                        h.AllowDrop(),
                        settingsOnDrop(MusicBox.SongDroppedOn({ index: displayIdx })),
                        h.OnDragEnd(MusicBox.SongDragEnded()),
                      ],
                      [
                        h.span([h.Class('settings-song-drag')], ['⠿']),
                        h.span([h.Class('settings-song-name')], [
                          `${song.emoji} ${t(songKey ?? 'musicBoxTwinkle', model.language)}`,
                        ]),
                        h.button(
                          [h.Class('btn btn-tiny'), h.Disabled(isLastVisibleSong), settingsOnClick(MusicBox.ToggleSongVisibility({ index: songIdx }))],
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
              PageLanding: () => landingView([...model.landingOrder], model.language, model.landingDragIndex),
              PageCounter: () => Counter.view(model.counter, model.language),
              PageFindIt: () => FindIt.view(model.findIt, model.language),
              PageBubbles: () => Bubbles.view(model.bubbles, model.language),
              PageDraw: () => Draw.view(model.draw),
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
