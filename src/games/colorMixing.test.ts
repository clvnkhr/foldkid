import { Effect, Schema as S } from 'effect'
import { Scene, Story } from 'foldkit/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Audio from '../audio'
import * as Speech from '../speech'
import * as Game from './colorMixing'
import { DEFAULT_SEED, INKS, RECIPES, hex, makePuzzle, mix, nameColor } from './colorMixingDomain'

const update = (model: Game.Model, msg: Game.Message) => Game.update(model, msg, 'en', true, {})
const ready = (model = Game.init()): Game.Model => ({ ...model, seeded: true })
const pick = (model: Game.Model, index = model.answer) => Game.Pick({ index, round: model.round, token: model.token })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

describe('transparent ink model and procedural recipes', () => {
  it('uses subtractive transmission rather than RGB averaging or additive light', () => {
    expect(mix([[0, 255, 255], [255, 0, 255]])).toEqual([0, 0, 255])
    expect(mix([[255, 255, 0], [0, 255, 255]])).toEqual([0, 255, 0])
    expect(mix([[255, 0, 255], [255, 255, 0]])).toEqual([255, 0, 0])
    expect(mix([[0, 255, 255], [255, 0, 255], [255, 255, 0]])).toEqual([0, 0, 0])
    expect(mix([[255, 160, 160], [160, 255, 255]])).toEqual([160, 160, 160])
    expect(hex([0, 128, 255])).toBe('#0080ff')
    expect(nameColor([0, 128, 128])).toBe('teal')
    expect(nameColor([128, 128, 0])).toBe('olive')
    expect(nameColor([255, 160, 160])).toBe('pink')
    expect(nameColor([160, 160, 255])).toBe('periwinkle')
    expect(nameColor([255, 255, 160])).toBe('paleYellow')
    expect(nameColor([255, 160, 100])).toBe('apricot')
  })

  it.each([2, 3] as const)('provides many genuine %s-ink combinations and distinct named answers', length => {
    expect(RECIPES[length].length).toBeGreaterThan(50)
    expect(new Set(RECIPES[length].map(recipe => recipe.result.name)).size).toBeGreaterThan(10)
    for (const recipe of RECIPES[length]) {
      expect(recipe.sources).toHaveLength(length)
      expect(new Set(recipe.sources).size).toBe(length)
      expect(recipe.result.rgb).toEqual(mix(recipe.sources.map(index => INKS[index]!.rgb)))
      expect(recipe.sources.every(index => hex(INKS[index]!.rgb) !== hex(recipe.result.rgb))).toBe(true)
    }
    let seed = DEFAULT_SEED, previous = -1
    const seen = new Set<number>(), families = new Set<string>()
    for (let round = 0; round < 500; round++) {
      const puzzle = makePuzzle(seed, length, previous)
      expect(puzzle.recipe).not.toBe(previous)
      expect(puzzle.choices).toHaveLength(4)
      expect(new Set(puzzle.choices.map(choice => choice.name)).size).toBe(4)
      expect(new Set(puzzle.choices.map(choice => hex(choice.rgb))).size).toBe(4)
      expect(puzzle.choices[puzzle.answer]).toEqual(RECIPES[length][puzzle.recipe]!.result)
      expect(makePuzzle(seed, length, previous)).toEqual(puzzle)
      seen.add(puzzle.recipe); families.add(puzzle.choices[puzzle.answer]!.name)
      seed = puzzle.seed; previous = puzzle.recipe
    }
    expect(seen.size).toBeGreaterThan(50)
    expect(families.size).toBeGreaterThan(10)
  })
})

