import { Effect, Fiber, Stream } from 'effect'
import { Scene, Story } from 'foldkit/test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as Audio from '../audio'
import { t, tf } from '../i18n'
import * as Speech from '../speech'
import * as Chinese from './chineseHandwriting'
import { BIANG_TARGET_INDEX, CHINESE_HANDWRITING_TARGETS as CHINESE_CHARACTERS } from './chineseHandwritingTargets'
import { BIANG_CHARACTER, BIANG_PINYIN, BIANG_STROKE_COUNT } from './chineseHandwritingBiang'
import { CHINESE_HANDWRITING_CATEGORIES, findChineseHandwritingGroup } from './chineseHandwritingGroups'
import { smoothChineseHandwritingPath } from './chineseHandwritingSmoothing'

const update = (model: Chinese.Model, message: Chinese.Message) => Chinese.update(model, message, 'en', false, {})
const mutedUpdate = (model: Chinese.Model, message: Chinese.Message) => Chinese.update(model, message, 'en', true, {})
const view = (model: Chinese.Model) => Chinese.view(model, 'en', true)
const feedback = [
  [{ name: 'ChineseHandwritingPlayChime' }, Chinese.SoundPlayed()],
  [{ name: 'ChineseHandwritingSpeakTarget' }, Chinese.TargetSpoken()],
] as const
const boardMounted = (revision = 0) => [{ name: 'chineseHandwritingInput' }, Chinese.PenCancelled({ id: 999, revision })] as const
const openGroup = (category: string, index = 0): Chinese.Model => {
  const [opened] = mutedUpdate(Chinese.init(), Chinese.SelectedCategory({ category }))
  return mutedUpdate(opened, Chinese.SelectedGroup({ index }))[0]
}
const target = (character: string): Chinese.Model => {
  const index = CHINESE_CHARACTERS.findIndex(entry => entry.character === character)
  expect(index).toBeGreaterThanOrEqual(0)
  return mutedUpdate(Chinese.init(), Chinese.SelectedTarget({ index }))[0]
}
const traceMessages = (model: Chinese.Model, releaseLast = true): Chinese.Message[] => {
  const strokes = Chinese.currentGuide(model).strokes
  return strokes.flatMap((stroke, id) => [
    Chinese.PenStarted({ id, ...stroke[0]!, revision: model.revision }),
    ...Array.from({ length: Math.ceil((stroke.length - 1) / 256) }, (_, batch) => Chinese.PenMoved({ id, points: stroke.slice(1 + batch * 256, 1 + (batch + 1) * 256), revision: model.revision })),
    ...(releaseLast || id < strokes.length - 1 ? [Chinese.PenEnded({ id, revision: model.revision })] : []),
  ])
}
const traced = (model: Chinese.Model, releaseLast = true): Chinese.Model => {
  let result = model
  Story.story(mutedUpdate, Story.with(model),
    ...traceMessages(model, releaseLast).flatMap(message => [Story.message(message), Story.Command.expectNone()]),
    Story.model(next => { result = next }),
    Story.Command.expectNone(),
  )
  return result
}

afterEach(() => vi.restoreAllMocks())

