import { Effect, Fiber, Stream } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { Story } from 'foldkit/test'
import * as Main from './main'
import * as Counter from './games/counter'
import * as FindIt from './games/findit'
import * as Bubbles from './games/bubbles'
import * as MusicBox from './games/musicbox'
import { ApplyImport, ClickedLanding, ClickedCounter, ClickedFindIt, ClickedBubbles, ClickedDarkMode, ConfirmResetSettings, ImportedSettings, SetExportData, SettingsPersisted } from './message'

const resolveSettings = [{ name: 'PersistSettings' }, SettingsPersisted()] as const
const STORAGE_KEY = 'foldkid-settings'

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
  if (!globalThis.localStorage) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: makeStorage(),
      configurable: true,
    })
  }
  localStorage.clear()
})

describe('settings persistence', () => {
  const nonSettingsMessages: Array<{ label: string; msg: Main.Message; resolves?: readonly [readonly [{ readonly name: string }, Main.Message], ...readonly (readonly [{ readonly name: string }, Main.Message])[]] }> = [
    { label: 'ClickedLanding', msg: ClickedLanding() },
    { label: 'ClickedCounter', msg: ClickedCounter() },
    { label: 'ClickedFindIt', msg: ClickedFindIt() },
    { label: 'ClickedBubbles', msg: ClickedBubbles() },
    { label: 'CounterPointerDown', msg: Counter.PointerDown({ timeStamp: 0, button: 'inc' }) },
    { label: 'FindItClickedCell', msg: FindIt.ClickedCell({ id: 0 }) },
    { label: 'BubblesClickedPop', msg: Bubbles.ClickedPop({ id: 0 }) },
    { label: 'MusicBoxNoteOn', msg: MusicBox.NoteOn({ pitch: 'C4' }) },
  ]

  for (const { label, msg } of nonSettingsMessages) {
    it(`does not persist settings on ${label}`, () => {
      Story.story(
        Main.update,
        Story.with(createModel()),
        Story.message(msg),
        Story.Command.expectNone(),
      )
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
    expect(model.counter.count).toBe(0)
    expect(model.bubbles).toStrictEqual({ bubbles: [], score: 0, nextId: 0, rainbowMode: false, popLabel: false, sayColor: false, selectedColor: '' })
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
          expect(model.musicBox.songOrder).toEqual([0, 1])
        }),
        Story.Command.resolveAll(resolveSettings),
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

    it('persists successfully imported settings through a command effect', async () => {
      const data = JSON.stringify({
        version: 1,
        settings: {
          language: 'fr',
          muted: true,
          counterRate: 1.7,
        },
      })
      const [next, cmds] = Main.update(createModel(), ImportedSettings({ data }))
      const cmd = cmds[0]

      expect(next.language).toBe('fr')
      expect(next.muted).toBe(true)
      expect(next.counter.rate).toBe(1.7)
      expect(cmd?.name).toBe('PersistSettings')
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

      if (!cmd) throw new Error('missing PersistSettings command')
      await Effect.runPromise(cmd.effect)

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { language?: string; muted?: boolean; counterRate?: number }
      expect(stored.language).toBe('fr')
      expect(stored.muted).toBe(true)
      expect(stored.counterRate).toBe(1.7)
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
    findIt: { grid: [], target: '🎈', count: 0, shaking: -1, shakeTick: 0, won: false, found: [], anyWins: false, voiceMode: false, pairsMode: false, tooltipEmoji: null, wrongCount: 0, hintId: null, dragIndex: null, gridDragIndex: null },
  }
}