describe('Color Mixing lifecycle', () => {
  it('has a schema-valid initial state and seeds once from an explicit command', () => {
    const model = Game.init()
    expect(S.is(Game.Model)(model)).toBe(true)
    Story.story(update, Story.with(model), Story.message(Game.Entered()),
      Story.model(next => expect(next.seeding).toBe(true)),
      Story.Command.resolveAll([{ name: 'ColorMixingSeed' }, Game.Seeded({ seed: 345, token: 1 })]),
      Story.model(next => expect(next).toMatchObject({ seeded: true, seeding: false, token: 2 })),
      Story.message(Game.Entered()), Story.Command.expectNone())
  })

  it('restarts entropy safely when ink count changes while initial seeding is pending', () => {
    const [pending] = update(Game.init(), Game.Entered())
    const [changed, commands] = update(pending, Game.SetLength({ length: 3 }))
    expect(changed.seeding).toBe(true)
    expect(commands.map(command => command.name)).toEqual(['ColorMixingSeed'])
    expect(update(changed, Game.Seeded({ seed: 3, token: pending.token }))).toEqual([changed, []])
    const [seeded] = update(changed, Game.Seeded({ seed: 12345, token: changed.token }))
    expect(seeded).toMatchObject({ length: 3, seeded: true, seeding: false })
    expect(seeded.recipe).toBe(makePuzzle(12345, 3).recipe)
    const interrupted = Game.interrupt(pending)
    expect(update(interrupted, Game.Seeded({ seed: 9, token: pending.token }))).toEqual([interrupted, []])
    expect(update(interrupted, Game.Entered())[1].map(command => command.name)).toEqual(['ColorMixingSeed'])
  })

  it('reveals a correct answer, locks double clicks, then starts a fresh endless round', () => {
    const model = ready()
    Story.story(update, Story.with(model), Story.message(pick(model)),
      Story.model(next => expect(next).toMatchObject({ status: 'revealed', token: 1 })),
      Story.Command.resolveAll([{ name: 'ColorMixingCelebrate' }, Game.RoundReady({ round: 0, token: 1 })]),
      Story.model(next => { expect(next).toMatchObject({ round: 1, status: 'matching', wrong: -1 }); expect(next.recipe).not.toBe(model.recipe) }),
      Story.Command.expectNone())
  })

  it('retains a wrong answer clue and accepts another attempt', () => {
    const model = ready(), wrong = (model.answer + 1) % 4
    const [hinted, commands] = update(model, pick(model, wrong))
    expect(hinted.wrong).toBe(wrong); expect(commands).toEqual([])
    expect(update(hinted, pick(hinted))[0].status).toBe('revealed')
  })

  it('ignores malformed indices, stale rounds and stale delayed completions', () => {
    const model = ready()
    for (const index of [-1, 4, 0.5, NaN, Infinity]) expect(update(model, pick(model, index))).toEqual([model, []])
    expect(update(model, Game.Pick({ index: model.answer, round: 9, token: 0 }))).toEqual([model, []])
    const success = update(model, pick(model))[0]
    expect(update(success, pick(success))).toEqual([success, []])
    const changed = update(success, Game.SetLength({ length: 3 }))[0]
    expect(changed.length).toBe(3); expect(changed.status).toBe('matching')
    expect(update(changed, Game.RoundReady({ round: 0, token: 1 }))).toEqual([changed, []])
    const interrupted = Game.interrupt(success)
    expect(interrupted.status).toBe('matching')
    expect(update(interrupted, Game.RoundReady({ round: 0, token: 1 }))).toEqual([interrupted, []])
    expect(update(model, { _tag: 'ColorMixingSetLength', length: 8 } as unknown as Game.Message)).toEqual([model, []])
  })

  it('does not narrate under mute and resolves even with no mounted DOM', async () => {
    vi.useFakeTimers()
    try {
      const speak = vi.spyOn(Speech, 'speakNow'), sound = vi.spyOn(Audio, 'chime')
      const model = ready(), [, commands] = update(model, pick(model))
      const result = Effect.runPromise(commands[0]!.effect)
      await vi.runAllTimersAsync()
      expect(await result).toEqual(Game.RoundReady({ round: 0, token: 1 }))
      expect(speak).not.toHaveBeenCalled(); expect(sound).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

  it('speaks the result with root language and speech options after a correct answer', async () => {
    vi.useFakeTimers()
    try {
      const initial = ready()
      const [revealed, commands] = Game.update(initial, pick(initial), 'fr', false, { rate: 0.8, pitch: 1.2 })
      const card = document.createElement('div')
      card.className = 'color-mixing-card'; card.dataset.revision = `${revealed.round}-${revealed.token}`
      document.body.appendChild(card)
      const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => undefined)
      vi.spyOn(Audio, 'chime').mockReturnValue({ name: 'PlayChime', effect: Effect.succeed(Game.RoundReady({ round: 0, token: 1 })) })
      const result = Effect.runPromise(commands[0]!.effect)
      await vi.runAllTimersAsync()
      expect(await result).toEqual(Game.RoundReady({ round: 0, token: 1 }))
      expect(speak).toHaveBeenCalledExactlyOnceWith(expect.any(String), { lang: 'fr', rate: 0.8, pitch: 1.2 })
    } finally { vi.useRealTimers() }
  })

  it('keeps all three pair overlaps painted and masks only the intersection shared by all three inks', () => {
    const model = ready({ ...Game.init(), ...makePuzzle(93, 3), length: 3 })
    Scene.scene({ update, view: (m: Game.Model) => Game.view(m, 'en') }, Scene.with(model),
      Scene.expectAll(Scene.all.selector('[data-color-mixing-pair]')).toHaveCount(3),
      Scene.expect(Scene.selector('[data-color-mixing-common] g[clip-path="url(#color-mixing-clip-0)"]')).toHaveAttr('clip-path', 'url(#color-mixing-clip-0)'),
      Scene.expect(Scene.selector('[data-color-mixing-common] g[clip-path="url(#color-mixing-clip-1)"]')).toHaveAttr('clip-path', 'url(#color-mixing-clip-1)'),
      Scene.expect(Scene.selector('[data-color-mixing-common] circle')).toHaveAttr('fill', 'var(--card-bg)'),
      Scene.expectAll(Scene.all.selector('.color-mixing-sources li')).toHaveCount(3),
      Scene.Command.expectNone())
    const revealed = { ...model, status: 'revealed' as const }
    Scene.scene({ update, view: (m: Game.Model) => Game.view(m, 'en') }, Scene.with(revealed),
      Scene.expect(Scene.selector('[data-color-mixing-common] circle')).toHaveAttr('fill', hex(RECIPES[3][model.recipe]!.result.rgb)),
      Scene.expectAll(Scene.all.selector('.color-mixing-choice')).toHaveCount(4),
      Scene.Command.expectNone())
  })

  it('renders all sources, accessible names and four native color buttons', () => {
    const model = ready()
    Scene.scene({ update, view: (m: Game.Model) => Game.view(m, 'en') }, Scene.with(model),
      Scene.expect(Scene.role('heading', { name: 'Color Mixing' })).toExist(),
      Scene.expect(Scene.role('img', { name: 'Overlapping inks with the shared middle missing' })).toExist(),
      Scene.expect(Scene.role('button', { name: '3 colors' })).toExist())
    const [three] = update(model, Game.SetLength({ length: 3 }))
    expect(RECIPES[3][three.recipe]!.sources).toHaveLength(3)
  })
})
