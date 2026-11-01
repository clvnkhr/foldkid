import { Effect, Schema as S } from 'effect'
import { Scene, Story } from 'foldkit/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Audio from '../audio'
import { t } from '../i18n'
import * as Speech from '../speech'
import * as Game from './sequenceWords'
import { generateBoard, GROUP_SIZES, GROUPS, wordsFor } from './sequenceWordsDomain'

const update = (model: Game.Model, message: Game.Message) => Game.update(model, message, 'en', true, {})
const ready = (): Game.Model => ({ ...Game.init(), status: 'matching' })
const connect = (model: Game.Model, number = model.numbers[0]!, word = number) => Game.Connect({ number, word, token: model.token })
const pick = (model: Game.Model, side: 'number' | 'word', choice = model.numbers[0]!) => Game.Pick({ side, choice, token: model.token })
const evolve = (model: Game.Model, message: Game.Message): Game.Model => update(model, message)[0]
const mount = (token: number) => [{ name: 'sequenceWordsLines' }, Game.Spoken({ token })] as const
afterEach(() => { document.querySelectorAll('.sequence-words-card').forEach(card => card.remove()); vi.restoreAllMocks(); vi.useRealTimers(); Audio.resetContext() })

describe('Sequence Words randomized worksheets', () => {
  it.each(GROUPS)('generates both columns from one unique %s subset, with crossed relationships', group => {
    let seed = 6738495
    const positions = new Set<number>()
    const layouts = new Set<string>()
    for (let index = 0; index < 200; index++) {
      const board = generateBoard(seed, group, 5)
      expect(board.numbers).toHaveLength(Math.min(5, GROUP_SIZES[group]))
      expect(new Set(board.numbers).size).toBe(board.numbers.length)
      expect([...board.words].sort()).toEqual([...board.numbers].sort())
      expect(board.numbers.every(choice => Number.isInteger(choice) && choice >= 0 && choice < GROUP_SIZES[group])).toBe(true)
      expect(board.words).not.toEqual(board.numbers)
      board.numbers.forEach(position => positions.add(position)); layouts.add(board.numbers.join(',') + ':' + board.words.join(','))
      seed = board.seed
    }
    expect(positions.size).toBe(GROUP_SIZES[group])
    expect(layouts.size).toBeGreaterThan(30)
  })

  it.each(['en', 'zh', 'zh-HK', 'fr', 'de', 'fa', 'ms', 'ja'])('has the right number of distinct words in every %s family', language => {
    for (const group of GROUPS) {
      const words = wordsFor(group, language)
      expect(words).toHaveLength(GROUP_SIZES[group])
      expect(new Set(words).size).toBe(words.length)
      expect(words.every(word => word.length > 0)).toBe(true)
    }
  })

  it('uses explicit Monday-first and January-first relationships, including Gregorian Persian months', () => {
    expect(wordsFor('weekdays', 'en')).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    expect(wordsFor('months', 'en')[0]).toBe('January')
    expect(wordsFor('months', 'en')[11]).toBe('December')
    expect(wordsFor('months', 'fa')[0]).toBe(new Intl.DateTimeFormat('fa', { month: 'long', calendar: 'gregory', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1))))
    expect(wordsFor('ordinals', 'en').slice(0, 3)).toEqual(['first', 'second', 'third'])
  })
})