describe('Chinese handwriting directed stroke practice', () => {
  it('starts with a single simplified character and a fresh tracing board', () => {
    const model = Chinese.init()
    expect(Chinese.currentGuide(model).text).toBe('一')
    expect(model).toMatchObject({ targetIndex: 0, targetPage: 0, choicePage: 0, randomRequest: 0, revision: 0, contacts: [], pen: null, celebrated: false })
    expect(model.progress).toEqual([0])
    expect(Chinese.completedStrokes(model)).toBe(0)
    expect(Chinese.isComplete(model)).toBe(false)
  })

  it.each(['一', '二', '口', '中', '木', '水', '火', '我', '妈', '吃', '喝', BIANG_CHARACTER])('traces %s in its supplied stroke order and celebrates only on the final release', character => {
    const model = target(character)
    const guide = Chinese.currentGuide(model)
    Story.story(update, Story.with(model),
      ...guide.strokes.flatMap((stroke, id) => [
        Story.message(Chinese.PenStarted({ id, ...stroke[0]!, revision: model.revision })),
        Story.model((next: Chinese.Model) => expect(next.contacts.map(contact => contact.stroke)).toEqual([id])),
        ...Array.from({ length: Math.ceil((stroke.length - 1) / 256) }, (_, batch) => Story.message(Chinese.PenMoved({ id, points: stroke.slice(1 + batch * 256, 1 + (batch + 1) * 256), revision: model.revision }))),
        Story.model((next: Chinese.Model) => { expect(next.progress[id]).toBe(stroke.length); expect(next.celebrated).toBe(false) }),
        Story.Command.expectNone(),
        Story.message(Chinese.PenEnded({ id, revision: model.revision })),
        id === guide.strokes.length - 1 ? Story.Command.resolveAll(...feedback) : Story.Command.expectNone(),
        Story.model((next: Chinese.Model) => { expect(Chinese.completedStrokes(next)).toBe(id + 1); expect(next.contacts).toEqual([]) }),
      ]),
      Story.model(next => { expect(Chinese.isComplete(next)).toBe(true); expect(next.celebrated).toBe(true) }),
      Story.message(Chinese.PenEnded({ id: guide.strokes.length - 1, revision: model.revision })),
      Story.message(Chinese.PenStarted({ id: 99, ...guide.strokes[0]![0]!, revision: model.revision })),
      Story.Command.expectNone(),
    )
  })

  it('requires the first horizontal of 二 before the lower horizontal and rejects starting 一 backwards', () => {
    for (const [model, start] of [
      [target('二'), Chinese.currentGuide(target('二')).strokes[1]![0]!],
      [target('一'), Chinese.currentGuide(target('一')).strokes[0]!.at(-1)!],
    ] as const) {
      expect(update(model, Chinese.PenStarted({ id: 0, ...start, revision: model.revision }))).toEqual([model, []])
    }
  })

  it('ignores an accidental background finger while another finger traces the active stroke', () => {
    const model = target('一')
    const stroke = Chinese.currentGuide(model).strokes[0]!
    Story.story(update, Story.with(model),
      Story.message(Chinese.PenStarted({ id: 1, x: 159, y: 159, revision: model.revision })),
      Story.model(next => expect(next).toEqual(model)),
      Story.message(Chinese.PenStarted({ id: 2, ...stroke[0]!, revision: model.revision })),
      Story.message(Chinese.PenStarted({ id: 3, ...stroke[0]!, revision: model.revision })),
      Story.message(Chinese.PenMoved({ id: 1, points: stroke, revision: model.revision })),
      Story.message(Chinese.PenMoved({ id: 3, points: stroke, revision: model.revision })),
      Story.message(Chinese.PenEnded({ id: 1, revision: model.revision })),
      Story.message(Chinese.PenCancelled({ id: 3, revision: model.revision })),
      Story.message(Chinese.KeyboardPressed({ key: 'ArrowRight', revision: model.revision })),
      Story.model(next => { expect(next.contacts.map(contact => contact.id)).toEqual([2]); expect(Chinese.isComplete(next)).toBe(false) }),
      Story.message(Chinese.PenMoved({ id: 2, points: stroke.slice(1), revision: model.revision })),
      Story.Command.expectNone(),
      Story.message(Chinese.PenEnded({ id: 2, revision: model.revision })),
      Story.Command.resolveAll(...feedback),
      Story.model(next => { expect(Chinese.isComplete(next)).toBe(true); expect(next.celebrated).toBe(true) }),
      Story.Command.expectNone(),
    )
  })

  it('keeps partial ink on cancellation and permits a new finger to finish the same stroke', () => {
    const model = target('一')
    const stroke = Chinese.currentGuide(model).strokes[0]!
    const middle = Math.floor(stroke.length / 2)
    let progress = 0
    Story.story(update, Story.with(model),
      Story.message(Chinese.PenStarted({ id: 1, ...stroke[0]!, revision: model.revision })),
      Story.message(Chinese.PenMoved({ id: 1, points: stroke.slice(1, middle), revision: model.revision })),
      Story.model(next => { progress = next.progress[0]!; expect(progress).toBeGreaterThan(0); expect(progress).toBeLessThan(stroke.length) }),
      Story.message(Chinese.PenCancelled({ id: 1, revision: model.revision })),
      Story.model(next => { expect(next.progress[0]).toBe(progress); expect(next.contacts).toEqual([]); expect(next.celebrated).toBe(false) }),
      Story.Command.expectNone(),
      Story.message(Chinese.PenStarted({ id: 2, ...stroke[middle - 1]!, revision: model.revision })),
      Story.message(Chinese.PenMoved({ id: 2, points: stroke.slice(middle), revision: model.revision })),
      Story.message(Chinese.PenEnded({ id: 2, revision: model.revision })),
      Story.Command.resolveAll(...feedback),
      Story.model(next => expect(next.celebrated).toBe(true)),
      Story.Command.expectNone(),
    )
  })

  it.each(['cancel', 'navigate'] as const)('requires a successful final release after a fully traced stroke is interrupted by %s', reason => {
    const held = traced(target('一'), false)
    const stroke = Chinese.currentGuide(held).strokes[0]!
    const interrupted = reason === 'cancel' ? update(held, Chinese.PenCancelled({ id: 0, revision: held.revision }))[0] : Chinese.interrupt(held)
    expect(interrupted.celebrated).toBe(false)
    expect(interrupted.contacts).toEqual([])
    expect(Chinese.isComplete(interrupted)).toBe(false)
    Story.story(update, Story.with(interrupted),
      Story.message(Chinese.PenStarted({ id: 2, ...stroke.at(-1)!, revision: interrupted.revision })),
      Story.Command.expectNone(),
      Story.message(Chinese.PenEnded({ id: 2, revision: interrupted.revision })),
      Story.Command.resolveAll(...feedback),
      Story.model(next => expect(next.celebrated).toBe(true)),
      Story.Command.expectNone(),
    )
  })

  it('rejects malformed contacts and move batches without losing an active trace', () => {
    const model = target('一')
    const stroke = Chinese.currentGuide(model).strokes[0]!
    for (const id of [-1, .5, NaN, Infinity]) expect(update(model, Chinese.PenStarted({ id, ...stroke[0]!, revision: model.revision }))).toEqual([model, []])
    for (const coordinate of [NaN, Infinity, 10000]) expect(update(model, Chinese.PenStarted({ id: 1, x: coordinate, y: stroke[0]!.y, revision: model.revision }))).toEqual([model, []])
    const [held] = update(model, Chinese.PenStarted({ id: 1, ...stroke[0]!, revision: model.revision }))
    for (const points of [[], Array.from({ length: 257 }, () => stroke[0]!), [{ x: NaN, y: 80 }], [{ x: 80, y: Infinity }]])
      expect(update(held, Chinese.PenMoved({ id: 1, points, revision: model.revision }))).toEqual([held, []])
    expect(update(held, Chinese.PenStarted({ id: 1, ...stroke[0]!, revision: model.revision }))).toEqual([held, []])
  })
})

