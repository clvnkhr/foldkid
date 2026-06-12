import { describe, expect, it } from 'vitest'
import { Story } from 'foldkit/test'
import * as Main from './main'
import * as Counter from './games/counter'
import * as FindIt from './games/findit'
import * as Bubbles from './games/bubbles'
import * as MusicBox from './games/musicbox'
import { ClickedLanding, ClickedCounter, ClickedFindIt, ClickedBubbles, ClickedDarkMode, ImportedSettings, SettingsPersisted } from './message'

const resolveSettings = [{ name: 'PersistSettings' }, SettingsPersisted()] as const

describe('settings persistence', () => {
  const nonSettingsMessages: Array<{ label: string; msg: Main.Message; resolves?: readonly [readonly [{ readonly name: string }, Main.Message], ...readonly (readonly [{ readonly name: string }, Main.Message])[]] }> = [
    { label: 'ClickedLanding', msg: ClickedLanding() },
    { label: 'ClickedCounter', msg: ClickedCounter() },
    { label: 'ClickedFindIt', msg: ClickedFindIt() },
    { label: 'ClickedBubbles', msg: ClickedBubbles() },
    { label: 'CounterPointerDown', msg: Counter.PointerDown() },
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
  })
})

const createModel = (): Main.Model => {
  const init = Main.init()[0]
  return {
    ...init,
    findIt: { grid: [], target: '🎈', count: 0, shaking: -1, shakeTick: 0, won: false, found: [], anyWins: false, voiceMode: false, pairsMode: false, tooltipEmoji: null, wrongCount: 0, hintId: null, dragIndex: null, gridDragIndex: null },
  }
}