describe('Sequence Words connections and lifecycle', () => {
  it('initializes a valid schema, samples randomness in a command and ignores stale seeds', () => {
    expect(S.is(Game.Model)(Game.init())).toBe(true)
    Story.story(update, Story.with(Game.init()), Story.message(Game.Entered()),
      Story.model(model => expect(model).toMatchObject({ status: 'loading', token: 1 })),
      Story.Command.resolveAll([{ name: 'SequenceWordsSeed' }, Game.SeedReady({ seed: 4321, token: 1 })]),
      Story.model(model => expect(model.status).toBe('matching')),
      Story.message(Game.SeedReady({ seed: 8765, token: 1 })), Story.Command.expectNone())
    expect(evolve(Game.init(), connect(Game.init()))).toEqual(Game.init())
  })

  it('keeps correct connections while other pairs remain and refreshes only after all pairs match', () => {
    const initial = ready()
    const first = evolve(initial, connect(initial))
    expect(first).toMatchObject({ matched: [initial.numbers[0]], status: 'matching', score: 1 })
    expect(first.numbers).toEqual(initial.numbers); expect(first.words).toEqual(initial.words)
    expect(evolve(first, connect(first, first.matched[0]!))).toEqual(first)
    let model = first
    for (const number of initial.numbers.slice(1, -1)) model = evolve(model, connect(model, number))
    Story.story(update, Story.with(model), Story.message(connect(model, initial.numbers.at(-1)!)),
      Story.model(next => expect(next).toMatchObject({ status: 'success', score: initial.numbers.length, matched: initial.numbers })),
      Story.Command.resolveAll([{ name: 'SequenceWordsCelebrate' }, Game.Advance({ token: model.token + 1 })]),
      Story.model(next => { expect(next).toMatchObject({ status: 'matching', matched: [], selected: null }); expect(next.seed).not.toBe(initial.seed) }),
      Story.Command.expectNone())
  })

  it.each(['number', 'word'] as const)('supports two-step tap or keyboard matching starting on the %s column', side => {
    const initial = ready()
    const selected = evolve(initial, pick(initial, side))
    expect(selected.selected).toEqual({ side, choice: initial.numbers[0] })
    const joined = evolve(selected, pick(selected, side === 'word' ? 'number' : 'word'))
    expect(joined.matched).toEqual([initial.numbers[0]])
    expect(joined.selected).toBeNull()
    expect(evolve(selected, pick(initial, side === 'word' ? 'number' : 'word'))).toEqual(selected)
    expect(evolve(selected, pick(selected, side)).selected).toBeNull()
  })

  it('clears wrong joins without deleting existing lines, allowing correction', () => {
    const initial = ready()
    const first = evolve(initial, connect(initial))
    const wrong = evolve(first, connect(first, first.numbers[1]!, first.numbers[2]!))
    expect(wrong).toMatchObject({ wrong: true, matched: first.matched, selected: null, status: 'matching' })
    const corrected = evolve(wrong, connect(wrong, wrong.numbers[1]!))
    expect(corrected).toMatchObject({ wrong: false, matched: initial.numbers.slice(0, 2) })
    for (const invalid of [-1, .25, NaN, Infinity, 1000]) {
      expect(evolve(initial, connect(initial, invalid))).toEqual(initial)
      expect(evolve(initial, Game.Connect({ number: initial.numbers[0]!, word: initial.numbers[0]!, token: invalid }))).toEqual(initial)
    }
  })

  it('plays endless boards without a finite question order', () => {
    let model = ready()
    for (let round = 0; round < 80; round++) {
      for (const number of model.numbers) {
        const [next, commands] = update(model, connect(model, number)); model = next
        if (commands.length) {
          expect(commands[0]!.name).toBe('SequenceWordsCelebrate')
          model = evolve(model, Game.Advance({ token: model.token }))
        }
      }
    }
    expect(model.score).toBe(240); expect(model.status).toBe('matching')
  })

  it('invalidates stale drag releases and completions on pack, size and navigation changes', () => {
    const initial = ready()
    const selected = evolve(initial, pick(initial, 'number'))
    const changed = evolve(selected, Game.SetGroup({ group: 'months' }))
    expect(changed).toMatchObject({ group: 'months', status: 'matching', matched: [], selected: null })
    expect(evolve(changed, connect(selected))).toEqual(changed)
    expect(evolve(Game.interrupt(selected), connect(selected))).toEqual(Game.interrupt(selected))
    const five = evolve(initial, Game.SetCount({ count: 5 })); expect(five.numbers).toHaveLength(5)
    const seasons = evolve(five, Game.SetGroup({ group: 'seasons' })); expect(seasons.numbers).toHaveLength(4)
    expect(evolve(initial, { _tag: 'SequenceWordsSetCount', count: 8 } as unknown as Game.Message)).toEqual(initial)
    expect(evolve(initial, { _tag: 'SequenceWordsSetGroup', group: 'bad' } as unknown as Game.Message)).toEqual(initial)
  })
})

