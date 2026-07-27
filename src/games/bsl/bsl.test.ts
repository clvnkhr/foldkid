import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Bsl from './main'

const resolveSound = [{ name: 'Speak' }, Bsl.SoundPlayed()] as const

describe('Bsl', () => {
  it('init creates model with letter and 4 options', () => {
    const model = Bsl.init()
    expect(model.letter).toBeTruthy()
    expect(model.options).toHaveLength(4)
    expect(model.options).toContain(model.letter)
    expect(model.score).toBe(0)
    expect(model.round).toBe(0)
    expect(model.feedback).toBe('none')
  })

  it('correct guess updates score', () => {
    const model = Bsl.init()
    Story.story(
      Bsl.update,
      Story.with(model),
      Story.message(Bsl.ClickedLetter({ letter: model.letter })),
      Story.model((m) => {
        expect(m.feedback).toBe('correct')
        expect(m.score).toBe(1)
      }),
      Story.Command.resolveAll(resolveSound),
      Story.Command.expectNone(),
    )
  })

  it('wrong guess does not update score', () => {
    const model = Bsl.init()
    const wrongLetter = model.options.find(l => l !== model.letter) ?? 'A'
    Story.story(
      Bsl.update,
      Story.with(model),
      Story.message(Bsl.ClickedLetter({ letter: wrongLetter })),
      Story.model((m) => {
        expect(m.feedback).toBe('wrong')
        expect(m.score).toBe(0)
      }),
      Story.Command.resolveAll(resolveSound),
      Story.Command.expectNone(),
    )
  })

  it('NextRound advances round', () => {
    const model = { ...Bsl.init(), feedback: 'correct' as const, score: 1 }
    Story.story(
      Bsl.update,
      Story.with(model),
      Story.message(Bsl.NextRound()),
      Story.model((m) => {
        expect(m.round).toBe(1)
        expect(m.feedback).toBe('none')
      }),
      Story.Command.expectNone(),
    )
  })

  it('ClickedReset returns to initial state', () => {
    const model = { ...Bsl.init(), round: 9, score: 5, feedback: 'correct' as const }
    Story.story(
      Bsl.update,
      Story.with(model),
      Story.message(Bsl.ClickedReset()),
      Story.model((m) => {
        expect(m.round).toBe(0)
        expect(m.score).toBe(0)
        expect(m.feedback).toBe('none')
      }),
      Story.Command.expectNone(),
    )
  })

  it('renders initial state', () => {
    Scene.scene(
      { update: Bsl.update, view: Bsl.view },
      Scene.with(Bsl.init()),
      Scene.expect(Scene.text('Round 1/10')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('shows feedback after correct guess', () => {
    const model = Bsl.init()
    Scene.scene(
      { update: Bsl.update, view: Bsl.view },
      Scene.with(model),
      Scene.click(Scene.text(model.letter)),
      Scene.Command.resolveAll(resolveSound),
      Scene.Command.expectNone(),
    )
  })
})