describe('Chinese handwriting selection, keyboard, and speech', () => {
  it('opens the category and small group containing a directly selected character', () => {
    const model = traced(target('一'))
    const index = CHINESE_CHARACTERS.length - 1
    const location = findChineseHandwritingGroup(index)!
    Story.story(mutedUpdate, Story.with(model),
      Story.message(Chinese.SelectedTarget({ index })),
      Story.model(next => {
        expect(next).toMatchObject({ category: location.categoryId, targetPage: location.groupIndex, targetIndex: index, revision: model.revision + 1, celebrated: false })
        expect(next.progress.every(value => value === 0)).toBe(true)
        expect(Chinese.currentGroup(next).indices).toContain(index)
        expect(Chinese.visibleChoices(next)).toContain(index)
      }),
      Story.Command.expectNone(),
    )
    for (const index of [-1, .5, NaN, Infinity, CHINESE_CHARACTERS.length, 0]) expect(update(model, Chinese.SelectedTarget({ index }))).toEqual([model, []])
  })

  it('keeps next and previous character navigation inside every selected group', () => {
    for (const category of CHINESE_HANDWRITING_CATEGORIES) for (const [groupIndex, group] of category.groups.entries()) {
      const first = group.indices[0]!
      const last = group.indices.at(-1)!
      const model = openGroup(category.id, groupIndex)
      const [previous, previousCommands] = mutedUpdate(model, Chinese.PreviousTarget())
      expect(previous.targetIndex).toBe(last)
      expect(previous.category).toBe(model.category)
      expect(previous.targetPage).toBe(model.targetPage)
      expect(previousCommands).toEqual([])
      const [wrapped, nextCommands] = mutedUpdate(previous, Chinese.NextTarget())
      expect(wrapped.targetIndex).toBe(first)
      expect(wrapped.category).toBe(model.category)
      expect(wrapped.targetPage).toBe(model.targetPage)
      expect(nextCommands).toEqual([])
    }
  })

  it('changes categories and groups directly with a fresh first character and choice page', () => {
    const category = CHINESE_HANDWRITING_CATEGORIES.find(entry => entry.groups.length > 1)!
    const completed = traced(target('一'))
    const [opened, commands] = update(completed, Chinese.SelectedCategory({ category: category.id }))
    expect(commands).toEqual([])
    expect(opened).toMatchObject({ category: category.id, targetPage: 0, choicePage: 0, targetIndex: category.groups[0]!.indices[0], celebrated: false, contacts: [], pen: null })
    expect(opened.revision).toBe(completed.revision + 1)
    expect(opened.progress.every(value => value === 0)).toBe(true)
    Story.story(mutedUpdate, Story.with(opened),
      Story.message(Chinese.NextTargetPage()),
      Story.model(next => expect(next).toMatchObject({ category: category.id, targetPage: 0, choicePage: 1, revision: opened.revision })),
      Story.message(Chinese.SelectedGroup({ index: 1 })),
      Story.model(next => expect(next).toMatchObject({ category: category.id, targetPage: 1, choicePage: 0, targetIndex: category.groups[1]!.indices[0], revision: opened.revision + 1 })),
      Story.message(Chinese.SelectedGroup({ index: category.groups.length - 1 })),
      Story.model(next => {
        expect(next.targetPage).toBe(category.groups.length - 1)
        expect(next.choicePage).toBe(0)
        expect(next.targetIndex).toBe(category.groups.at(-1)!.indices[0])
      }),
      Story.Command.expectNone(),
    )
    expect(update(opened, Chinese.SelectedCategory({ category: category.id }))).toEqual([opened, []])
    for (const invalid of ['', 'unknown', '__proto__', 'constructor']) expect(update(opened, Chinese.SelectedCategory({ category: invalid }))).toEqual([opened, []])
    for (const index of [-1, .5, NaN, Infinity, category.groups.length, 0]) expect(update(opened, Chinese.SelectedGroup({ index }))).toEqual([opened, []])
  })

  it('keeps themed characters in the selected stroke-count category during selection, restart, and random practice', () => {
    const category = CHINESE_HANDWRITING_CATEGORIES.find(entry => entry.id === 'stroke-2')!
    const opened = openGroup(category.id)
    const index = category.groups[0]!.indices.find(index => index !== opened.targetIndex && findChineseHandwritingGroup(index)!.categoryId !== category.id)!
    expect(index).toBeDefined()
    const [selected] = update(opened, Chinese.SelectedTarget({ index }))
    expect(selected).toMatchObject({ category: category.id, targetPage: 0, targetIndex: index })
    expect(Chinese.visibleChoices(selected)).toContain(index)
    const [restarted] = update(selected, Chinese.Restarted())
    expect(restarted).toMatchObject({ category: category.id, targetPage: 0, targetIndex: index })
    Story.story(mutedUpdate, Story.with(opened),
      Story.message(Chinese.RandomTarget()),
      Story.Command.resolveAll([{ name: 'ChineseHandwritingChooseRandom' }, Chinese.RandomTargetSelected({ index, revision: opened.revision, request: opened.randomRequest + 1 })]),
      Story.model(next => {
        expect(next).toMatchObject({ category: category.id, targetPage: 0, targetIndex: index })
        expect(Chinese.visibleChoices(next)).toContain(index)
      }),
      Story.Command.expectNone(),
    )
  })

  it('can explicitly switch to a second membership even when it starts with the same displayed character', () => {
    const completed = traced(target('一'))
    const [opened, commands] = update(completed, Chinese.SelectedCategory({ category: 'stroke-1' }))
    expect(opened).toMatchObject({ category: 'stroke-1', targetPage: 0, choicePage: 0, targetIndex: completed.targetIndex, celebrated: false })
    expect(opened.progress.every(value => value === 0)).toBe(true)
    expect(opened.revision).toBe(completed.revision + 1)
    expect(commands).toEqual([])
  })

  it('chooses an explicitly requested group even when its first character has a different canonical home', () => {
    const location = CHINESE_HANDWRITING_CATEGORIES.flatMap(category => category.groups.map((group, groupIndex) => ({ category, group, groupIndex })))
      .find(({ category, group, groupIndex }) => groupIndex > 0 && findChineseHandwritingGroup(group.indices[0]!)!.categoryId !== category.id)!
    expect(location).toBeDefined()
    const opened = openGroup(location.category.id)
    const [selected] = update(opened, Chinese.SelectedGroup({ index: location.groupIndex }))
    expect(selected).toMatchObject({ category: location.category.id, targetPage: location.groupIndex, choicePage: 0, targetIndex: location.group.indices[0] })
    expect(Chinese.visibleChoices(selected)).toContain(location.group.indices[0])
    const [direct] = update(opened, Chinese.SelectedTarget({ index: location.group.indices[0]! }))
    expect(direct).toMatchObject({ category: location.category.id, targetPage: location.groupIndex, choicePage: 0, targetIndex: location.group.indices[0] })
  })

  it('keeps an overlapping themed character in the chosen component category', () => {
    const location = CHINESE_HANDWRITING_CATEGORIES.flatMap(category => category.groups.map((group, groupIndex) => ({ category, group, groupIndex })))
      .find(({ category, group }) => 'component' in category && group.indices.some((index, position) => position > 0 && findChineseHandwritingGroup(index)!.categoryId !== category.id))!
    expect(location).toBeDefined()
    const opened = openGroup(location.category.id, location.groupIndex)
    const index = location.group.indices.find(index => index !== opened.targetIndex && findChineseHandwritingGroup(index)!.categoryId !== location.category.id)!
    const [selected] = update(opened, Chinese.SelectedTarget({ index }))
    expect(selected).toMatchObject({ category: location.category.id, targetPage: location.groupIndex, targetIndex: index })
    expect(Chinese.visibleChoices(selected)).toContain(index)
    expect(update(selected, Chinese.Restarted())[0].category).toBe(location.category.id)
  })

  it('paginates only the selected group, covering every choice and wrapping in both directions', () => {
    for (const category of CHINESE_HANDWRITING_CATEGORIES) for (const [groupIndex, group] of category.groups.entries()) {
      let model = openGroup(category.id, groupIndex)
      const original = model
      const pageCount = Math.ceil(group.indices.length / Chinese.CHINESE_HANDWRITING_CHOICES_PER_PAGE)
      const seen: number[] = []
      for (let page = 0; page < pageCount; page++) {
        expect(model.choicePage).toBe(page)
        const choices = Chinese.visibleChoices(model)
        expect(choices.length).toBeGreaterThan(0)
        expect(choices.length).toBeLessThanOrEqual(6)
        seen.push(...choices)
        const [next, commands] = mutedUpdate(model, Chinese.NextTargetPage())
        expect(commands).toEqual([])
        expect(next.category).toBe(original.category)
        expect(next.targetPage).toBe(original.targetPage)
        expect(next.targetIndex).toBe(original.targetIndex)
        expect(next.progress).toBe(original.progress)
        expect(next.revision).toBe(original.revision)
        model = next
      }
      expect(seen).toEqual(group.indices)
      expect(model.choicePage).toBe(0)
      const [previous] = mutedUpdate(model, Chinese.PreviousTargetPage())
      expect(previous.choicePage).toBe(pageCount - 1)
      expect(previous.targetPage).toBe(original.targetPage)
      expect(mutedUpdate(previous, Chinese.NextTargetPage())[0].choicePage).toBe(0)
    }
  })

  it('keeps active ink and its contact alive while paging the choices', () => {
    const initial = Chinese.init()
    const stroke = Chinese.currentGuide(initial).strokes[0]!
    const middle = Math.floor(stroke.length / 2)
    Story.story(update, Story.with(initial),
      Story.message(Chinese.PenStarted({ id: 4, ...stroke[0]!, revision: 0 })),
      Story.message(Chinese.PenMoved({ id: 4, points: stroke.slice(1, middle), revision: 0 })),
      Story.message(Chinese.NextTargetPage()),
      Story.model(next => {
        expect(next).toMatchObject({ choicePage: 1, targetPage: 0, targetIndex: 0, revision: 0 })
        expect(next.contacts.map(contact => contact.id)).toEqual([4])
        expect(next.progress[0]).toBeGreaterThan(0)
      }),
      Story.Command.expectNone(),
      Story.message(Chinese.PenMoved({ id: 4, points: stroke.slice(middle), revision: 0 })),
      Story.message(Chinese.PenEnded({ id: 4, revision: 0 })),
      Story.Command.resolveAll(...feedback),
      Story.message(Chinese.PreviousTargetPage()),
      Story.model(next => {
        expect(next.choicePage).toBe(0)
        expect(next.celebrated).toBe(true)
        expect(Chinese.isComplete(next)).toBe(true)
      }),
      Story.Command.expectNone(),
    )
  })

  it.each([0, .5, .9999999])('randomly chooses a different character for random sample %s', async sample => {
    vi.spyOn(Math, 'random').mockReturnValue(sample)
    for (const model of [Chinese.init(), target('木'), update(Chinese.init(), Chinese.PreviousTarget())[0]]) {
      const [requested, commands] = update(model, Chinese.RandomTarget())
      expect(commands.map(command => command.name)).toEqual(['ChineseHandwritingChooseRandom'])
      const result = await Effect.runPromise(commands[0]!.effect)
      const [next, effects] = update(requested, result)
      expect(next.targetIndex).not.toBe(model.targetIndex)
      expect(Chinese.currentGroup(model).indices).toContain(next.targetIndex)
      expect(next.category).toBe(model.category)
      expect(next.targetPage).toBe(model.targetPage)
      expect(next.revision).toBe(model.revision + 1)
      expect(Chinese.visibleChoices(next)).toContain(next.targetIndex)
      expect(effects).toEqual([])
      expect(update(next, result)).toEqual([next, []])
    }
  })

  it('rejects unsolicited, invalid, superseded, reset, and navigation-stale random results', () => {
    const initial = Chinese.init()
    const result = Chinese.RandomTargetSelected({ index: Chinese.currentGroup(initial).indices[1]!, revision: initial.revision, request: 1 })
    expect(update(initial, { ...result, request: 0 })).toEqual([initial, []])
    expect(update(initial, result)).toEqual([initial, []])
    const [requested] = update(initial, Chinese.RandomTarget())
    for (const index of [-1, .5, NaN, Infinity, CHINESE_CHARACTERS.length, 0]) expect(update(requested, { ...result, index })).toEqual([requested, []])
    const [again] = update(requested, Chinese.RandomTarget())
    expect(update(again, result)).toEqual([again, []])
    for (const message of [Chinese.Restarted(), Chinese.NextTarget(), Chinese.PreviousTarget(), Chinese.SelectedTarget({ index: 9 })]) {
      const [changed] = update(requested, message)
      expect(update(changed, result)).toEqual([changed, []])
    }
    const interrupted = Chinese.interrupt(requested)
    expect(update(interrupted, result)).toEqual([interrupted, []])
    const outside = CHINESE_CHARACTERS.findIndex((_entry, index) => !Chinese.currentGroup(initial).indices.includes(index))
    expect(update(requested, { ...result, index: outside })).toEqual([requested, []])
  })

  it('reveals an off-page random choice after browsing without changing the selected group', () => {
    const initial = Chinese.init()
    const index = Chinese.currentGroup(initial).indices.at(-1)!
    const [requested] = update(initial, Chinese.RandomTarget())
    const [paged] = update(requested, Chinese.NextTargetPage())
    const [chosen, commands] = update(paged, Chinese.RandomTargetSelected({ index, revision: initial.revision, request: requested.randomRequest }))
    expect(chosen.targetIndex).toBe(index)
    expect(chosen.category).toBe(initial.category)
    expect(chosen.targetPage).toBe(initial.targetPage)
    expect(Chinese.visibleChoices(chosen)).toContain(index)
    expect(commands).toEqual([])
  })

  it('invalidates active tracing and random results when changing a category or group', () => {
    const category = CHINESE_HANDWRITING_CATEGORIES.find(entry => entry.groups.length > 1)!
    const [opened] = update(Chinese.init(), Chinese.SelectedCategory({ category: category.id }))
    const stroke = Chinese.currentGuide(opened).strokes[0]!
    const [held] = update(opened, Chinese.PenStarted({ id: 7, ...stroke[0]!, revision: opened.revision }))
    const [requested] = update(held, Chinese.RandomTarget())
    const result = Chinese.RandomTargetSelected({ index: Chinese.currentGroup(opened).indices[1]!, revision: opened.revision, request: requested.randomRequest })
    const otherCategory = CHINESE_HANDWRITING_CATEGORIES.find(entry => entry.id !== category.id)!
    for (const message of [Chinese.SelectedCategory({ category: otherCategory.id }), Chinese.SelectedGroup({ index: 1 })]) {
      const [changed, commands] = update(requested, message)
      expect(commands).toEqual([])
      expect(changed.contacts).toEqual([])
      expect(changed.pen).toBeNull()
      expect(changed.progress.every(value => value === 0)).toBe(true)
      expect(changed.revision).toBe(opened.revision + 1)
      for (const stale of [result, Chinese.PenMoved({ id: 7, points: stroke.slice(1), revision: opened.revision }), Chinese.PenEnded({ id: 7, revision: opened.revision })]) expect(update(changed, stale)).toEqual([changed, []])
    }
  })

  it('resolves a failed random generator by selecting the next character', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('unavailable') })
    const [requested, commands] = update(Chinese.init(), Chinese.RandomTarget())
    const result = await Effect.runPromise(commands[0]!.effect)
    const expected = Chinese.currentGroup(Chinese.init()).indices[1]!
    expect(result).toEqual(Chinese.RandomTargetSelected({ index: expected, revision: 0, request: 1 }))
    expect(update(requested, result)[0].targetIndex).toBe(expected)
  })

  it('keeps a one-character group stable and disables random selection instead of escaping it', () => {
    const singleton = CHINESE_HANDWRITING_CATEGORIES.flatMap(category => category.groups.map((group, index) => ({ category: category.id, index, group })))
      .find(({ group }) => group.indices.length === 1)
    expect(singleton).toBeDefined()
    const model = openGroup(singleton!.category, singleton!.index)
    expect(update(model, Chinese.RandomTarget())).toEqual([model, []])
    expect(update(model, Chinese.NextTargetPage())).toEqual([model, []])
    expect(update(model, Chinese.PreviousTargetPage())).toEqual([model, []])
    Scene.scene({ update: mutedUpdate, view }, Scene.with(model),
      Scene.Mount.resolveAll(boardMounted(model.revision)),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-choice')).toHaveCount(1),
      Scene.expect(Scene.role('button', { name: t('handwritingRandom', 'en') })).toBeDisabled(),
      Scene.expectAll(Scene.all.role('button', { name: t('handwritingPrevious', 'en') })).toBeEmpty(),
      Scene.expectAll(Scene.all.role('button', { name: t('handwritingNext', 'en') })).toBeEmpty(),
      Scene.Command.expectNone(),
    )
  })

  it('omits pagination controls when all characters in a small group already fit on one page', () => {
    const location = CHINESE_HANDWRITING_CATEGORIES.flatMap(category => category.groups.map((group, index) => ({ category, group, index })))
      .find(({ group }) => group.indices.length > 1 && group.indices.length <= Chinese.CHINESE_HANDWRITING_CHOICES_PER_PAGE)!
    expect(location).toBeDefined()
    const model = openGroup(location.category.id, location.index)
    expect(update(model, Chinese.NextTargetPage())).toEqual([model, []])
    expect(update(model, Chinese.PreviousTargetPage())).toEqual([model, []])
    Scene.scene({ update: mutedUpdate, view }, Scene.with(model),
      Scene.Mount.resolveAll(boardMounted(model.revision)),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-choice')).toHaveCount(location.group.indices.length),
      Scene.expectAll(Scene.all.role('button', { name: t('handwritingPrevious', 'en') })).toBeEmpty(),
      Scene.expectAll(Scene.all.role('button', { name: t('handwritingNext', 'en') })).toBeEmpty(),
      Scene.expect(Scene.role('button', { name: t('handwritingRandom', 'en') })).not.toBeDisabled(),
      Scene.Command.expectNone(),
    )
  })

  it('invalidates queued contact and keyboard events after restart or navigation, preserving saved ink on navigation', () => {
    const model = target('一')
    const stroke = Chinese.currentGuide(model).strokes[0]!
    const [held] = update(model, Chinese.PenStarted({ id: 1, ...stroke[0]!, revision: model.revision }))
    const [partial] = update(held, Chinese.PenMoved({ id: 1, points: stroke.slice(1, Math.floor(stroke.length / 2)), revision: model.revision }))
    const interrupted = Chinese.interrupt(partial)
    expect(interrupted.progress).toEqual(partial.progress)
    const [restarted] = update(partial, Chinese.Restarted())
    expect(restarted.progress.every(value => value === 0)).toBe(true)
    for (const current of [interrupted, restarted]) {
      for (const message of [
        Chinese.PenStarted({ id: 2, ...stroke[0]!, revision: model.revision }), Chinese.PenMoved({ id: 1, points: stroke.slice(1), revision: model.revision }),
        Chinese.PenEnded({ id: 1, revision: model.revision }), Chinese.PenCancelled({ id: 1, revision: model.revision }),
        Chinese.KeyboardPressed({ key: 'ArrowRight', revision: model.revision }), Chinese.KeyboardLifted({ revision: model.revision }),
      ]) expect(update(current, message)).toEqual([current, []])
    }
  })

  it('traces with keyboard arrows and waits for Enter before celebrating the final stroke', () => {
    let model = Chinese.init()
    const revision = model.revision
    for (const key of ['Tab', 'Escape', 'constructor', '__proto__', 'toString']) expect(update(model, Chinese.KeyboardPressed({ key, revision }))).toEqual([model, []])
    for (let count = 0; !Chinese.isComplete(model) && count < 40; count++) {
      const [next, commands] = update(model, Chinese.KeyboardPressed({ key: 'ArrowRight', revision }))
      expect(commands).toEqual([])
      model = next
    }
    expect(Chinese.isComplete(model)).toBe(true)
    expect(model.celebrated).toBe(false)
    expect(model.pen).not.toBeNull()
    Story.story(update, Story.with(model),
      Story.message(Chinese.KeyboardPressed({ key: 'Enter', revision })),
      Story.Command.resolveAll(...feedback),
      Story.model(next => { expect(next.pen).toBeNull(); expect(next.celebrated).toBe(true) }),
      Story.message(Chinese.KeyboardPressed({ key: ' ', revision })),
      Story.message(Chinese.KeyboardPressed({ key: 'ArrowRight', revision })),
      Story.Command.expectNone(),
    )
  })

  it('keeps keyboard ink on blur, clears the pen, and prevents fingers from taking over that active pen', () => {
    const model = Chinese.init()
    const [pen] = update(model, Chinese.KeyboardPressed({ key: 'ArrowRight', revision: 0 }))
    expect(pen.pen).not.toBeNull()
    const point = Chinese.currentGuide(pen).strokes[0]![pen.progress[0]!]!
    expect(update(pen, Chinese.PenStarted({ id: 1, ...point, revision: 0 }))).toEqual([pen, []])
    const [blurred, commands] = update(pen, Chinese.KeyboardLifted({ revision: 0 }))
    expect(blurred.pen).toBeNull()
    expect(blurred.progress).toBe(pen.progress)
    expect(commands).toEqual([])
  })

  it('lets a finger finish and hear a character after a completed keyboard stroke loses focus', () => {
    let model = Chinese.init()
    for (let count = 0; !Chinese.isComplete(model) && count < 40; count++) {
      model = update(model, Chinese.KeyboardPressed({ key: 'ArrowRight', revision: 0 }))[0]
    }
    expect(Chinese.isComplete(model)).toBe(true)
    const endpoint = Chinese.currentGuide(model).strokes[0]!.at(-1)!
    Story.story(update, Story.with(model),
      Story.message(Chinese.KeyboardLifted({ revision: 0 })),
      Story.model(next => { expect(Chinese.isComplete(next)).toBe(false); expect(next.pen).toBeNull() }),
      Story.Command.expectNone(),
      Story.message(Chinese.PenStarted({ id: 9, ...endpoint, revision: 0 })),
      Story.message(Chinese.PenEnded({ id: 9, revision: 0 })),
      Story.Command.resolveAll(...feedback),
      Story.model(next => { expect(Chinese.isComplete(next)).toBe(true); expect(next.celebrated).toBe(true) }),
      Story.Command.expectNone(),
    )
  })

  it.each([false, true])('uses Mandarin and root voice settings, with mute=%s', async muted => {
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    const held = traced(target('妈'), false)
    const last = held.contacts[0]!
    const [complete, commands] = Chinese.update(held, Chinese.PenEnded({ id: last.id, revision: held.revision }), 'fr', muted, { rate: .65, pitch: 1.35, lang: 'fr' })
    expect(Chinese.isComplete(complete)).toBe(true)
    expect(complete.celebrated).toBe(true)
    if (muted) {
      expect(commands).toEqual([])
      expect(speak).not.toHaveBeenCalled()
    } else {
      const command = commands.find(command => command.name === 'ChineseHandwritingSpeakTarget')!
      expect(await Effect.runPromise(command.effect)).toEqual(Chinese.TargetSpoken())
      expect(speak).toHaveBeenCalledExactlyOnceWith('妈', { rate: .65, pitch: 1.35, lang: 'zh-CN' })
    }
  })

  it('acknowledges rejected sound and speech APIs without losing the finished character', async () => {
    vi.spyOn(Audio, 'chime').mockReturnValue({ name: 'PlayChime', effect: Effect.die(new Error('audio unavailable')) })
    vi.spyOn(Speech, 'speakNow').mockImplementation(() => { throw new Error('speech unavailable') })
    const held = traced(Chinese.init(), false)
    const [complete, commands] = update(held, Chinese.PenEnded({ id: 0, revision: 0 }))
    expect(complete.celebrated).toBe(true)
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Chinese.SoundPlayed())
    expect(await Effect.runPromise(commands[1]!.effect)).toEqual(Chinese.TargetSpoken())
    expect(update(complete, Chinese.SoundPlayed())).toEqual([complete, []])
    expect(update(complete, Chinese.TargetSpoken())).toEqual([complete, []])
  })
})

