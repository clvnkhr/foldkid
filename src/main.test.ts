import { Effect, Fiber, Option, Schema as S, Stream } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { Story } from 'foldkit/test'
import * as Main from './main'
import { multitouchClickStream } from './multitouch'
import * as Counter from './games/counter'
import * as FindIt from './games/findit'
import * as Bubbles from './games/bubbles'
import * as Bubbles3d from './games/bubbles3d'
import * as Handwriting from './games/handwriting'
import { ClickedHandwriting } from './message'
import { t, translations } from './i18n'
import * as Draw from './games/draw'
import * as Memory from './games/memory'
import * as MusicBox from './games/musicbox'
import * as Rps from './games/rps/main'
import * as MagneticBlocks from './games/magneticBlocks'
import * as TalkingKeyboard from './games/talkingKeyboard'
import * as GrowingNumbers from './games/growingNumbers'
import * as ShapeWorkshop from './games/shapeWorkshop'
import { LANDING_GAME_COUNT, LANDING_GAMES } from './pages/landing'
import { ApplyImport, ClickedLanding, ClickedCounter, ClickedFindIt, ClickedBubbles, ClickedBubbles3d, ClickedDarkMode, ClickedGrowingNumbers, ClickedMagneticBlocks, ClickedMemory, ClickedSettings, ClickedShapeWorkshop, ClickedTalkingKeyboard, ConfirmResetSettings, ExportSettings, ImportedSettings, LandingDragEnded, LandingDragStarted, LandingDroppedOn, LandingSettingsDragEnded, LandingSettingsDragStarted, LandingSettingsDroppedOn, LandingToggleGameVisibility, SetExportData, SetLanguage, SetSpeechPitch, SetSpeechRate, SettingsPersisted, ToggleMute } from './message'

const resolveSettings = [{ name: 'PersistSettings' }, SettingsPersisted()] as const
const resolveBubblesChime = [{ name: 'PlayChime' }, Bubbles.SoundPlayed()] as const
const resolveBubblesSpeak = [{ name: 'Speak' }, Bubbles.SoundPlayed()] as const
const resolveBubbles3dChime = [{ name: 'Bubbles3dPlayChime' }, Bubbles3d.SoundPlayed()] as const
const resolveBubbles3dSpeak = [{ name: 'Bubbles3dSpeakCreation' }, Bubbles3d.SoundPlayed()] as const
const STORAGE_KEY = 'foldkid-settings'
const segmentEmoji = (emoji: string): string[] =>
  [...new Intl.Segmenter().segment(emoji)].map(segment => segment.segment)

interface SpokenUtterance {
  readonly text: string
  readonly rate: number
  readonly pitch: number
  readonly lang: string
}

const withSpeechMock = async (run: (spoken: SpokenUtterance[]) => Promise<void>): Promise<void> => {
  const originalSpeechSynthesis = globalThis.speechSynthesis
  const originalUtterance = globalThis.SpeechSynthesisUtterance
  const spoken: SpokenUtterance[] = []

  globalThis.speechSynthesis = {
    getVoices: () => [],
    cancel: () => {},
    speak: (utterance: SpeechSynthesisUtterance) => {
      spoken.push({
        text: utterance.text,
        rate: utterance.rate,
        pitch: utterance.pitch,
        lang: utterance.lang,
      })
      setTimeout(() => utterance.onend?.(new Event('end') as SpeechSynthesisEvent), 0)
    },
    pending: false,
    speaking: false,
    paused: false,
    onvoiceschanged: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    pause: () => {},
    resume: () => {},
  } as unknown as SpeechSynthesis
  globalThis.SpeechSynthesisUtterance = class MockUtterance {
    text: string
    rate = 1
    pitch = 1
    lang = 'en'
    voice: SpeechSynthesisVoice | null = null
    onstart: (() => void) | null = null
    onend: (() => void) | null = null
    onerror: ((e: SpeechSynthesisErrorEvent) => void) | null = null
    onpause: (() => void) | null = null
    onresume: (() => void) | null = null
    onmark: ((e: SpeechSynthesisEvent) => void) | null = null
    onboundary: ((e: SpeechSynthesisEvent) => void) | null = null
    constructor(text: string) { this.text = text }
  } as unknown as typeof SpeechSynthesisUtterance

  try {
    await run(spoken)
  } finally {
    globalThis.speechSynthesis = originalSpeechSynthesis
    globalThis.SpeechSynthesisUtterance = originalUtterance
  }
}

const makeStorage = (): Storage => {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => { store.delete(key) },
    setItem: (key: string, value: string) => { store.set(key, value) },
  }
}

beforeEach(() => {
  if (!globalThis.localStorage || typeof globalThis.localStorage.clear !== 'function') {
    Object.defineProperty(globalThis, 'localStorage', {
      value: makeStorage(),
      configurable: true,
    })
  }
  localStorage.clear()
})

describe('landing catalogue migration', () => {
  const previousCount = LANDING_GAME_COUNT - 1
  const previousOrder = Array.from({ length: previousCount }, (_, index) => index).reverse()
  const previousHidden = Array.from({ length: previousCount }, (_, index) => index === 2 || index === 6)
  const migratedOrder = [...previousOrder, previousCount]
  const migratedHidden = [...previousHidden, false]
  const malformedOrders = [
    { label: 'duplicate', order: previousOrder.map((index, position) => position === 0 ? 0 : index) },
    { label: 'gap', order: previousOrder.filter(index => index !== 2) },
  ]

  it('loads a historical reversed order and visibility without changing existing game indices', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      language: 'fr',
      landingOrder: previousOrder,
      landingHiddenGames: previousHidden,
    }))
    const [loaded, commands] = Main.init()

    expect(loaded.language).toBe('fr')
    expect(loaded.landingOrder).toEqual(migratedOrder)
    expect(loaded.landingHiddenGames).toEqual(migratedHidden)
    expect(loaded.landingHiddenGames[previousCount]).toBe(false)
    expect(LANDING_GAMES[2]?.title).toBe('bubblesTitle')
    expect(LANDING_GAMES[previousCount - 1]?.title).toBe('bubbles3dTitle')
    expect(LANDING_GAMES[previousCount]?.title).toBe('handwritingTitle')
    expect(commands).toHaveLength(0)
  })

  it('imports, persists, exports and reimports the old catalogue order with the new game appended', async () => {
    const legacyExport = JSON.stringify({
      version: 1,
      settings: { language: 'ja', landingOrder: previousOrder, landingHiddenGames: previousHidden },
    })
    const [imported, commands] = Main.update(createModel(), ImportedSettings({ data: legacyExport }))
    expect(imported.language).toBe('ja')
    expect(imported.landingOrder).toEqual(migratedOrder)
    expect(imported.landingHiddenGames).toEqual(migratedHidden)
    expect(commands.map(command => command.name)).toEqual(['PersistSettings'])
    const command = commands[0]
    if (!command) throw new Error('missing PersistSettings command')
    expect(await Effect.runPromise(command.effect)).toEqual(SettingsPersisted())
    const [loaded] = Main.init()
    expect(loaded.landingOrder).toEqual(migratedOrder)
    expect(loaded.landingHiddenGames).toEqual(migratedHidden)

    const [exported, exportCommands] = Main.update(imported, ExportSettings())
    const data = JSON.parse(exported.exportData) as { version: number; settings: { landingOrder: number[]; landingHiddenGames: boolean[] } }
    expect(data.version).toBe(1)
    expect(data.settings.landingOrder).toEqual(migratedOrder)
    expect(data.settings.landingHiddenGames).toEqual(migratedHidden)
    expect(exportCommands).toHaveLength(0)
    Story.story(
      Main.update,
      Story.with(createModel()),
      Story.message(ImportedSettings({ data: exported.exportData })),
      Story.model(model => {
        expect(model.language).toBe('ja')
        expect(model.landingOrder).toEqual(migratedOrder)
        expect(model.landingHiddenGames).toEqual(migratedHidden)
      }),
      Story.Command.resolveAll(resolveSettings),
      Story.Command.expectNone(),
    )
  })

  it.each(malformedOrders)('falls back to the default order for a saved $label', ({ order }) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ landingOrder: order }))
    const [loaded] = Main.init()
    expect(loaded.landingOrder).toEqual(Array.from({ length: LANDING_GAME_COUNT }, (_, index) => index))
  })

  it.each(malformedOrders)('rejects an imported $label without partially changing settings', ({ order }) => {
    const base = { ...createModel(), language: 'ja' as const, muted: true, landingOrder: migratedOrder, landingHiddenGames: migratedHidden }
    Story.story(
      Main.update,
      Story.with(base),
      Story.message(ImportedSettings({ data: JSON.stringify({
        version: 1,
        settings: { language: 'fr', muted: false, landingOrder: order, landingHiddenGames: previousHidden.map(() => false) },
      }) })),
      Story.model(model => {
        expect(model.language).toBe('ja')
        expect(model.muted).toBe(true)
        expect(model.landingOrder).toEqual(base.landingOrder)
        expect(model.landingHiddenGames).toEqual(base.landingHiddenGames)
        expect(model.importExportMessage).toBeTruthy()
      }),
      Story.Command.expectNone(),
    )
  })
})