describe('Sequence Words effects and accessible worksheet', () => {
  it('speaks the selected word and root options, while muted or stale feedback stays silent', async () => {
    const initial = { ...ready(), group: 'weekdays' as const, numbers: [0, 1, 2], words: [2, 0, 1] }
    const speech = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    const [next, commands] = Game.update(initial, pick(initial, 'word', 0), 'fr', false, { rate: .8, pitch: 1.2 })
    const card = document.createElement('div'); card.className = 'sequence-words-card'; card.dataset.sequenceToken = String(next.token); document.body.append(card)
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Game.Spoken({ token: next.token }))
    expect(speech).toHaveBeenCalledWith('lundi', { lang: 'fr', rate: .8, pitch: 1.2 })
    expect(Game.update(initial, pick(initial, 'word', 0), 'fr', true, {})[1]).toEqual([])
    speech.mockClear(); card.dataset.sequenceToken = '999'
    await Effect.runPromise(commands[0]!.effect); expect(speech).not.toHaveBeenCalled()
  })

  it('finishes success under missing DOM and mute, without needing an animation event', async () => {
    vi.useFakeTimers()
    const initial = { ...ready(), matched: ready().numbers.slice(0, -1) }
    const [won, commands] = update(initial, connect(initial, initial.numbers.at(-1)!))
    const pending = Effect.runPromise(commands[0]!.effect)
    await vi.advanceTimersByTimeAsync(1500)
    expect(await pending).toEqual(Game.Advance({ token: won.token }))
  })

  it('keeps the chosen learning pack selected when an automatically completed worksheet refreshes', () => {
    const initial = ready()
    const chosen = evolve(initial, Game.SetGroup({ group: 'weekdays' }))
    Scene.scene({ update, view: model => Game.view(model, 'en') }, Scene.with(initial), Scene.Mount.resolveAll(mount(initial.token)),
      Scene.change(Scene.role('combobox', { name: t('sequenceWordsGroup', 'en') }), 'weekdays'),
      Scene.expect(Scene.role('option', { name: t('sequenceWordsWeekdays', 'en') })).toHaveAttr('selected', 'true'),
      ...chosen.numbers.flatMap(choice => [
        Scene.click(Scene.role('button', { name: String(choice + 1) })),
        Scene.click(Scene.role('button', { name: wordsFor('weekdays', 'en')[choice]! })),
      ]),
      Scene.Command.resolveAll([{ name: 'SequenceWordsCelebrate' }, Game.Advance({ token: chosen.token + 2 * chosen.numbers.length })]),
      Scene.expect(Scene.role('combobox', { name: t('sequenceWordsGroup', 'en') })).toHaveAttr('value', 'weekdays'),
      Scene.expect(Scene.role('option', { name: t('sequenceWordsWeekdays', 'en') })).toHaveAttr('selected', 'true'),
      Scene.expect(Scene.role('status')).toHaveText(t('sequenceWordsConnectHint', 'en')), Scene.Command.expectNone())
  })

  it('renders both columns, native controls, live hints, persistent connection paths and optional reference', () => {
    const initial = ready()
    Scene.scene({ update, view: model => Game.view(model, 'en') }, Scene.with(initial), Scene.Mount.resolveAll(mount(initial.token)),
      Scene.expect(Scene.role('heading', { name: 'Sequence Words' })).toExist(),
      Scene.expect(Scene.role('combobox', { name: t('sequenceWordsGroup', 'en') })).toExist(),
      Scene.expect(Scene.role('group', { name: t('sequenceWordsNumbersColumn', 'en') })).toExist(),
      Scene.expect(Scene.role('group', { name: t('sequenceWordsWordsColumn', 'en') })).toExist(),
      Scene.expect(Scene.role('status')).toHaveAttr('aria-live', 'polite'),
      ...initial.numbers.flatMap(choice => [
        Scene.expect(Scene.role('button', { name: String(choice + 1) })).toHaveAttr('style', '--sequence-colour: #9b9aaa'),
        Scene.expect(Scene.role('button', { name: wordsFor(initial.group, 'en')[choice]! })).toHaveAttr('style', '--sequence-colour: #9b9aaa'),
      ]),
      Scene.click(Scene.role('button', { name: String(initial.numbers[0]! + 1) })),
      Scene.click(Scene.role('button', { name: wordsFor(initial.group, 'en')[initial.numbers[0]!]! })),
      Scene.expect(Scene.selector('[data-sequence-line]')).toExist(),
      Scene.expect(Scene.role('button', { name: String(initial.numbers[0]! + 1) })).toHaveAttr('style', `--sequence-colour: ${Game.LINE_COLOURS[0]}`),
      Scene.expect(Scene.role('button', { name: wordsFor(initial.group, 'en')[initial.numbers[0]!]! })).toHaveAttr('style', `--sequence-colour: ${Game.LINE_COLOURS[0]}`),
      Scene.expect(Scene.selector('svg')).toHaveAttr('aria-hidden', 'true'),
      Scene.click(Scene.role('button', { name: t('sequenceWordsReference', 'en') })),
      Scene.expect(Scene.role('list')).toExist(), Scene.Command.expectNone())
  })
})