describe('Chinese handwriting accessible controls', () => {
  it('offers Biang in a dedicated section and draws the special glyph without a font or image', () => {
    const opened = openGroup('biang')
    expect(opened).toMatchObject({ category: 'biang', targetIndex: BIANG_TARGET_INDEX, choicePage: 0, targetPage: 0 })
    expect(Chinese.currentGuide(opened).strokes).toHaveLength(BIANG_STROKE_COUNT)
    Scene.scene({ update: mutedUpdate, view }, Scene.with(Chinese.init()),
      Scene.Mount.resolveAll(boardMounted()),
      Scene.expect(Scene.selector('optgroup[label^="Special"]')).toHaveAttr('label', t('chineseHandwritingSpecial', 'en')),
      Scene.change(Scene.role('combobox', { name: t('chineseHandwritingCategory', 'en') }), 'biang'),
      Scene.expect(Scene.role('button', { name: t('chineseHandwritingBiangLabel', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('application', { name: tf('handwritingBoard', 'en', BIANG_PINYIN) })).toHaveAttr('data-special', 'biang'),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-biang-glyph')).toHaveCount(2),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-choice--biang .chinese-handwriting-biang-glyph path')).not.toHaveCount(0),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-target .chinese-handwriting-biang-glyph path')).not.toHaveCount(0),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-guide')).toHaveCount(BIANG_STROKE_COUNT),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-biang-glyph[aria-hidden="true"][focusable="false"]')).toHaveCount(2),
      Scene.expectAll(Scene.all.selector('img')).toBeEmpty(),
      Scene.expect(Scene.selector('.chinese-handwriting-pinyin')).toHaveText(BIANG_PINYIN),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-pagination')).toBeEmpty(),
      Scene.expect(Scene.role('button', { name: t('handwritingRandom', 'en') })).toBeDisabled(),
      Scene.Command.expectNone(),
    )
  })

  it('keeps the special target inside an explicitly chosen overlapping category', () => {
    for (const category of ['biang', `stroke-${BIANG_STROKE_COUNT}`, 'component-162']) {
      const location = findChineseHandwritingGroup(BIANG_TARGET_INDEX, category)!
      const opened = openGroup(category, location.groupIndex)
      const [selected] = mutedUpdate(opened, Chinese.SelectedTarget({ index: BIANG_TARGET_INDEX }))
      expect(selected).toMatchObject({ category, targetPage: location.groupIndex, targetIndex: BIANG_TARGET_INDEX })
      const [restarted] = mutedUpdate(selected, Chinese.Restarted())
      expect(restarted).toMatchObject({ category, targetPage: location.groupIndex, targetIndex: BIANG_TARGET_INDEX })
      expect(Chinese.visibleChoices(restarted)).toContain(BIANG_TARGET_INDEX)
    }
  })

  it('speaks Biang using its phonetic fallback on completion', async () => {
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    const held = traced(target(BIANG_CHARACTER), false)
    const contact = held.contacts[0]!
    const [completed, commands] = Chinese.update(held, Chinese.PenEnded({ id: contact.id, revision: held.revision }), 'fr', false, { rate: .7, pitch: 1.3 })
    expect(completed.celebrated).toBe(true)
    const speech = commands.find(command => command.name === 'ChineseHandwritingSpeakTarget')!
    expect(await Effect.runPromise(speech.effect)).toEqual(Chinese.TargetSpoken())
    expect(speak).toHaveBeenCalledExactlyOnceWith(BIANG_PINYIN, { rate: .7, pitch: 1.3, lang: 'zh-CN' })
  })

  it('uses the approved stronger renderer for guides, growing ink, and its highlight without changing tracing points', () => {
    const model = target('猫')
    const guide = Chinese.currentGuide(model)
    const stroke = guide.strokes[0]!
    const originalPoints = JSON.stringify(stroke)
    const strong = smoothChineseHandwritingPath(stroke, 'strong')
    expect(strong).not.toBe(smoothChineseHandwritingPath(stroke, 'gentle'))
    Scene.scene({ update: mutedUpdate, view }, Scene.with(model),
      Scene.Mount.resolveAll(boardMounted(model.revision)),
      Scene.expect(Scene.selector('.chinese-handwriting-guide[data-active="true"]')).toHaveAttr('d', strong),
      Scene.Command.expectNone(),
    )
    const progress = guide.strokes.map(() => 0)
    progress[0] = Math.max(2, Math.floor(stroke.length * .8))
    const partial = { ...model, progress }
    const ink = smoothChineseHandwritingPath(stroke.slice(0, progress[0]), 'strong')
    Scene.scene({ update: mutedUpdate, view }, Scene.with(partial),
      Scene.Mount.resolveAll(boardMounted(model.revision)),
      Scene.expect(Scene.selector('.chinese-handwriting-ink')).toHaveAttr('d', ink),
      Scene.expect(Scene.selector('.handwriting-ink-highlight')).toHaveAttr('d', ink),
      Scene.Command.expectNone(),
    )
    expect(Chinese.currentGuide(partial)).toBe(guide)
    expect(JSON.stringify(stroke)).toBe(originalPoints)
  })

  it('shows six native character choices and one working pagination pair without group buttons', () => {
    const initial = Chinese.init()
    const group = Chinese.currentGroup(initial)
    Scene.scene({ update: mutedUpdate, view }, Scene.with(Chinese.init()),
      Scene.Mount.resolveAll(boardMounted()),
      Scene.expect(Scene.role('heading', { name: t('chineseHandwritingTitle', 'en') })).toBeVisible(),
      Scene.expect(Scene.role('group', { name: t('chineseHandwritingCharacters', 'en') })).toBeVisible(),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-choice')).toHaveCount(6),
      Scene.expect(Scene.role('combobox', { name: t('chineseHandwritingCategory', 'en') })).toHaveAttr('value', initial.category),
      Scene.expectAll(Scene.all.role('button', { name: t('handwritingPrevious', 'en') })).toHaveCount(1),
      Scene.expectAll(Scene.all.role('button', { name: t('handwritingNext', 'en') })).toHaveCount(1),
      Scene.expect(Scene.role('button', { name: t('handwritingPrevious', 'en') })).not.toBeDisabled(),
      Scene.expect(Scene.role('button', { name: t('handwritingNext', 'en') })).not.toBeDisabled(),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-group-actions')).toBeEmpty(),
      Scene.expect(Scene.role('button', { name: '一' })).toHaveAttr('aria-pressed', 'true'),
      ...['.handwriting-modes', '.handwriting-cases', '.handwriting-mode', '.handwriting-case'].map(selector => Scene.expectAll(Scene.all.selector(selector)).toBeEmpty()),
      Scene.expect(Scene.role('application', { name: tf('handwritingBoard', 'en', '一') })).toHaveAttr('tabindex', '0'),
      Scene.expect(Scene.selector('.chinese-handwriting-board')).toHaveAccessibleDescription(t('handwritingKeyboardHint', 'en')),
      Scene.expect(Scene.selector('.chinese-handwriting-board')).toHaveAttr('viewBox', '0 0 160 160'),
      Scene.expect(Scene.selector('.chinese-handwriting-page')).toHaveAttr('data-multitouch-scroll', 'true'),
      Scene.expect(Scene.selector('.chinese-handwriting-target')).toHaveAttr('lang', 'zh-CN'),
      Scene.expectAll(Scene.all.selector('.handwriting-start')).toHaveCount(1),
      Scene.expectAll(Scene.all.selector('.handwriting-stroke-number')).toHaveCount(1),
      Scene.expect(Scene.selector('.handwriting-stroke-number')).toHaveText('1'),
      Scene.expect(Scene.selector('g')).toHaveAttr('aria-hidden', 'true'),
      Scene.expect(Scene.selector('.handwriting-feedback[role="status"][aria-live="polite"]')).toHaveText(tf('handwritingProgress', 'en', '0', '1')),
      Scene.click(Scene.role('button', { name: CHINESE_CHARACTERS[group.indices[1]!]!.character })),
      Scene.expect(Scene.role('button', { name: CHINESE_CHARACTERS[group.indices[1]!]!.character })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.selector('.chinese-handwriting-board')).toHaveAttr('data-handwriting-revision', '1'),
      Scene.click(Scene.role('button', { name: t('handwritingRandom', 'en') })),
      Scene.Command.resolveAll([{ name: 'ChineseHandwritingChooseRandom' }, Chinese.RandomTargetSelected({ index: group.indices.at(-1)!, revision: 1, request: 1 })]),
      Scene.expect(Scene.role('button', { name: CHINESE_CHARACTERS[group.indices.at(-1)!]!.character })).toHaveAttr('aria-pressed', 'true'),
      Scene.Command.expectNone(),
    )
    expect(group.indices.length).toBeLessThanOrEqual(20)
  })

  it('lets next and previous cycle the choices within Numbers while keeping the displayed tracing target', () => {
    const group = Chinese.currentGroup(Chinese.init())
    const lastPage = Math.ceil(group.indices.length / Chinese.CHINESE_HANDWRITING_CHOICES_PER_PAGE) - 1
    const finalPage = group.indices.slice(lastPage * Chinese.CHINESE_HANDWRITING_CHOICES_PER_PAGE)
    Scene.scene({ update: mutedUpdate, view }, Scene.with(Chinese.init()),
      Scene.Mount.resolveAll(boardMounted()),
      Scene.expect(Scene.role('button', { name: '一' })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.selector('.chinese-handwriting-page-count[role="status"][aria-live="polite"]')).toHaveText(tf('chineseHandwritingChoicePage', 'en', '1', String(lastPage + 1))),
      Scene.click(Scene.role('button', { name: t('handwritingNext', 'en') })),
      Scene.expect(Scene.selector('.chinese-handwriting-page-count')).toHaveText(tf('chineseHandwritingChoicePage', 'en', '2', String(lastPage + 1))),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-choice')).toHaveCount(6),
      Scene.expect(Scene.role('button', { name: CHINESE_CHARACTERS[group.indices[6]!]!.character })).toBeVisible(),
      Scene.expectAll(Scene.all.role('button', { name: '一' })).toBeEmpty(),
      Scene.expect(Scene.role('application', { name: tf('handwritingBoard', 'en', '一') })).toBeVisible(),
      Scene.click(Scene.role('button', { name: t('handwritingPrevious', 'en') })),
      Scene.expect(Scene.selector('.chinese-handwriting-page-count')).toHaveText(tf('chineseHandwritingChoicePage', 'en', '1', String(lastPage + 1))),
      Scene.expect(Scene.role('button', { name: '一' })).toHaveAttr('aria-pressed', 'true'),
      Scene.click(Scene.role('button', { name: t('handwritingPrevious', 'en') })),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-choice')).toHaveCount(finalPage.length),
      Scene.expect(Scene.role('button', { name: CHINESE_CHARACTERS[finalPage[0]!]!.character })).toBeVisible(),
      Scene.click(Scene.role('button', { name: t('handwritingNext', 'en') })),
      Scene.expect(Scene.role('button', { name: '一' })).toHaveAttr('aria-pressed', 'true'),
      Scene.Command.expectNone(),
    )
  })

  it('lets a parent choose a group from the dropdown and then page only within that group', () => {
    const category = CHINESE_HANDWRITING_CATEGORIES.find(entry => entry.groups.length > 1)!
    const first = category.groups[0]!.indices
    const last = category.groups.at(-1)!.indices
    Scene.scene({ update: mutedUpdate, view }, Scene.with(Chinese.init()),
      Scene.Mount.resolveAll(boardMounted()),
      Scene.change(Scene.role('combobox', { name: t('chineseHandwritingCategory', 'en') }), category.id),
      Scene.expect(Scene.role('combobox', { name: t('chineseHandwritingGroup', 'en') })).toHaveAttr('value', '0'),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-choice')).toHaveCount(Math.min(6, first.length)),
      Scene.expect(Scene.role('button', { name: CHINESE_CHARACTERS[first[0]!]!.character })).toHaveAttr('aria-pressed', 'true'),
      Scene.click(Scene.role('button', { name: t('handwritingNext', 'en') })),
      Scene.expect(Scene.role('combobox', { name: t('chineseHandwritingGroup', 'en') })).toHaveAttr('value', '0'),
      Scene.expect(Scene.role('button', { name: CHINESE_CHARACTERS[first[6]!]!.character })).toBeVisible(),
      Scene.change(Scene.role('combobox', { name: t('chineseHandwritingGroup', 'en') }), String(category.groups.length - 1)),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-choice')).toHaveCount(Math.min(6, last.length)),
      Scene.expect(Scene.role('button', { name: CHINESE_CHARACTERS[last[0]!]!.character })).toHaveAttr('aria-pressed', 'true'),
      Scene.change(Scene.role('combobox', { name: t('chineseHandwritingGroup', 'en') }), '0'),
      Scene.expect(Scene.role('button', { name: CHINESE_CHARACTERS[first[0]!]!.character })).toHaveAttr('aria-pressed', 'true'),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-group-actions')).toBeEmpty(),
      Scene.Command.expectNone(),
    )
  })

  it('offers all categories with localized accessible controls in another UI language', () => {
    Scene.scene({ update: mutedUpdate, view: (model: Chinese.Model) => Chinese.view(model, 'zh', true) }, Scene.with(Chinese.init()),
      Scene.Mount.resolveAll(boardMounted()),
      Scene.expect(Scene.role('combobox', { name: t('chineseHandwritingCategory', 'zh') })).toBeVisible(),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-category-select option')).toHaveCount(CHINESE_HANDWRITING_CATEGORIES.length),
      Scene.expect(Scene.role('button', { name: t('handwritingPrevious', 'zh') })).not.toBeDisabled(),
      Scene.expect(Scene.role('button', { name: t('handwritingNext', 'zh') })).not.toBeDisabled(),
      Scene.Command.expectNone(),
    )
  })

  it('shows one active stroke at a time, localizes the number, and keeps completion highlighted until reset', () => {
    const model = target('二')
    const first = Chinese.currentGuide(model).strokes[0]!
    let partial = model
    for (const message of [Chinese.PenStarted({ id: 0, ...first[0]!, revision: model.revision }), Chinese.PenMoved({ id: 0, points: first.slice(1), revision: model.revision }), Chinese.PenEnded({ id: 0, revision: model.revision })]) partial = mutedUpdate(partial, message)[0]
    Scene.scene({ update: mutedUpdate, view: (next: Chinese.Model) => Chinese.view(next, 'fa', true) }, Scene.with(partial),
      Scene.Mount.resolveAll(boardMounted(partial.revision)),
      Scene.expect(Scene.selector('.handwriting-stroke-number')).toHaveText('۲'),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-guide[data-active="true"]')).toHaveCount(1),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-ink')).toHaveCount(1),
      Scene.Command.expectNone(),
    )
    const complete = traced(model)
    Scene.scene({ update: mutedUpdate, view }, Scene.with(complete),
      Scene.Mount.resolveAll(boardMounted(complete.revision)),
      Scene.expect(Scene.selector('.chinese-handwriting-board')).toHaveAttr('data-complete', 'true'),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-ink')).toHaveCount(2),
      Scene.expectAll(Scene.all.selector('.handwriting-start')).toBeEmpty(),
      Scene.expectAll(Scene.all.selector('.handwriting-stroke-number')).toBeEmpty(),
      Scene.expect(Scene.selector('.handwriting-feedback')).toHaveText(t('handwritingComplete', 'en')),
      Scene.click(Scene.role('button', { name: t('handwritingAgain', 'en') })),
      Scene.expect(Scene.selector('.chinese-handwriting-board')).toHaveAttr('data-complete', 'false'),
      Scene.expectAll(Scene.all.selector('.chinese-handwriting-ink')).toBeEmpty(),
      Scene.Command.expectNone(),
    )
  })
})