describe('settings persistence', () => {
  const settingsMessages: Array<{ label: string; msg: Main.Message; resolves?: ReadonlyArray<readonly [{ readonly name: string }, Main.Message]> }> = [
    { label: 'ClickedDarkMode', msg: ClickedDarkMode() },
    { label: 'SetLanguage', msg: SetLanguage({ value: 'fr' }) },
    { label: 'ToggleMute', msg: ToggleMute() },
    { label: 'SetSpeechRate', msg: SetSpeechRate({ value: 1.2 }) },
    { label: 'SetSpeechPitch', msg: SetSpeechPitch({ value: 0.9 }) },
    { label: 'CounterSetDisplayMode', msg: Counter.SetDisplayMode({ value: 'both' }) },
    { label: 'FindItSetAnyWins', msg: FindIt.SetAnyWins({ value: true }) },
    { label: 'FindItSetVoiceMode', msg: FindIt.SetVoiceMode({ value: true }) },
    { label: 'FindItSetPairsMode', msg: FindIt.SetPairsMode({ value: true }) },
    { label: 'FindItSetEmojiPackEnabled', msg: FindIt.SetEmojiPackEnabled({ key: 'numbers', value: false }) },
    { label: 'BubblesSetSayColor', msg: Bubbles.SetSayColor({ value: true }) },
    { label: 'BubblesSetShapeMode', msg: Bubbles.SetShapeMode({ value: true }) },
    { label: 'DrawSetTopN', msg: Draw.SetTopN({ value: 7 }) },
    { label: 'DrawSetRecognitionMode', msg: Draw.SetRecognitionMode({ value: 'template' }) },
    { label: 'DrawSetTargetOrderMode', msg: Draw.SetTargetOrderMode({ value: 'ordered' }) },
    { label: 'DrawSetFreeMode', msg: Draw.SetFreeMode({ value: true }) },
    { label: 'DrawSetIncludeSingle', msg: Draw.SetIncludeSingle({ value: false }) },
    { label: 'DrawSetIncludePairs', msg: Draw.SetIncludePairs({ value: false }) },
    { label: 'DrawSetIncludeNumbers', msg: Draw.SetIncludeNumbers({ value: false }) },
    { label: 'DrawSetIncludeLetters', msg: Draw.SetIncludeLetters({ value: false }) },
    {
      label: 'MemorySetEmojiPackEnabled',
      msg: Memory.SetEmojiPackEnabled({ key: 'numbers', value: false }),
      resolves: [
        [{ name: 'MemoryOpeningReveal' }, Memory.BeginClosing({ token: 1 })],
        [{ name: 'MemoryOpeningFlip' }, Memory.PreviewFinished({ token: 1 })],
      ],
    },
    { label: 'RpsSetGigaChad', msg: Rps.SetGigaChad({ value: true }) },
    { label: 'MagneticBlocksSetBreakSpeed', msg: MagneticBlocks.SetBreakSpeed({ value: 875 }) },
    { label: 'TalkingKeyboardSetWordPackEnabled', msg: TalkingKeyboard.SetWordPackEnabled({ key: 'animals', value: false }) },
    { label: 'MusicBoxSetDrumVolume', msg: MusicBox.SetDrumVolume({ value: 0.35 }) },
    { label: 'MusicBoxToggleSongVisibility', msg: MusicBox.ToggleSongVisibility({ index: 1 }) },
    { label: 'MusicBoxSongDroppedOn', msg: MusicBox.SongDroppedOn({ index: 1 }) },
    { label: 'LandingSettingsDroppedOn', msg: LandingSettingsDroppedOn({ index: 1 }) },
    { label: 'LandingToggleGameVisibility', msg: LandingToggleGameVisibility({ index: 1 }) },
  ]

  const nonSettingsMessages: Array<{ label: string; msg: Main.Message; resolves?: ReadonlyArray<readonly [{ readonly name: string }, Main.Message]> }> = [
    { label: 'ClickedLanding', msg: ClickedLanding() },
    { label: 'ClickedCounter', msg: ClickedCounter() },
    { label: 'ClickedFindIt', msg: ClickedFindIt() },
    { label: 'ClickedBubbles', msg: ClickedBubbles() },
    { label: 'ClickedBubbles3d', msg: ClickedBubbles3d() },
    { label: 'Bubbles3dClickedPop', msg: Bubbles3d.ClickedPop({ id: 0, revision: 0 }) },
    { label: 'Bubbles3dCreatedBubble', msg: Bubbles3d.CreatedBubble({ shape: 'sphere', color: '#FF4757', duration: 0, revision: 0, creationId: 0 }), resolves: [resolveBubbles3dChime, resolveBubbles3dSpeak] },
    { label: 'Bubbles3dSelectedShape', msg: Bubbles3d.SelectedShape({ shape: 'cube' }) },
    { label: 'Bubbles3dNextShapePage', msg: Bubbles3d.NextShapePage() },
    { label: 'Bubbles3dClickedClear', msg: Bubbles3d.ClickedClear() },
    { label: 'Bubbles3dClearBubble', msg: Bubbles3d.ClearBubble({ id: 0, revision: 0, token: 0 }) },
    { label: 'Bubbles3dClearCompleted', msg: Bubbles3d.ClearCompleted({ revision: 0, token: 0 }) },
    { label: 'Bubbles3dRendererReady', msg: Bubbles3d.RendererReady({ revision: 0 }) },
    { label: 'Bubbles3dRendererFailed', msg: Bubbles3d.RendererFailed({ revision: 0 }) },
    { label: 'Bubbles3dSoundPlayed', msg: Bubbles3d.SoundPlayed() },
    { label: 'ClickedHandwriting', msg: ClickedHandwriting() },
    { label: 'HandwritingSetMode', msg: Handwriting.SetMode({ mode: 'words' }) },
    { label: 'HandwritingSetCase', msg: Handwriting.SetCase({ letterCase: 'lower' }) },
    { label: 'HandwritingSetStyle', msg: Handwriting.SetStyle({ style: 'cursive' }) },
    { label: 'HandwritingSelectedTarget', msg: Handwriting.SelectedTarget({ index: 1 }) },
    { label: 'HandwritingNextTarget', msg: Handwriting.NextTarget() },
    { label: 'HandwritingPreviousTarget', msg: Handwriting.PreviousTarget() },
    { label: 'HandwritingRestarted', msg: Handwriting.Restarted() },
    { label: 'HandwritingPenStarted', msg: Handwriting.PenStarted({ id: 0, x: 20, y: 120, revision: 0 }) },
    { label: 'HandwritingPenMoved', msg: Handwriting.PenMoved({ id: 0, points: [{ x: 25, y: 105 }], revision: 0 }) },
    { label: 'HandwritingPenEnded', msg: Handwriting.PenEnded({ id: 0, revision: 0 }) },
    { label: 'HandwritingPenCancelled', msg: Handwriting.PenCancelled({ id: 0, revision: 0 }) },
    { label: 'HandwritingKeyboardPressed', msg: Handwriting.KeyboardPressed({ key: 'ArrowUp', revision: 0 }) },
    { label: 'HandwritingKeyboardLifted', msg: Handwriting.KeyboardLifted({ revision: 0 }) },
    { label: 'HandwritingSoundPlayed', msg: Handwriting.SoundPlayed() },
    { label: 'ClickedMemory', msg: ClickedMemory() },
    { label: 'ClickedGrowingNumbers', msg: ClickedGrowingNumbers() },
    { label: 'ClickedShapeWorkshop', msg: ClickedShapeWorkshop() },
    {
      label: 'GrowingNumbersChooseGrowth',
      msg: GrowingNumbers.ChooseGrowth({ amount: 1 }),
    },
    {
      label: 'GrowingNumbersRevealNext',
      msg: GrowingNumbers.RevealNext(),
      resolves: [
        [{ name: 'GrowingNumbersScrollToNewest' }, GrowingNumbers.SequenceScrolled({ puzzleIndex: 0, revealedTermCount: 2 })],
        [{ name: 'Speak' }, GrowingNumbers.SoundPlayed()],
      ],
    },
    {
      label: 'ShapeWorkshopTapPiece',
      msg: ShapeWorkshop.TapPiece({ index: 0 }),
      resolves: [
        [{ name: 'ShapeWorkshopFlyPiece' }, ShapeWorkshop.PieceFlightFinished({ index: 0, token: 1 })],
        [{ name: 'PlayPop' }, ShapeWorkshop.SoundPlayed()],
        [{ name: 'Speak' }, ShapeWorkshop.SoundPlayed()],
      ],
    },
    { label: 'CounterPointerDown', msg: Counter.PointerDown({ timeStamp: 0, button: 'inc' }) },
    { label: 'CounterPressCancelled', msg: Counter.PressCancelled({ pointerId: 1 }) },
    { label: 'FindItClickedCell', msg: FindIt.ClickedCell({ id: 0 }) },
    { label: 'BubblesClickedPop', msg: Bubbles.ClickedPop({ id: 0 }) },
    { label: 'MemoryClickedCard', msg: Memory.ClickedCard({ id: 0 }) },
    { label: 'CounterSetTiltGravity', msg: Counter.SetTiltGravity({ value: true }) },
    { label: 'BubblesClickedColor', msg: Bubbles.ClickedColor({ color: 'rainbow', duration: 500 }), resolves: [resolveBubblesChime, resolveBubblesSpeak] },
    { label: 'BubblesSetRainbowMode', msg: Bubbles.SetRainbowMode({ value: true }) },
    { label: 'BubblesNextShapePage', msg: Bubbles.NextShapePage() },
    { label: 'MusicBoxNoteOn', msg: MusicBox.NoteOn({ pitch: 'C4' }) },
    { label: 'MusicBoxSetBottomPanelMode', msg: MusicBox.SetBottomPanelMode({ value: 'drums' }) },
    { label: 'MusicBoxDrumPadHit', msg: MusicBox.DrumPadHit({ kind: 'kick' }) },
    { label: 'MagneticBlocksSpawn', msg: MagneticBlocks.SpawnBlocks() },
    { label: 'MagneticBlocksRemove', msg: MagneticBlocks.RemoveBlock() },
    { label: 'TalkingKeyboardAskQuestion', msg: TalkingKeyboard.AskQuestion(), resolves: [[{ name: 'Speak' }, TalkingKeyboard.SoundPlayed()]] },
  ]

  it('keeps the persisted message tag list aligned with persistence tests', () => {
    expect(Main.PERSISTED_SETTINGS_MESSAGE_TAGS).toEqual(settingsMessages.map(({ msg }) => msg._tag))
  })

  for (const { label, msg, resolves } of settingsMessages) {
    it(`persists settings on ${label}`, () => {
      expect(Main.shouldPersistSettings(msg)).toBe(true)
      Story.story(
        Main.update,
        Story.with(createModel()),
        Story.message(msg),
        Story.Command.resolveAll(...(resolves ?? []), resolveSettings),
        Story.Command.expectNone(),
      )
    })
  }

  for (const { label, msg, resolves } of nonSettingsMessages) {
    it(`does not persist settings on ${label}`, () => {
      expect(Main.shouldPersistSettings(msg)).toBe(false)
      if (resolves) {
        Story.story(
          Main.update,
          Story.with(createModel()),
          Story.message(msg),
          Story.Command.resolveAll(...resolves),
          Story.Command.expectNone(),
        )
      } else {
        Story.story(
          Main.update,
          Story.with(createModel()),
          Story.message(msg),
          Story.Command.expectNone(),
        )
      }
    })
  }
})

