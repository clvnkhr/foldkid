import { describe, expect, it } from 'vitest'
import { Story } from 'foldkit/test'
import * as Main from './main'
import * as Greeting from './games/greeting'
import { PageGreeting } from './route'
import { ClickedLanding, ClickedGreeting, ClickedCounter, ClickedPeekaboo, ClickedBubbles, ClickedDarkMode } from './message'

describe('Main', () => {
  it('init returns correct initial state', () => {
    const [model] = Main.init()
    expect(model.page._tag).toBe('PageLanding')
    expect(model.darkMode).toBe('auto')
    expect(model.language).toBe('en')
    expect(model.showSettings).toBe(false)
    expect(model.greeting).toStrictEqual({ status: 'idle', audioUrl: '', playCount: 0, autoPlay: false, recordingId: 0 })
    expect(model.counter.count).toBe(0)
    expect(model.bubbles).toStrictEqual({ bubbles: [], score: 0, nextId: 0 })
  })

  it('ClickedLanding sets page to landing', () => {
    Story.story(
      Main.update,
      Story.with({
        ...createModel(),
        page: PageGreeting(),
      }),
      Story.message(ClickedLanding()),
      Story.model((model) => {
        expect(model.page._tag).toBe('PageLanding')
      }),
      Story.Command.expectNone(),
    )
  })

  it('ClickedGreeting sets page to greeting', () => {
    Story.story(
      Main.update,
      Story.with(createModel()),
      Story.message(ClickedGreeting()),
      Story.model((model) => {
        expect(model.page._tag).toBe('PageGreeting')
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

  it('ClickedPeekaboo sets page to peekaboo', () => {
    Story.story(
      Main.update,
      Story.with(createModel()),
      Story.message(ClickedPeekaboo()),
      Story.model((model) => {
        expect(model.page._tag).toBe('PagePeekaboo')
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
      Story.Command.expectNone(),
    )

    Story.story(
      Main.update,
      Story.with({ ...base, darkMode: 'light' }),
      Story.message(ClickedDarkMode()),
      Story.model((model) => {
        expect(model.darkMode).toBe('dark')
      }),
      Story.Command.expectNone(),
    )

    Story.story(
      Main.update,
      Story.with({ ...base, darkMode: 'dark' }),
      Story.message(ClickedDarkMode()),
      Story.model((model) => {
        expect(model.darkMode).toBe('auto')
      }),
      Story.Command.expectNone(),
    )
  })

  it('delegates GreetingClickedRecord to greeting update', () => {
    Story.story(
      Main.update,
      Story.with(createModel()),
      Story.message(Greeting.ClickedRecord()),
      Story.model((model) => {
        expect(model.greeting.status).toBe('recording')
      }),
      Story.Command.resolveAll([{ name: 'Record' }, Greeting.RecordingFailed()]),
      Story.Command.expectNone(),
    )
  })
})

const createModel = (): Main.Model => {
  const init = Main.init()[0]
  return {
    ...init,
    peekaboo: { grid: [], target: '🎈', count: 0, shaking: -1, shakeTick: 0, won: false, found: [], anyWins: false, voiceMode: false, tooltipEmoji: null },
  }
}