describe('Chinese handwriting mounted mobile input', () => {
  it.each(['native', 'pointer', 'paired'] as const)('completes a character through the mounted %s finger stream despite an extra background finger', async input => {
    let model = Chinese.init()
    const points = Chinese.currentGuide(model).strokes[0]!
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 160 160')
    svg.setAttribute('data-handwriting-revision', String(model.revision))
    Object.defineProperty(svg, 'getScreenCTM', { value: () => null })
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 160, 160))
    svg.setPointerCapture = vi.fn()
    const listeners = vi.spyOn(svg, 'addEventListener')
    vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
    document.body.append(svg)
    const messages: Chinese.Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(Chinese.mountChineseHandwriting(svg), message => Effect.sync(() => {
      messages.push(message)
      const [next, commands] = mutedUpdate(model, message)
      expect(commands).toEqual([])
      model = next
    })))
    let stamp = 100
    const pointer = (type: string, point: typeof points[number], id = 1) => {
      const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: id, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: point.x, clientY: point.y })
      Object.defineProperty(event, 'timeStamp', { value: stamp++ })
      const eventTarget = type === 'pointerdown' || type === 'lostpointercapture' ? svg : document
      eventTarget.dispatchEvent(event)
    }
    const touch = (type: string, point: typeof points[number], id = -203274) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      const contact = { identifier: id, target: svg, clientX: point.x, clientY: point.y }
      Object.defineProperties(event, { timeStamp: { value: stamp++ }, changedTouches: { value: { length: 1, item: () => contact } } })
      const eventTarget = type === 'touchstart' ? svg : document
      eventTarget.dispatchEvent(event)
    }
    try {
      await vi.waitFor(() => expect(listeners.mock.calls.some(([name]) => name === 'touchstart')).toBe(true))
      if (input !== 'native') {
        pointer('pointerdown', points[0]!)
        pointer('lostpointercapture', points[0]!)
      }
      if (input !== 'pointer') touch('touchstart', points[0]!)
      if (input === 'pointer') pointer('pointerdown', { x: 159, y: 159 }, 2)
      else touch('touchstart', { x: 159, y: 159 }, -2)
      for (const point of points.slice(1)) {
        if (input === 'pointer') pointer('pointermove', point)
        else touch('touchmove', point)
      }
      if (input !== 'native') pointer('pointerup', points.at(-1)!)
      if (input !== 'pointer') touch('touchend', points.at(-1)!)
      if (input === 'pointer') pointer('pointercancel', { x: 159, y: 159 }, 2)
      else touch('touchcancel', { x: 159, y: 159 }, -2)
      await vi.waitFor(() => expect(model.celebrated).toBe(true))
      expect(Chinese.isComplete(model)).toBe(true)
      expect(model.contacts).toEqual([])
      expect(messages.filter(message => message._tag === 'ChineseHandwritingPenStarted')).toHaveLength(2)
      expect(messages.filter(message => message._tag === 'ChineseHandwritingPenEnded')).toHaveLength(1)
      expect(svg.setPointerCapture).not.toHaveBeenCalled()
      expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      svg.remove()
    }
  })
})