describe('Main', () => {
  it('opens Handwriting, localizes its title, and keeps its learning modes transient', () => {
    for (const language of Object.keys(translations) as Array<keyof typeof translations>) {
      const [opened] = Main.update({ ...createModel(), language }, ClickedHandwriting())
      expect(opened.page._tag).toBe('PageHandwriting')
      expect(opened.handwriting).toEqual(Handwriting.init())
      expect(Main.view(opened).title).toBe(t('pageTitleHandwriting', language))
    }
    const [opened] = Main.update(createModel(), ClickedHandwriting())
    const [words] = Main.update(opened, Handwriting.SetMode({ mode: 'words' }))
    const [selected] = Main.update(words, Handwriting.SelectedTarget({ index: 1 }))
    const [exported, commands] = Main.update(selected, ExportSettings())
    expect(Handwriting.currentGuide(selected.handwriting).text).toBe('dog')
    expect(JSON.parse(exported.exportData).settings).not.toHaveProperty('handwriting')
    expect(commands).toEqual([])
  })

  it('delegates cursive and number practice while preserving selections across navigation and excluding them from saved settings', () => {
    let cursiveGuide: ReturnType<typeof Handwriting.currentGuide> | undefined
    Story.story(
      Main.update, Story.with({ ...createModel(), muted: true }),
      Story.message(ClickedHandwriting()),
      Story.message(Handwriting.SetCase({ letterCase: 'lower' })),
      Story.message(Handwriting.SetStyle({ style: 'cursive' })),
      Story.message(Handwriting.SelectedTarget({ index: 7 })),
      Story.model(model => {
        expect(model.handwriting).toMatchObject({ letterCase: 'lower', style: 'cursive', letterIndex: 7 })
        cursiveGuide = Handwriting.currentGuide(model.handwriting)
        expect(cursiveGuide.text).toBe('h')
      }),
      Story.message(Handwriting.SetMode({ mode: 'numbers' })),
      Story.message(Handwriting.SelectedTarget({ index: 9 })),
      Story.model(model => {
        expect(model.handwriting.numberIndex).toBe(9)
        expect(Handwriting.currentGuide(model.handwriting).text).toBe('9')
      }),
      Story.message(ClickedLanding()),
      Story.message(ClickedHandwriting()),
      Story.model(model => { expect(model.handwriting.mode).toBe('numbers'); expect(model.handwriting.numberIndex).toBe(9) }),
      Story.message(Handwriting.SetMode({ mode: 'letters' })),
      Story.model(model => {
        expect(model.handwriting).toMatchObject({ style: 'cursive', letterIndex: 7, numberIndex: 9 })
        expect(Handwriting.currentGuide(model.handwriting)).toBe(cursiveGuide)
      }),
      Story.message(ExportSettings()),
      Story.model(model => expect(JSON.parse(model.exportData).settings).not.toHaveProperty('handwriting')),
      Story.Command.expectNone(),
    )
  })

  it.each([false, true])('forwards root mute to handwriting completion without hiding the colored result: %s', muted => {
    const guide = Handwriting.currentGuide(Handwriting.init())
    Story.story(
      Main.update,
      Story.with({ ...createModel(), muted }),
      Story.message(ClickedHandwriting()),
      ...guide.strokes.flatMap((stroke, id) => [
        Story.message(Handwriting.PenStarted({ id, ...stroke[0]!, revision: 0 })),
        Story.message(Handwriting.PenMoved({ id, points: stroke.slice(1), revision: 0 })),
        Story.message(Handwriting.PenEnded({ id, revision: 0 })),
        id === guide.strokes.length - 1 && !muted
          ? Story.Command.resolveAll([{ name: 'HandwritingPlayChime' }, Handwriting.SoundPlayed()]) : Story.Command.expectNone(),
      ]),
      Story.model(model => {
        expect(Handwriting.isComplete(model.handwriting)).toBe(true)
        expect(model.handwriting.progress).toEqual(guide.strokes.map(stroke => stroke.length))
        expect(model.handwriting.celebrated).toBe(true)
      }),
      Story.Command.expectNone(),
    )
  })

  it('keeps partially traced writing on navigation and rejects events queued by the old board', () => {
    const initial = Handwriting.init()
    const stroke = Handwriting.currentGuide(initial).strokes[0]!
    let progress: ReadonlyArray<number> = []
    Story.story(
      Main.update,
      Story.with({ ...createModel(), muted: true }),
      Story.message(ClickedHandwriting()),
      Story.message(Handwriting.PenStarted({ id: 0, ...stroke[0]!, revision: 0 })),
      Story.message(Handwriting.PenMoved({ id: 0, points: stroke.slice(1, 8), revision: 0 })),
      Story.model(model => { progress = model.handwriting.progress; expect(progress[0]).toBeGreaterThan(0) }),
      Story.message(ClickedLanding()),
      Story.message(Handwriting.PenMoved({ id: 0, points: stroke.slice(8), revision: 0 })),
      Story.message(Handwriting.PenStarted({ id: 1, ...stroke[8]!, revision: 1 })),
      Story.message(Handwriting.KeyboardPressed({ key: 'ArrowUp', revision: 1 })),
      Story.message(ClickedHandwriting()),
      Story.message(Handwriting.PenMoved({ id: 0, points: stroke.slice(8), revision: 0 })),
      Story.message(Handwriting.PenEnded({ id: 0, revision: 0 })),
      Story.message(Handwriting.KeyboardPressed({ key: 'ArrowUp', revision: 0 })),
      Story.model(model => {
        expect(model.handwriting.progress).toBe(progress)
        expect(model.handwriting).toMatchObject({ revision: 1, contacts: [], pen: null })
      }),
      Story.Command.expectNone(),
    )
  })

  it('init returns correct initial state', () => {
    const [model] = Main.init()
    expect(model.page._tag).toBe('PageLanding')
    expect(model.darkMode).toBe('auto')
    expect(model.language).toBe('en')
    expect(model.showSettings).toBe(false)
    expect(model.speechRate).toBe(0.85)
    expect(model.speechPitch).toBe(1.1)
    expect(model.counter.count).toBe(0)
    expect(model.findIt.enabledPacks).toEqual(FindIt.DEFAULT_EMOJI_PACK_KEYS)
    expect(model.talkingKeyboard.enabledPacks).toEqual(TalkingKeyboard.DEFAULT_WORD_PACK_KEYS)
    expect(model.bubbles).toStrictEqual({ bubbles: [], score: 0, nextId: 0, rainbowMode: false, sayColor: false, selectedColor: '', shapeMode: false, selectedShape: 'circle', shapePage: 0 })
    expect(model.growingNumbers).toStrictEqual(GrowingNumbers.init)
    expect(model.shapeWorkshop).toStrictEqual(ShapeWorkshop.init)
  })

  it('init loads persisted Find It emoji packs', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ findItEnabledPacks: ['numbers'] }))
    const [model] = Main.init()
    const numbers = new Set(FindIt.emojiPoolForPacks(['numbers']))

    expect(model.findIt.enabledPacks).toEqual(['numbers'])
    expect(model.findIt.grid.every(cell => numbers.has(cell.emoji))).toBe(true)
  })

  it('init loads persisted Talking Keyboard word packs', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ talkingKeyboardEnabledPacks: ['food', 'animals'] }))
    const [model] = Main.init()

    expect(model.talkingKeyboard.enabledPacks).toEqual(['food', 'animals'])
    expect(TalkingKeyboard.wordsFor('B', model.talkingKeyboard.enabledPacks).every(({ word }) =>
      ['food', 'animals'].includes(TalkingKeyboard.wordPackFor(word)),
    )).toBe(true)
  })

  it('init safely ignores legacy Bubbles selected color and pop-label settings', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      bubblesSelectedColor: 'rainbow',
      bubblesPopLabel: true,
    }))

    const [model] = Main.init()

    expect(model.bubbles.selectedColor).toBe('')
    expect(model.bubbles.rainbowMode).toBe(false)
    expect(model.bubbles).not.toHaveProperty('popLabel')
  })

  it('uses global speech settings for Counter speech commands', async () => {
    await withSpeechMock(async (spoken) => {
      const [_, cmds] = Main.update(
        { ...createModel(), speechRate: 1.7, speechPitch: 0.6 },
        Counter.PressedIncrement({ duration: 0 }),
      )
      const speakCmd = cmds.find(cmd => cmd.name === 'Speak')
      if (!speakCmd) throw new Error('missing Speak command')

      await Effect.runPromise(speakCmd.effect)

      expect(spoken).toEqual([{ text: 'one', rate: 1.7, pitch: 0.6, lang: 'en' }])
    })
  })

  it('uses global speech settings for Find It speech commands', async () => {
    await withSpeechMock(async (spoken) => {
      const findIt = {
        ...FindIt.init(false, ['fun']),
        grid: [{ id: 0, emoji: '🎈' }],
        target: '🎈',
      }
      const [_, cmds] = Main.update(
        { ...createModel(), speechRate: 1.4, speechPitch: 1.8, findIt },
        FindIt.ClickedCell({ id: 0 }),
      )
      const speakCmd = cmds.find(cmd => cmd.name === 'Speak')
      if (!speakCmd) throw new Error('missing Speak command')

      await Effect.runPromise(speakCmd.effect)

      expect(spoken).toEqual([{ text: 'Balloon', rate: 1.4, pitch: 1.8, lang: 'en' }])
    })
  })

  describe('schema boundaries', () => {
    const decodeMessage = S.decodeUnknownOption(Main.Message)
    const decodeModel = S.decodeUnknownOption(Main.Model)

    it('decodes supported language messages at the Foldkit message boundary', () => {
      const decoded = decodeMessage({ _tag: 'SetLanguage', value: 'zh-HK' })

      expect(Option.isSome(decoded)).toBe(true)
      if (Option.isSome(decoded)) {
        expect(decoded.value).toStrictEqual(SetLanguage({ value: 'zh-HK' }))
      }
    })

    it('rejects unsupported language messages before update can persist them', () => {
      const decoded = decodeMessage({ _tag: 'SetLanguage', value: 'xx' })

      expect(Option.isNone(decoded)).toBe(true)
    })

    it('keeps the app model schema honest about language and nested game state', () => {
      expect(Option.isSome(decodeModel(createModel()))).toBe(true)
      expect(Option.isNone(decodeModel({ ...createModel(), language: 'xx' }))).toBe(true)
      expect(Option.isNone(decodeModel({
        ...createModel(),
        counter: { ...createModel().counter, displayMode: 'huge' },
      }))).toBe(true)
    })

    it('falls back to defaults when persisted settings fail schema decoding', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        language: 'xx',
        darkMode: 'dark',
        muted: true,
      }))

      const [model, cmds] = Main.init()

      expect(model.language).toBe('en')
      expect(model.darkMode).toBe('auto')
      expect(model.muted).toBe(false)
      expect(cmds).toHaveLength(0)
    })
  })

  it('ClickedLanding sets page to landing', () => {
    Story.story(
      Main.update,
      Story.with({
        ...createModel(),
      }),
      Story.message(ClickedLanding()),
      Story.model((model) => {
        expect(model.page._tag).toBe('PageLanding')
      }),
      Story.Command.expectNone(),
    )
  })

  it('ClickedCounter sets page to counter', () => {
    Story.story(
      Main.update,
      Story.with(createModel()),
      Story.message(ClickedCounter()),
      Story.model((model) => {
        expect(model.page._tag).toBe('PageCounter')
      }),
      Story.Command.expectNone(),
    )
  })

  it('ClickedBubbles3d opens the 3D bubbles page', () => {
    Story.story(
      Main.update,
      Story.with(createModel()),
      Story.message(ClickedBubbles3d()),
      Story.model(model => {
        expect(model.page._tag).toBe('PageBubbles3d')
        expect(model.bubbles3d).toMatchObject({
          bubbles: [], score: 0, nextId: 0, revision: 0, selectedShape: 'sphere', shapePage: 0, selectedColor: '', lastCreation: null, lastCreationId: -1,
        })
      }),
      Story.Command.expectNone(),
    )
  })

  it.each([false, true])('forwards the root mute setting to 3D creation and popping: %s', muted => {
    Story.story(
      Main.update,
      Story.with({ ...createModel(), muted }),
      Story.message(ClickedBubbles3d()),
      Story.message(Bubbles3d.CreatedBubble({ shape: 'sphere', color: '#FF4757', duration: 500, revision: 0, creationId: 0 })),
      Story.model(model => {
        expect(model.bubbles3d.bubbles).toEqual([Bubbles3d.makeBubble(0, 'sphere', '#FF4757', 500)])
        expect(model.bubbles3d.nextId).toBe(1)
      }),
      muted ? Story.Command.expectNone() : Story.Command.resolveAll(resolveBubbles3dChime, resolveBubbles3dSpeak),
      Story.message(Bubbles3d.ClickedPop({ id: 0, revision: 0 })),
      Story.model(model => {
        expect(model.bubbles3d.score).toBe(1)
        expect(model.bubbles3d.bubbles).toEqual([])
      }),
      muted ? Story.Command.expectNone() : Story.Command.resolveAll([{ name: 'Bubbles3dPlayPop' }, Bubbles3d.SoundPlayed()]),
      Story.Command.expectNone(),
    )
  })

  it('forwards root language, rate, and pitch to 3D creation speech', async () => {
    await withSpeechMock(async spoken => {
      const [created, commands] = Main.update(
        { ...createModel(), language: 'fr', speechRate: 1.6, speechPitch: 0.65 },
        Bubbles3d.CreatedBubble({ shape: 'cube', color: '#FF4757', duration: 1200, revision: 0, creationId: 0 }),
      )
      expect(commands.map(command => command.name)).toEqual(['Bubbles3dPlayChime', 'Bubbles3dSpeakCreation'])
      for (const command of commands) {
        const result = await Effect.runPromise(command.effect)
        expect(result).toEqual(Bubbles3d.SoundPlayed())
        expect(Main.update(created, result)).toEqual([created, []])
      }
      expect(spoken).toEqual([{ text: 'cube rouge', rate: 1.6, pitch: 0.65, lang: 'fr' }])
    })
  })

  it('delegates shape selection, page changes and clear while rejecting stale creations and pops', () => {
    Story.story(
      Main.update,
      Story.with({ ...createModel(), muted: true }),
      Story.message(ClickedBubbles3d()),
      Story.message(Bubbles3d.SelectedShape({ shape: 'cube' })),
      Story.message(Bubbles3d.NextShapePage()),
      Story.message(Bubbles3d.CreatedBubble({ shape: 'heart', color: 'rainbow', duration: 2200, revision: 0, creationId: 0 })),
      Story.model(model => {
        expect(model.bubbles3d.selectedShape).toBe('cube')
        expect(model.bubbles3d.shapePage).toBe(1)
        expect(model.bubbles3d.selectedColor).toBe('rainbow')
        expect(model.bubbles3d.bubbles).toEqual([Bubbles3d.makeBubble(0, 'heart', 'rainbow', 2200)])
      }),
      Story.message(Bubbles3d.ClickedPop({ id: 0, revision: 0 })),
      Story.message(Bubbles3d.CreatedBubble({ shape: 'cube', color: '#1E90FF', duration: 600, revision: 0, creationId: 1 })),
      Story.message(Bubbles3d.ClickedClear()),
      Story.model(model => {
        expect(model.bubbles3d.clearing).toBe(true)
        expect(model.bubbles3d.bubbles.map(bubble => bubble.id)).toEqual([1])
        expect(model.bubbles3d.revision).toBe(0)
        expect(model.bubbles3d.clearToken).toBe(1)
      }),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 0, token: 1 })),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 1 })),
      Story.model(model => {
        expect(model.bubbles3d.bubbles).toEqual([])
        expect(model.bubbles3d.score).toBe(0)
        expect(model.bubbles3d.revision).toBe(1)
        expect(model.bubbles3d.nextId).toBe(2)
        expect(model.bubbles3d.lastCreationId).toBe(1)
      }),
      Story.message(Bubbles3d.ClickedPop({ id: 1, revision: 0 })),
      Story.message(Bubbles3d.CreatedBubble({ shape: 'sphere', color: '#FF4757', duration: 800, revision: 0, creationId: 2 })),
      Story.model(model => { expect(model.bubbles3d.bubbles).toEqual([]) }),
      Story.message(Bubbles3d.CreatedBubble({ shape: 'sphere', color: '#FF4757', duration: 800, revision: 1, creationId: 2 })),
      Story.message(Bubbles3d.CreatedBubble({ shape: 'sphere', color: '#FF4757', duration: 800, revision: 1, creationId: 2 })),
      Story.model(model => {
        expect(model.bubbles3d.score).toBe(0)
        expect(model.bubbles3d.bubbles).toEqual([Bubbles3d.makeBubble(2, 'sphere', '#FF4757', 800)])
        expect(model.bubbles3d.nextId).toBe(3)
      }),
      Story.Command.expectNone(),
    )
  })

  it.each([false, true])('delegates sequential 3D clearing with the root mute setting: %s', muted => {
    Story.story(
      Main.update,
      Story.with({ ...createModel(), muted }),
      Story.message(ClickedBubbles3d()),
      Story.message(Bubbles3d.CreatedBubble({ shape: 'hemisphere', color: '#FF4757', duration: 500, revision: 0, creationId: 0 })),
      muted ? Story.Command.expectNone() : Story.Command.resolveAll(resolveBubbles3dChime, resolveBubbles3dSpeak),
      Story.message(Bubbles3d.CreatedBubble({ shape: 'egg', color: '#1E90FF', duration: 700, revision: 0, creationId: 1 })),
      muted ? Story.Command.expectNone() : Story.Command.resolveAll(resolveBubbles3dChime, resolveBubbles3dSpeak),
      Story.message(Bubbles3d.ClickedClear()),
      Story.message(Bubbles3d.ClearBubble({ id: 0, revision: 0, token: 1 })),
      Story.model(model => {
        expect(model.bubbles3d.bubbles.map(bubble => bubble.id)).toEqual([1])
        expect(model.bubbles3d).toMatchObject({ clearing: true, score: 0, revision: 0 })
      }),
      muted ? Story.Command.expectNone() : Story.Command.resolveAll([{ name: 'Bubbles3dPlayPop' }, Bubbles3d.SoundPlayed()]),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 0, token: 1 })),
      muted ? Story.Command.expectNone() : Story.Command.resolveAll([{ name: 'Bubbles3dPlayPop' }, Bubbles3d.SoundPlayed()]),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 1 })),
      Story.model(model => {
        expect(model.bubbles3d).toMatchObject({ bubbles: [], clearing: false, score: 0, revision: 1, clearToken: 1, nextId: 2 })
      }),
      Story.Command.expectNone(),
    )
  })

  it('preserves a partially cleared 3D round when navigating away and back', () => {
    let previous: Bubbles3d.Model | undefined
    Story.story(
      Main.update,
      Story.with({ ...createModel(), muted: true }),
      Story.message(ClickedBubbles3d()),
      Story.message(Bubbles3d.CreatedBubble({ shape: 'hemisphere', color: '#FF4757', duration: 500, revision: 0, creationId: 0 })),
      Story.message(Bubbles3d.CreatedBubble({ shape: 'egg', color: '#1E90FF', duration: 700, revision: 0, creationId: 1 })),
      Story.message(Bubbles3d.ClickedClear()),
      Story.message(Bubbles3d.ClearBubble({ id: 0, revision: 0, token: 1 })),
      Story.message(ClickedLanding()),
      Story.model(model => {
        previous = model.bubbles3d
        expect(model.bubbles3d.clearToken).toBe(2)
      }),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 0, token: 1 })),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 0, token: 2 })),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 1 })),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 2 })),
      Story.model(model => { expect(model.bubbles3d).toBe(previous) }),
      Story.message(ClickedBubbles3d()),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 0, token: 1 })),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 1 })),
      Story.model(model => {
        expect(model.bubbles3d).toBe(previous)
        expect(model.bubbles3d).toMatchObject({ clearing: true, clearToken: 2, revision: 0 })
        expect(model.bubbles3d.bubbles.map(bubble => bubble.id)).toEqual([1])
      }),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 0, token: 2 })),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 2 })),
      Story.model(model => { expect(model.bubbles3d).toMatchObject({ clearing: false, bubbles: [], revision: 1 }) }),
      Story.Command.expectNone(),
    )
  })

  it('preserves 3D bubble state when navigating away and back', () => {
    let previous: Bubbles3d.Model | undefined
    Story.story(
      Main.update,
      Story.with({ ...createModel(), muted: true }),
      Story.message(ClickedBubbles3d()),
      Story.message(Bubbles3d.SelectedShape({ shape: 'heart' })),
      Story.message(Bubbles3d.NextShapePage()),
      Story.message(Bubbles3d.CreatedBubble({ shape: 'sphere', color: '#FF4757', duration: 0, revision: 0, creationId: 0 })),
      Story.message(Bubbles3d.CreatedBubble({ shape: 'heart', color: '#FF69B4', duration: 1500, revision: 0, creationId: 1 })),
      Story.message(Bubbles3d.ClickedPop({ id: 0, revision: 0 })),
      Story.model(model => { previous = model.bubbles3d }),
      Story.message(ClickedLanding()),
      Story.model(model => {
        expect(model.page._tag).toBe('PageLanding')
        expect(model.bubbles3d).toBe(previous)
      }),
      Story.message(ClickedBubbles3d()),
      Story.model(model => {
        expect(model.page._tag).toBe('PageBubbles3d')
        expect(model.bubbles3d).toBe(previous)
        expect(model.bubbles3d.score).toBe(1)
      }),
      Story.Command.expectNone(),
    )
  })

  it('delegates Counter cancellation without completing other held buttons', () => {
    Story.story(
      Main.update,
      Story.with(createModel()),
      Story.message(ClickedCounter()),
      Story.message(Counter.PointerDown({ pointerId: 7, timeStamp: 100, button: 'inc' })),
      Story.message(Counter.PointerDown({ pointerId: 8, timeStamp: 200, button: 'dec' })),
      Story.message(Counter.PressCancelled({ pointerId: 7 })),
      Story.model(model => {
        expect(model.counter.presses).toEqual([{ pointerId: 8, timeStamp: 200, button: 'dec' }])
        expect(model.counter.holding).toBe(true)
        expect(model.counter.pressedButton).toBe('dec')
        expect(model.counter.count).toBe(0)
      }),
      Story.Command.expectNone(),
      Story.message(Counter.PressCancelled({ pointerId: 8 })),
      Story.model(model => {
        expect(model.counter.presses).toEqual([])
        expect(model.counter.holding).toBe(false)
        expect(model.counter.pressedButton).toBeNull()
        expect(model.counter.count).toBe(0)
      }),
      Story.Command.expectNone(),
    )
  })

  it.each([
    { destination: 'landing', message: ClickedLanding(), page: 'PageLanding' },
    { destination: 'Find It', message: ClickedFindIt(), page: 'PageFindIt' },
    { destination: 'Bubbles', message: ClickedBubbles(), page: 'PageBubbles' },
    { destination: '3D Bubbles', message: ClickedBubbles3d(), page: 'PageBubbles3d' },
    { destination: 'Memory', message: ClickedMemory(), page: 'PageMemory' },
    { destination: 'Magnetic Blocks', message: ClickedMagneticBlocks(), page: 'PageMagneticBlocks' },
    { destination: 'Talking Keyboard', message: ClickedTalkingKeyboard(), page: 'PageTalkingKeyboard' },
    { destination: 'Growing Numbers', message: ClickedGrowingNumbers(), page: 'PageGrowingNumbers' },
    { destination: 'Shape Workshop', message: ClickedShapeWorkshop(), page: 'PageShapeWorkshop' },
  ])('clears Counter holds when navigating to $destination and ignores their late releases', ({ message, page }) => {
    const base = createModel()
    Story.story(
      Main.update,
      Story.with({ ...base, counter: { ...base.counter, count: 42, fontSize: 8, displayMode: 'word' as const, tiltGravity: true } }),
      Story.message(ClickedCounter()),
      Story.message(Counter.PointerDown({ pointerId: 7, timeStamp: 100, button: 'inc' })),
      Story.message(Counter.PointerDown({ pointerId: 8, timeStamp: 200, button: 'dec' })),
      Story.message(message),
      Story.model(model => {
        expect(model.page._tag).toBe(page)
        expect(model.counter).toEqual({ ...base.counter, count: 42, fontSize: 8, displayMode: 'word', tiltGravity: true })
      }),
      Story.Command.expectNone(),
      Story.message(Counter.PressedIncrement({ pointerId: 7, button: 'inc', duration: 500 })),
      Story.message(Counter.PressedDecrement({ pointerId: 8, button: 'dec', duration: 700 })),
      Story.model(model => {
        expect(model.counter.count).toBe(42)
        expect(model.counter.fontSize).toBe(8)
        expect(model.counter.presses).toEqual([])
      }),
      Story.Command.expectNone(),
      Story.message(ClickedCounter()),
      Story.model(model => {
        expect(model.page._tag).toBe('PageCounter')
        expect(model.counter.holding).toBe(false)
        expect(model.counter.pressedButton).toBeNull()
        expect(model.counter.presses).toEqual([])
      }),
      Story.Command.expectNone(),
    )
  })

  it('keeps concurrent landing and settings reorder gestures from stealing each other', () => {
    const base = createModel()
    Story.story(
      Main.update,
      Story.with({ ...base, showSettings: true }),
      Story.message(LandingDragStarted({ index: 0 })),
      Story.message(LandingSettingsDragStarted({ index: 2 })),
      Story.message(LandingSettingsDroppedOn({ index: 1 })),
      Story.Command.resolveAll(resolveSettings),
      Story.message(LandingSettingsDragEnded()),
      Story.model(model => {
        expect(model.landingOrder).toEqual(base.landingOrder)
        expect(model.landingDragIndex).toBe(0)
        expect(model.landingDragSource).toBe('landing')
      }),
      Story.message(LandingDroppedOn({ index: 1 })),
      Story.Command.resolveAll(resolveSettings),
      Story.model(model => {
        expect(model.landingOrder.slice(0, 2)).toEqual([1, 0])
        expect(model.landingDragSource).toBeNull()
      }),
      Story.message(LandingSettingsDragStarted({ index: 0 })),
      Story.message(LandingDragStarted({ index: 2 })),
      Story.message(LandingDroppedOn({ index: 1 })),
      Story.message(LandingDragEnded()),
      Story.model(model => {
        expect(model.landingOrder.slice(0, 2)).toEqual([1, 0])
        expect(model.landingDragIndex).toBe(0)
        expect(model.landingDragSource).toBe('settings')
      }),
      Story.message(LandingSettingsDragEnded()),
      Story.Command.expectNone(),
    )
  })

  it.each([ClickedFindIt(), ClickedSettings()])('clears reorders on navigation or settings close and rejects late drops ($_tag)', message => {
    const base = createModel()
    Story.story(
      Main.update,
      Story.with({ ...base, showSettings: true }),
      Story.message(LandingSettingsDragStarted({ index: 0 })),
      Story.message(MusicBox.SongDragStarted({ index: 0 })),
      Story.message(message),
      Story.model(model => {
        expect(model.landingDragIndex).toBe(-1)
        expect(model.landingDragSource).toBeNull()
        expect(model.musicBox.dragIndex).toBe(-1)
      }),
      Story.message(LandingSettingsDroppedOn({ index: 1 })),
      Story.Command.resolveAll(resolveSettings),
      Story.message(MusicBox.SongDroppedOn({ index: 1 })),
      Story.Command.resolveAll(resolveSettings),
      Story.model(model => {
        expect(model.landingOrder).toEqual(base.landingOrder)
        expect(model.musicBox.songOrder).toEqual(base.musicBox.songOrder)
      }),
      Story.Command.expectNone(),
    )
  })

  it('rejects malformed reorder starts and targets', () => {
    const base = createModel()
    for (const index of [-1, 0.5, NaN, Infinity, LANDING_GAME_COUNT]) {
      expect(Main.update(base, LandingDragStarted({ index }))).toEqual([base, []])
      expect(Main.update(base, LandingSettingsDragStarted({ index }))).toEqual([base, []])
    }
    Story.story(
      Main.update,
      Story.with(base),
      Story.message(LandingSettingsDragStarted({ index: 0 })),
      Story.message(LandingSettingsDroppedOn({ index: -1 })),
      Story.Command.resolveAll(resolveSettings),
      Story.model(model => {
        expect(model.landingOrder).toEqual(base.landingOrder)
        expect(model.landingDragSource).toBeNull()
      }),
      Story.Command.expectNone(),
    )
  })

  it('ClickedFindIt sets page to find it', () => {
    Story.story(
      Main.update,
      Story.with(createModel()),
      Story.message(ClickedFindIt()),
      Story.model((model) => {
        expect(model.page._tag).toBe('PageFindIt')
      }),
      Story.Command.expectNone(),
    )
  })

  it('opens both visual geometry games', () => {
    const [growingNumbers] = Main.update(createModel(), ClickedGrowingNumbers())
    const [shapeWorkshop] = Main.update(createModel(), ClickedShapeWorkshop())

    expect(growingNumbers.page._tag).toBe('PageGrowingNumbers')
    expect(shapeWorkshop.page._tag).toBe('PageShapeWorkshop')
  })

  it('delegates both visual geometry game messages', () => {
    const base = createModel()
    const [growingNumbers] = Main.update({ ...base, growingNumbers: { ...base.growingNumbers, mode: 'quiz' } }, GrowingNumbers.ChooseGrowth({ amount: 1 }))
    const [shapeWorkshopFlying] = Main.update(createModel(), ShapeWorkshop.TapPiece({ index: 0 }))
    const [shapeWorkshop] = Main.update(shapeWorkshopFlying, ShapeWorkshop.PieceFlightFinished({ index: 0, token: 1 }))

    expect(growingNumbers.growingNumbers.status).toBe('correct')
    expect(shapeWorkshop.shapeWorkshop.placedPieceIds).toEqual([0])
  })

  it('toggles landing game visibility while keeping at least one game visible', () => {
    const base = createModel()
    const hiddenExceptCounter = base.landingOrder.map(index => index !== 0)
    const [hidden] = Main.update(base, LandingToggleGameVisibility({ index: 1 }))
    const [unchanged] = Main.update(
      { ...base, landingHiddenGames: hiddenExceptCounter },
      LandingToggleGameVisibility({ index: 0 }),
    )

    expect(hidden.landingHiddenGames[1]).toBe(true)
    expect(unchanged.landingHiddenGames).toEqual(hiddenExceptCounter)
  })

  it('hides Phoneme Garden by default while keeping it available in settings', () => {
    const model = createModel()
    const phonemeGardenIndex = LANDING_GAMES.findIndex(game => game.title === 'phonemeGardenTitle')

    expect(phonemeGardenIndex).toBeGreaterThanOrEqual(0)
    expect(model.landingHiddenGames[phonemeGardenIndex]).toBe(true)
    expect(model.landingOrder).toContain(phonemeGardenIndex)
  })

  it('reorders all landing games from settings', () => {
    const [dragging] = Main.update(createModel(), LandingSettingsDragStarted({ index: 0 }))
    const [dropped] = Main.update(dragging, LandingSettingsDroppedOn({ index: 2 }))

    expect(dropped.landingOrder).toEqual([1, 2, 0, ...Array.from({ length: LANDING_GAME_COUNT - 3 }, (_, i) => i + 3)])
    expect(dropped.landingDragIndex).toBe(-1)
  })

  it('reorders only visible landing games from the landing page', () => {
    const base = { ...createModel(), landingHiddenGames: Array.from({ length: LANDING_GAME_COUNT }, (_, index) => index === 1) }
    const [dragging] = Main.update(base, LandingDragStarted({ index: 0 }))
    const [dropped] = Main.update(dragging, LandingDroppedOn({ index: 1 }))

    expect(dropped.landingOrder).toEqual([1, 2, 0, ...Array.from({ length: LANDING_GAME_COUNT - 3 }, (_, i) => i + 3)])
    expect(dropped.landingHiddenGames[1]).toBe(true)
    expect(dropped.landingDragIndex).toBe(-1)
  })

  it('ClickedBubbles sets page to bubbles', () => {
    Story.story(
      Main.update,
      Story.with(createModel()),
      Story.message(ClickedBubbles()),
      Story.model((model) => {
        expect(model.page._tag).toBe('PageBubbles')
      }),
      Story.Command.expectNone(),
    )
  })

  it('ClickedMagneticBlocks opens Magnetic Blocks', () => {
    Story.story(
      Main.update,
      Story.with(createModel()),
      Story.message(ClickedMagneticBlocks()),
      Story.model((model) => {
        expect(model.page._tag).toBe('PageMagneticBlocks')
      }),
      Story.Command.expectNone(),
    )
  })

  it('ClickedTalkingKeyboard opens Talking Keyboard', () => {
    Story.story(
      Main.update,
      Story.with(createModel()),
      Story.message(ClickedTalkingKeyboard()),
      Story.model((model) => {
        expect(model.page._tag).toBe('PageTalkingKeyboard')
      }),
      Story.Command.expectNone(),
    )
  })

  it('dark mode cycles auto -> light -> dark -> auto', () => {
    const base = createModel()

    Story.story(
      Main.update,
      Story.with({ ...base, darkMode: 'auto' }),
      Story.message(ClickedDarkMode()),
      Story.model((model) => {
        expect(model.darkMode).toBe('light')
      }),
      Story.Command.resolveAll(resolveSettings),
      Story.Command.expectNone(),
    )

    Story.story(
      Main.update,
      Story.with({ ...base, darkMode: 'light' }),
      Story.message(ClickedDarkMode()),
      Story.model((model) => {
        expect(model.darkMode).toBe('dark')
      }),
      Story.Command.resolveAll(resolveSettings),
      Story.Command.expectNone(),
    )

    Story.story(
      Main.update,
      Story.with({ ...base, darkMode: 'dark' }),
      Story.message(ClickedDarkMode()),
      Story.model((model) => {
        expect(model.darkMode).toBe('auto')
      }),
      Story.Command.resolveAll(resolveSettings),
      Story.Command.expectNone(),
    )
  })

  describe('settings import', () => {
    it('filters out-of-bounds song indices', () => {
      const defaultOrder = MusicBox.SONGS.map((_, index) => index)
      Story.story(
        Main.update,
        Story.with(createModel()),
        Story.message(ImportedSettings({
          data: JSON.stringify({
            version: 1,
            settings: {
              language: 'en',
              musicBoxSongOrder: [0, 999, 1, -1],
              musicBoxHiddenSongs: [false, true],
            },
          }),
        })),
        Story.model((model) => {
          expect(model.musicBox.songOrder.slice(0, 2)).toEqual([0, 1])
          expect(model.musicBox.songOrder).toHaveLength(MusicBox.SONGS.length)
          expect(new Set(model.musicBox.songOrder).size).toBe(MusicBox.SONGS.length)
          expect(model.musicBox.songOrder.slice(2)).toEqual(defaultOrder.slice(2))
          expect(model.musicBox.hiddenSongs).toHaveLength(MusicBox.SONGS.length)
          expect(model.musicBox.hiddenSongs[1]).toBe(true)
        }),
        Story.Command.resolveAll(resolveSettings),
        Story.Command.expectNone(),
      )
    })

    it('rejects invalid persisted counter display modes at the schema boundary', () => {
      Story.story(
        Main.update,
        Story.with(createModel()),
        Story.message(ImportedSettings({
          data: JSON.stringify({
            version: 1,
            settings: {
              language: 'fr',
              counterDisplayMode: 'huge',
            },
          }),
        })),
        Story.model((model) => {
          expect(model.language).toBe('en')
          expect(model.counter.displayMode).toBe('number')
          expect(model.importExportMessage).toBeTruthy()
        }),
        Story.Command.expectNone(),
      )
    })

    it('rejects wrong version', () => {
      Story.story(
        Main.update,
        Story.with(createModel()),
        Story.message(ImportedSettings({
          data: JSON.stringify({
            version: 999,
            settings: { language: 'en' },
          }),
        })),
        Story.model((model) => {
          expect(model.importExportMessage).toBeTruthy()
        }),
        Story.Command.expectNone(),
      )
    })

    it('rejects malformed settings payloads with no persistence command', () => {
      Story.story(
        Main.update,
        Story.with(createModel()),
        Story.message(ImportedSettings({
          data: JSON.stringify({
            version: 1,
            settings: {
              language: 42,
            },
          }),
        })),
        Story.model((model) => {
          expect(model.importExportMessage).toBeTruthy()
        }),
        Story.Command.expectNone(),
      )
    })

    it('rejects unsupported language codes with no persistence command', () => {
      Story.story(
        Main.update,
        Story.with(createModel()),
        Story.message(ImportedSettings({
          data: JSON.stringify({
            version: 1,
            settings: {
              language: 'xx',
            },
          }),
        })),
        Story.model((model) => {
          expect(model.language).toBe('en')
          expect(model.importExportMessage).toBeTruthy()
        }),
        Story.Command.expectNone(),
      )
    })

    it('resolves PersistSettings command', () => {
      Story.story(
        Main.update,
        Story.with(createModel()),
        Story.message(ClickedDarkMode()),
        Story.model((model) => {
          expect(model.darkMode).toBe('light')
        }),
        Story.Command.resolveAll(resolveSettings),
        Story.Command.expectNone(),
      )
    })

    it('runs PersistSettings effect to write current settings', async () => {
      const [next, cmds] = Main.update(createModel(), ClickedDarkMode())
      const cmd = cmds[0]
      expect(cmd?.name).toBe('PersistSettings')
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

      if (!cmd) throw new Error('missing PersistSettings command')
      const result = await Effect.runPromise(cmd.effect)
      expect(result).toStrictEqual(SettingsPersisted())

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { darkMode?: string }
      expect(stored.darkMode).toBe(next.darkMode)
    })

    it('persists a schema-decoded language change through a command effect', async () => {
      const decodeMessage = S.decodeUnknownOption(Main.Message)
      const decoded = decodeMessage({ _tag: 'SetLanguage', value: 'ja' })
      if (Option.isNone(decoded)) throw new Error('SetLanguage should decode')

      const [next, cmds] = Main.update(createModel(), decoded.value)
      const cmd = cmds[0]

      expect(next.language).toBe('ja')
      expect(cmd?.name).toBe('PersistSettings')
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

      if (!cmd) throw new Error('missing PersistSettings command')
      const result = await Effect.runPromise(cmd.effect)
      expect(result).toStrictEqual(SettingsPersisted())

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { language?: string }
      expect(stored.language).toBe('ja')
    })

    it('persists successfully imported global speech settings through a command effect', async () => {
      const data = JSON.stringify({
        version: 1,
        settings: {
          language: 'fr',
          muted: true,
          speechRate: 1.7,
          speechPitch: 0.6,
          findItEnabledPacks: ['numbers'],
        },
      })
      const [next, cmds] = Main.update(createModel(), ImportedSettings({ data }))
      const cmd = cmds[0]
      const numbers = new Set(FindIt.emojiPoolForPacks(['numbers']))

      expect(next.language).toBe('fr')
      expect(next.muted).toBe(true)
      expect(next.speechRate).toBe(1.7)
      expect(next.speechPitch).toBe(0.6)
      expect(next.findIt.enabledPacks).toEqual(['numbers'])
      expect(next.findIt.grid.every(cell => numbers.has(cell.emoji))).toBe(true)
      expect(cmd?.name).toBe('PersistSettings')
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

      if (!cmd) throw new Error('missing PersistSettings command')
      await Effect.runPromise(cmd.effect)

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { language?: string; muted?: boolean; speechRate?: number; speechPitch?: number; findItEnabledPacks?: string[] }
      expect(stored.language).toBe('fr')
      expect(stored.muted).toBe(true)
      expect(stored.speechRate).toBe(1.7)
      expect(stored.speechPitch).toBe(0.6)
      expect(stored.findItEnabledPacks).toEqual(['numbers'])
    })

    it('persists MusicBox drum volume and loads it on init', async () => {
      const [next, cmds] = Main.update(createModel(), MusicBox.SetDrumVolume({ value: 0.35 }))
      const cmd = cmds[0]

      expect(next.musicBox.drumVolume).toBe(0.35)
      expect(cmd?.name).toBe('PersistSettings')
      if (!cmd) throw new Error('missing PersistSettings command')

      await Effect.runPromise(cmd.effect)

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { musicBoxDrumVolume?: number }
      expect(stored.musicBoxDrumVolume).toBe(0.35)

      const [loaded] = Main.init()
      expect(loaded.musicBox.drumVolume).toBe(0.35)
    })

    it('does not export or persist transient and legacy Bubbles settings', async () => {
      const customized = {
        ...createModel(),
        bubbles: {
          ...createModel().bubbles,
          selectedColor: 'rainbow',
          rainbowMode: true,
        },
      }
      const [exported] = Main.update(customized, ExportSettings())
      const exportedData = JSON.parse(exported.exportData) as { settings: Record<string, unknown> }

      expect(exportedData.settings).not.toHaveProperty('bubblesPopLabel')
      expect(exportedData.settings).not.toHaveProperty('bubblesSelectedColor')

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ bubblesPopLabel: true }))
      const [_, cmds] = Main.update(customized, Bubbles.SetSayColor({ value: true }))
      const cmd = cmds[0]
      expect(cmd?.name).toBe('PersistSettings')
      if (!cmd) throw new Error('missing PersistSettings command')

      await Effect.runPromise(cmd.effect)
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>
      expect(stored).not.toHaveProperty('bubblesPopLabel')
      expect(stored).not.toHaveProperty('bubblesSelectedColor')
    })

    it('ApplyImport closes the overlay and persists through a command effect', async () => {
      const data = JSON.stringify({
        version: 1,
        settings: {
          language: 'de',
        },
      })
      const base = Main.update(createModel(), SetExportData({ value: data }))[0]
      const [next, cmds] = Main.update({ ...base, settingsOverlay: 'import' }, ApplyImport())
      const cmd = cmds[0]

      expect(next.settingsOverlay).toBe('')
      expect(next.language).toBe('de')
      expect(cmd?.name).toBe('PersistSettings')

      if (!cmd) throw new Error('missing PersistSettings command')
      await Effect.runPromise(cmd.effect)

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { language?: string }
      expect(stored.language).toBe('de')
    })

    it('roundtrips exported settings into a fresh model', () => {
      const order = MusicBox.SONGS.map((_, index) => index)
      const reorderedSongs = order.length > 1 ? [order[1]!, order[0]!, ...order.slice(2)] : order
      const hiddenSongs = MusicBox.SONGS.map((_, index) => index === 1)
      const landingOrder = createModel().landingOrder
      const reorderedLanding = landingOrder.length > 1
        ? [landingOrder[1]!, landingOrder[0]!, ...landingOrder.slice(2)]
        : landingOrder
      const landingHiddenGames = landingOrder.map(index => index === 2)
      const customized = {
        ...createModel(),
        language: 'ja' as const,
        darkMode: 'dark' as const,
        muted: true,
        speechRate: 1.6,
        speechPitch: 0.7,
        counter: {
          ...createModel().counter,
          displayMode: 'both' as const,
        },
        findIt: {
          ...createModel().findIt,
          anyWins: true,
          voiceMode: true,
          pairsMode: true,
          enabledPacks: ['numbers'] as FindIt.EmojiPackKey[],
        },
        bubbles: {
          ...createModel().bubbles,
          sayColor: true,
          selectedColor: 'rainbow',
          rainbowMode: true,
        },
        memory: {
          ...createModel().memory,
          enabledPacks: ['animals'] as FindIt.EmojiPackKey[],
        },
        talkingKeyboard: TalkingKeyboard.init(['food', 'nature']),
        musicBox: {
          ...createModel().musicBox,
          selectedSong: 0,
          drumVolume: 0.4,
          songOrder: reorderedSongs,
          hiddenSongs,
        },
        landingOrder: reorderedLanding,
        landingHiddenGames,
      }
      const [exported] = Main.update(customized, ExportSettings())
      const [imported, cmds] = Main.update(
        { ...createModel(), exportData: exported.exportData, settingsOverlay: 'import' },
        ApplyImport(),
      )
      const numbers = new Set(FindIt.emojiPoolForPacks(['numbers']))

      expect(imported.settingsOverlay).toBe('')
      expect(imported.language).toBe(customized.language)
      expect(imported.darkMode).toBe(customized.darkMode)
      expect(imported.muted).toBe(customized.muted)
      expect(imported.speechRate).toBe(customized.speechRate)
      expect(imported.speechPitch).toBe(customized.speechPitch)
      expect(imported.counter.displayMode).toBe(customized.counter.displayMode)
      expect(imported.findIt.anyWins).toBe(customized.findIt.anyWins)
      expect(imported.findIt.voiceMode).toBe(customized.findIt.voiceMode)
      expect(imported.findIt.pairsMode).toBe(customized.findIt.pairsMode)
      expect(imported.findIt.enabledPacks).toEqual(customized.findIt.enabledPacks)
      expect(imported.findIt.grid.every(cell => segmentEmoji(cell.emoji).every(emoji => numbers.has(emoji)))).toBe(true)
      expect(imported.bubbles.sayColor).toBe(customized.bubbles.sayColor)
      expect(imported.bubbles.selectedColor).toBe('')
      expect(imported.bubbles.rainbowMode).toBe(false)
      expect(imported.memory.enabledPacks).toEqual(customized.memory.enabledPacks)
      expect(imported.talkingKeyboard.enabledPacks).toEqual(customized.talkingKeyboard.enabledPacks)
      expect(imported.memory.deck.every(card => FindIt.emojiPoolForPacks(customized.memory.enabledPacks).includes(card.value))).toBe(true)
      expect(imported.musicBox.songOrder).toEqual(customized.musicBox.songOrder)
      expect(imported.musicBox.hiddenSongs).toEqual(customized.musicBox.hiddenSongs)
      expect(imported.musicBox.drumVolume).toBe(customized.musicBox.drumVolume)
      expect(imported.landingOrder).toEqual(customized.landingOrder)
      expect(imported.landingHiddenGames).toEqual(customized.landingHiddenGames)
      expect(cmds[0]?.name).toBe('PersistSettings')
    })

    it('reset removes persisted settings through a command effect', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ language: 'ja' }))
      const [next, cmds] = Main.update({ ...createModel(), showResetConfirm: true }, ConfirmResetSettings())
      const cmd = cmds[0]

      expect(next.showResetConfirm).toBe(false)
      expect(cmd?.name).toBe('RemoveSettings')
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()

      if (!cmd) throw new Error('missing RemoveSettings command')
      await Effect.runPromise(cmd.effect)

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })

  describe('mount lifecycles', () => {
    it('removes the multitouch release listener when the stream is interrupted', async () => {
      const originalAdd = document.addEventListener.bind(document)
      const originalRemove = document.removeEventListener.bind(document)
      const added: EventListener[] = []
      const removed: EventListener[] = []

      document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        if (type === 'touchend' && typeof listener === 'function') {
          added.push(listener)
        }
        return originalAdd(type, listener, options)
      }) as Document['addEventListener']
      document.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
        if (type === 'touchend' && typeof listener === 'function') {
          removed.push(listener)
        }
        return originalRemove(type, listener, options)
      }) as Document['removeEventListener']

      try {
        const fiber = Effect.runFork(Stream.runDrain(multitouchClickStream(document.body)))
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(added).toHaveLength(1)
        await Effect.runPromise(Fiber.interrupt(fiber))

        expect(removed).toStrictEqual(added)
      } finally {
        document.addEventListener = originalAdd as Document['addEventListener']
        document.removeEventListener = originalRemove as Document['removeEventListener']
      }
    })
  })
})

const createModel = (): Main.Model => {
  const init = Main.init()[0]
  return {
    ...init,
    findIt: { grid: [], target: '🎈', count: 0, shaking: -1, shakeTick: 0, won: false, found: [], anyWins: false, voiceMode: false, pairsMode: false, enabledPacks: FindIt.DEFAULT_EMOJI_PACK_KEYS, tooltipEmoji: null, wrongCount: 0, hintId: null, dragIndex: null, gridDragIndex: null },
  }
}
