import { Effect, Fiber, Option, Schema as S, Stream } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { Story } from 'foldkit/test'
import * as Main from './main'
import * as Counter from './games/counter'
import * as FindIt from './games/findit'
import * as Bubbles from './games/bubbles'
import * as Draw from './games/draw'
import * as Memory from './games/memory'
import * as MusicBox from './games/musicbox'
import * as Rps from './games/rps/main'
import * as MagneticBlocks from './games/magneticBlocks'
import * as TalkingKeyboard from './games/talkingKeyboard'
import * as GrowingNumbers from './games/growingNumbers'
import * as ShapeWorkshop from './games/shapeWorkshop'
import { LANDING_GAME_COUNT, LANDING_GAMES } from './pages/landing'
import { ApplyImport, ClickedLanding, ClickedCounter, ClickedFindIt, ClickedBubbles, ClickedDarkMode, ClickedGrowingNumbers, ClickedMagneticBlocks, ClickedMemory, ClickedShapeWorkshop, ClickedTalkingKeyboard, ConfirmResetSettings, ExportSettings, ImportedSettings, LandingDragStarted, LandingDroppedOn, LandingSettingsDragStarted, LandingSettingsDroppedOn, LandingToggleGameVisibility, SetExportData, SetLanguage, SetSpeechPitch, SetSpeechRate, SettingsPersisted, ToggleMute } from './message'

const resolveSettings = [{ name: 'PersistSettings' }, SettingsPersisted()] as const
const resolveBubblesChime = [{ name: 'PlayChime' }, Bubbles.SoundPlayed()] as const
const resolveBubblesSpeak = [{ name: 'Speak' }, Bubbles.SoundPlayed()] as const
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
    { label: 'ClickedMemory', msg: ClickedMemory() },
    { label: 'ClickedGrowingNumbers', msg: ClickedGrowingNumbers() },
    { label: 'ClickedShapeWorkshop', msg: ClickedShapeWorkshop() },
    {
      label: 'GrowingNumbersChooseGrowth',
      msg: GrowingNumbers.ChooseGrowth({ amount: 1 }),
      resolves: [[{ name: 'GrowingNumbersFlyGrowth' }, GrowingNumbers.FinishGrowth()]],
    },
    {
      label: 'ShapeWorkshopTapPiece',
      msg: ShapeWorkshop.TapPiece({ index: 0 }),
      resolves: [[{ name: 'ShapeWorkshopFlyPiece' }, ShapeWorkshop.PieceFlightFinished({ index: 0, token: 1 })]],
    },
    { label: 'CounterPointerDown', msg: Counter.PointerDown({ timeStamp: 0, button: 'inc' }) },
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
    const [growingNumbers] = Main.update(createModel(), GrowingNumbers.ChooseGrowth({ amount: 1 }))
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
    it('removes the double-tap touch listener when the stream is interrupted', async () => {
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
        const fiber = Effect.runFork(Stream.runDrain(Main.preventDoubleTapZoomStream()))
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
