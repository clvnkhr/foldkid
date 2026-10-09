import { Effect, Option } from 'effect'
import { Scene, Story } from 'foldkit/test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as Audio from '../audio'
import { t, tf } from '../i18n'
import * as Handwriting from './handwriting'
import { HANDWRITING_LETTERS, HANDWRITING_NUMBERS, HANDWRITING_WORDS } from './handwritingPaths'

const update = (model: Handwriting.Model, message: Handwriting.Message) => Handwriting.update(model, message, false)
const mutedUpdate = (model: Handwriting.Model, message: Handwriting.Message) => Handwriting.update(model, message, true)
const view = (model: Handwriting.Model) => Handwriting.view(model, 'en')
const sound = [{ name: 'HandwritingPlayChime' }, Handwriting.SoundPlayed()] as const
const boardMounted = (revision = 0) => [{ name: 'handwritingInput' }, Handwriting.PenCancelled({ id: 999, revision })] as const
const target = (index = 0, letterCase: 'upper' | 'lower' = 'upper', mode: 'letters' | 'words' | 'numbers' = 'letters', style: 'print' | 'cursive' = 'print'): Handwriting.Model => {
  const model = { ...Handwriting.init(), mode, letterCase, style, letterIndex: mode === 'letters' ? index : 0, wordIndex: mode === 'words' ? index : 0, numberIndex: mode === 'numbers' ? index : 0 }
  return { ...model, progress: Handwriting.currentGuide(model).strokes.map(() => 0) }
}
const traceMessages = (model: Handwriting.Model, release = true): Handwriting.Message[] =>
  Handwriting.currentGuide(model).strokes.flatMap((stroke, id) => [
    Handwriting.PenStarted({ id, ...stroke[0]!, revision: model.revision }),
    ...Array.from({ length: Math.ceil((stroke.length - 1) / 256) }, (_, batch) => Handwriting.PenMoved({ id, points: stroke.slice(1 + batch * 256, 1 + (batch + 1) * 256), revision: model.revision })),
    ...(release ? [Handwriting.PenEnded({ id, revision: model.revision })] : []),
  ])
const traced = (model: Handwriting.Model, release = true): Handwriting.Model => {
  let result = model
  Story.story(
    mutedUpdate,
    Story.with(model),
    ...traceMessages(model, release).flatMap(message => [Story.message(message), Story.Command.expectNone()]),
    Story.model(next => { result = next }),
    Story.Command.expectNone(),
  )
  return result
}

afterEach(() => vi.restoreAllMocks())

describe('Handwriting cursive and numbers', () => {
  for (const letterCase of ['upper', 'lower'] as const) {
    it.each(HANDWRITING_LETTERS.map((letter, index) => ({ letter, index })))(`traces the cursive ${letterCase} $letter to a colored completion`, ({ letter, index }) => {
      const model = target(index, letterCase, 'letters', 'cursive')
      expect(Handwriting.currentGuide(model).text).toBe(letterCase === 'upper' ? letter.toUpperCase() : letter)
      const complete = traced(model)
      expect(Handwriting.isComplete(complete)).toBe(true)
      expect(complete.progress).toEqual(Handwriting.currentGuide(model).strokes.map(stroke => stroke.length))
      expect(complete.contacts).toEqual([])
      expect(complete.celebrated).toBe(true)
    })
  }

  it.each(HANDWRITING_NUMBERS.map((number, index) => ({ number, index })))('traces digit $number independently of the preserved writing style and letter case', ({ number, index }) => {
    const model = target(index, 'lower', 'numbers', 'cursive')
    expect(Handwriting.currentGuide(model).text).toBe(number)
    expect(Handwriting.currentGuide(model)).toBe(Handwriting.currentGuide(target(index, 'upper', 'numbers')))
    const complete = traced(model)
    expect(Handwriting.isComplete(complete)).toBe(true)
    expect(complete.celebrated).toBe(true)
    expect(complete.contacts).toEqual([])
  })

  it.each(HANDWRITING_WORDS.map((word, index) => ({ ...word, index })))('traces joined cursive $text across letter boundaries before adding its detached marks', ({ text, index }) => {
    const model = target(index, 'upper', 'words', 'cursive')
    const guide = Handwriting.currentGuide(model)
    expect(guide.text).toBe(text)
    expect(Math.max(...guide.strokes[0]!.map(point => point.x)) - Math.min(...guide.strokes[0]!.map(point => point.x))).toBeGreaterThan(210)
    const complete = traced(model)
    expect(Handwriting.isComplete(complete)).toBe(true)
    expect(complete.progress).toEqual(guide.strokes.map(stroke => stroke.length))
    expect(complete.contacts).toEqual([])
  })

  it('keeps independent letter, word, and number choices and restores cursive after number practice', () => {
    Story.story(
      mutedUpdate, Story.with(Handwriting.init()),
      Story.message(Handwriting.SetCase({ letterCase: 'lower' })),
      Story.message(Handwriting.SetStyle({ style: 'cursive' })),
      Story.message(Handwriting.SelectedTarget({ index: 7 })),
      Story.message(Handwriting.SetMode({ mode: 'words' })),
      Story.message(Handwriting.SelectedTarget({ index: 4 })),
      Story.message(Handwriting.SetMode({ mode: 'numbers' })),
      Story.message(Handwriting.SelectedTarget({ index: 9 })),
      Story.message(Handwriting.SetStyle({ style: 'print' })),
      Story.message(Handwriting.SetCase({ letterCase: 'upper' })),
      Story.model(model => {
        expect(model).toMatchObject({ mode: 'numbers', style: 'cursive', letterCase: 'lower', letterIndex: 7, wordIndex: 4, numberIndex: 9 })
        expect(Handwriting.currentGuide(model).text).toBe('9')
        expect(model.progress.every(progress => progress === 0)).toBe(true)
      }),
      Story.message(Handwriting.SetMode({ mode: 'words' })),
      Story.model(model => { expect(Handwriting.currentGuide(model).text).toBe('cow'); expect(model.style).toBe('cursive') }),
      Story.message(Handwriting.SetMode({ mode: 'letters' })),
      Story.model(model => { expect(Handwriting.currentGuide(model).text).toBe('h'); expect(model.numberIndex).toBe(9); expect(model.style).toBe('cursive') }),
      Story.Command.expectNone(),
    )
  })

  it('ignores duplicate or malformed styles and keeps hidden number controls from changing the model', () => {
    const model = Handwriting.init()
    expect(update(model, Handwriting.SetStyle({ style: 'print' }))).toEqual([model, []])
    expect(update(model, { ...Handwriting.SetStyle({ style: 'print' }), style: 'ornate' } as unknown as Handwriting.Message)).toEqual([model, []])
    const numbers = target(0, 'upper', 'numbers')
    expect(update(numbers, Handwriting.SetStyle({ style: 'cursive' }))).toEqual([numbers, []])
    expect(update(numbers, Handwriting.SetCase({ letterCase: 'lower' }))).toEqual([numbers, []])
  })

  it.each([false, true])('uses the same release feedback and mute behavior for a joined word and a digit: muted=%s', muted => {
    for (const model of [target(HANDWRITING_WORDS.findIndex(word => word.text === 'pig'), 'lower', 'words', 'cursive'), target(8, 'upper', 'numbers')]) {
      const messages = traceMessages(model)
      Story.story(
        (current: Handwriting.Model, message: Handwriting.Message) => Handwriting.update(current, message, muted),
        Story.with(model),
        ...messages.slice(0, -1).flatMap(message => [Story.message(message), Story.Command.expectNone()]),
        Story.model(current => { expect(Handwriting.isComplete(current)).toBe(true); expect(current.celebrated).toBe(false) }),
        Story.message(messages.at(-1)!),
        muted ? Story.Command.expectNone() : Story.Command.resolveAll(sound),
        Story.model(current => { expect(current.celebrated).toBe(true); expect(current.contacts).toEqual([]) }),
        Story.Command.expectNone(),
      )
    }
  })

  it('exposes pressed print and cursive controls and offers exactly ten numeric choices without letter controls', () => {
    Scene.scene(
      { update: mutedUpdate, view }, Scene.with(Handwriting.init()),
      Scene.Mount.resolveAll(boardMounted()),
      Scene.expect(Scene.role('button', { name: t('handwritingNumbers', 'en') })).toHaveAttr('aria-pressed', 'false'),
      Scene.expect(Scene.role('button', { name: t('handwritingPrint', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('button', { name: t('handwritingCursive', 'en') })).toHaveAttr('aria-pressed', 'false'),
      Scene.click(Scene.role('button', { name: t('handwritingCursive', 'en') })),
      Scene.expect(Scene.role('button', { name: t('handwritingCursive', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('button', { name: t('handwritingPrint', 'en') })).toHaveAttr('aria-pressed', 'false'),
      Scene.click(Scene.role('button', { name: t('handwritingNumbers', 'en') })),
      Scene.expect(Scene.role('button', { name: t('handwritingNumbers', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expectAll(Scene.all.selector('.handwriting-choice')).toHaveCount(10),
      Scene.expectAll(Scene.all.selector('.handwriting-cases')).toBeEmpty(),
      Scene.expectAll(Scene.all.role('group', { name: t('handwritingStyle', 'en') })).toBeEmpty(),
      Scene.expect(Scene.role('button', { name: '0' })).toHaveAttr('aria-pressed', 'true'),
      Scene.click(Scene.role('button', { name: '9' })),
      Scene.expect(Scene.role('button', { name: '9' })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('application', { name: tf('handwritingBoard', 'en', '9') })).toHaveAttr('viewBox', '0 0 100 160'),
      Scene.click(Scene.role('button', { name: t('handwritingLetters', 'en') })),
      Scene.expect(Scene.role('button', { name: t('handwritingCursive', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expectAll(Scene.all.selector('.handwriting-choice')).toHaveCount(26),
      Scene.Command.expectNone(),
    )
  })
})

describe('Handwriting model and tracing', () => {
  it('starts with a fresh uppercase A guide and explicit contact and keyboard state', () => {
    expect(Handwriting.init()).toEqual({
      mode: 'letters', letterCase: 'upper', style: 'print', letterIndex: 0, wordIndex: 0, numberIndex: 0, revision: 0,
      progress: [0, 0, 0], contacts: [], pen: null, celebrated: false,
    })
    expect(Handwriting.currentGuide(Handwriting.init()).text).toBe('A')
    expect(Handwriting.completedStrokes(Handwriting.init())).toBe(0)
    expect(Handwriting.isComplete(Handwriting.init())).toBe(false)
  })

  for (const letterCase of ['upper', 'lower'] as const) {
    it.each(HANDWRITING_LETTERS.map((letter, index) => ({ letter, index })))(`completes ${letterCase} $letter through its actual stroke sequence`, ({ letter, index }) => {
      const model = target(index, letterCase)
      const guide = Handwriting.currentGuide(model)
      expect(guide.text).toBe(letterCase === 'upper' ? letter.toUpperCase() : letter)
      Story.story(
        mutedUpdate,
        Story.with(model),
        ...guide.strokes.flatMap((stroke, id) => [
          Story.message(Handwriting.PenStarted({ id, ...stroke[0]!, revision: 0 })),
          Story.model((next: Handwriting.Model) => expect(next.contacts.find(contact => contact.id === id)?.stroke).toBe(id)),
          Story.message(Handwriting.PenMoved({ id, points: stroke.slice(1), revision: 0 })),
          Story.model((next: Handwriting.Model) => expect(next.progress[id]).toBe(stroke.length)),
          Story.message(Handwriting.PenEnded({ id, revision: 0 })),
          Story.Command.expectNone(),
        ]),
        Story.model(next => {
          expect(Handwriting.completedStrokes(next)).toBe(guide.strokes.length)
          expect(Handwriting.isComplete(next)).toBe(true)
          expect(next.celebrated).toBe(true)
          expect(next.contacts).toEqual([])
        }),
        Story.Command.expectNone(),
      )
    })
  }

  it.each(HANDWRITING_WORDS.map((word, index) => ({ ...word, index })))('completes the illustrated three-letter word $text with lowercase guides', ({ text, emoji, index }) => {
    const model = target(index, 'upper', 'words')
    expect(Handwriting.currentGuide(model)).toMatchObject({ text, emoji })
    const complete = traced(model)
    expect(Handwriting.isComplete(complete)).toBe(true)
    expect(complete.celebrated).toBe(true)
    expect(complete.contacts).toEqual([])
  })

  it('advances monotonically along the dots and rejects unrelated or shortcut movement', () => {
    const model = target(11)
    const stroke = Handwriting.currentGuide(model).strokes[0]!
    let previous = 0
    let partial = model
    Story.story(
      mutedUpdate,
      Story.with(model),
      Story.message(Handwriting.PenStarted({ id: 1, ...stroke[0]!, revision: 0 })),
      Story.model(next => { previous = next.progress[0]!; expect(previous).toBeGreaterThan(0) }),
      Story.message(Handwriting.PenMoved({ id: 1, points: [stroke.at(-1)!], revision: 0 })),
      Story.model(next => expect(next.progress[0]).toBe(previous)),
      Story.message(Handwriting.PenCancelled({ id: 1, revision: 0 })),
      Story.model(next => { partial = next }),
      Story.Command.expectNone(),
    )
    Story.story(
      mutedUpdate,
      Story.with(partial),
      Story.message(Handwriting.PenStarted({ id: 2, ...stroke[previous]!, revision: 0 })),
      ...stroke.slice(previous).flatMap(point => [
        Story.message(Handwriting.PenMoved({ id: 2, points: [point], revision: 0 })),
        Story.model((next: Handwriting.Model) => { expect(next.progress[0]).toBeGreaterThanOrEqual(previous); previous = next.progress[0]! }),
      ]),
      Story.model(next => expect(next.progress[0]).toBe(stroke.length)),
      Story.Command.expectNone(),
    )
  })

  it('writes uppercase A down from its apex in separate legs and celebrates only after the crossbar release', () => {
    const model = Handwriting.init()
    const [left, right, crossbar] = Handwriting.currentGuide(model).strokes
    Story.story(
      update,
      Story.with(model),
      Story.message(Handwriting.PenStarted({ id: 1, ...left![0]!, revision: 0 })),
      Story.model(next => expect(next.contacts.map(contact => [contact.id, contact.stroke])).toEqual([[1, 0]])),
      Story.message(Handwriting.PenMoved({ id: 1, points: [left!.at(-1)!], revision: 0 })),
      Story.message(Handwriting.PenEnded({ id: 1, revision: 0 })),
      Story.model(next => expect(next.progress).toEqual([left!.length, 0, 0])),
      Story.Command.expectNone(),
      Story.message(Handwriting.PenStarted({ id: 2, ...right![0]!, revision: 0 })),
      Story.model(next => expect(next.contacts.map(contact => [contact.id, contact.stroke])).toEqual([[2, 1]])),
      Story.message(Handwriting.PenMoved({ id: 2, points: [right!.at(-1)!], revision: 0 })),
      Story.message(Handwriting.PenEnded({ id: 2, revision: 0 })),
      Story.model(next => { expect(next.progress).toEqual([left!.length, right!.length, 0]); expect(next.celebrated).toBe(false) }),
      Story.Command.expectNone(),
      Story.message(Handwriting.PenStarted({ id: 3, ...crossbar![0]!, revision: 0 })),
      Story.message(Handwriting.PenMoved({ id: 3, points: [crossbar!.at(-1)!], revision: 0 })),
      Story.model(next => { expect(Handwriting.isComplete(next)).toBe(true); expect(next.celebrated).toBe(false) }),
      Story.Command.expectNone(),
      Story.message(Handwriting.PenEnded({ id: 3, revision: 0 })),
      Story.model(next => { expect(next.celebrated).toBe(true); expect(next.contacts).toEqual([]) }),
      Story.Command.expectExact({ name: 'HandwritingPlayChime' }),
      Story.Command.resolveAll(sound),
      Story.message(Handwriting.PenEnded({ id: 3, revision: 0 })),
      Story.Command.expectNone(),
    )
  })

  it('resumes a fast uppercase L trace at its corner and completes the horizontal leg on release', () => {
    const model = target(11)
    const stroke = Handwriting.currentGuide(model).strokes[0]!
    const corner = { x: 20, y: 120 }
    Story.story(
      update,
      Story.with(model),
      Story.message(Handwriting.PenStarted({ id: 1, ...stroke[0]!, revision: 0 })),
      Story.message(Handwriting.PenMoved({ id: 1, points: [corner], revision: 0 })),
      Story.message(Handwriting.PenEnded({ id: 1, revision: 0 })),
      Story.model(next => { expect(next.progress[0]).toBeGreaterThan(1); expect(Handwriting.isComplete(next)).toBe(false) }),
      Story.Command.expectNone(),
      Story.message(Handwriting.PenStarted({ id: 2, ...corner, revision: 0 })),
      Story.model(next => expect(next.contacts.map(contact => [contact.id, contact.stroke])).toEqual([[2, 0]])),
      Story.message(Handwriting.PenMoved({ id: 2, points: [stroke.at(-1)!], revision: 0 })),
      Story.model(next => { expect(Handwriting.isComplete(next)).toBe(true); expect(next.celebrated).toBe(false) }),
      Story.Command.expectNone(),
      Story.message(Handwriting.PenEnded({ id: 2, revision: 0 })),
      Story.Command.resolveAll(sound),
      Story.model(next => expect(next.celebrated).toBe(true)),
      Story.Command.expectNone(),
    )
  })

  it('accepts a finger-width offset from a lowercase l guide and completes on release', () => {
    const model = target(HANDWRITING_LETTERS.indexOf('l'), 'lower')
    const stroke = Handwriting.currentGuide(model).strokes[0]!
    const offset = stroke.map(point => ({ x: point.x + 15, y: point.y }))
    Story.story(
      update,
      Story.with(model),
      Story.message(Handwriting.PenStarted({ id: 1, ...offset[0]!, revision: 0 })),
      Story.model(next => { expect(next.contacts.map(contact => [contact.id, contact.stroke])).toEqual([[1, 0]]); expect(next.progress[0]).toBeGreaterThan(0) }),
      Story.message(Handwriting.PenMoved({ id: 1, points: offset.slice(1), revision: 0 })),
      Story.model(next => { expect(Handwriting.isComplete(next)).toBe(true); expect(next.celebrated).toBe(false) }),
      Story.Command.expectNone(),
      Story.message(Handwriting.PenEnded({ id: 1, revision: 0 })),
      Story.Command.resolveAll(sound),
      Story.model(next => { expect(next.celebrated).toBe(true); expect(next.contacts).toEqual([]) }),
      Story.Command.expectNone(),
    )
  })

  it('recovers immediately when a held finger drifts away and returns near its next guide dots', () => {
    const model = target(HANDWRITING_LETTERS.indexOf('l'))
    const stroke = Handwriting.currentGuide(model).strokes[0]!
    let progress = 0
    Story.story(
      mutedUpdate,
      Story.with(model),
      Story.message(Handwriting.PenStarted({ id: 1, ...stroke[0]!, revision: 0 })),
      Story.message(Handwriting.PenMoved({ id: 1, points: stroke.slice(1, 8), revision: 0 })),
      Story.model(next => { progress = next.progress[0]!; expect(progress).toBeGreaterThan(1); expect(progress).toBeLessThan(stroke.length) }),
      Story.message(Handwriting.PenMoved({ id: 1, points: [{ x: 75, y: 60 }], revision: 0 })),
      Story.model(next => { expect(next.progress[0]).toBe(progress); expect(next.contacts.map(contact => contact.id)).toEqual([1]) }),
      Story.message(Handwriting.PenMoved({ id: 1, points: [stroke[12]!], revision: 0 })),
      Story.model(next => expect(next.progress[0]).toBeGreaterThan(progress)),
      Story.message(Handwriting.PenMoved({ id: 1, points: stroke.slice(13), revision: 0 })),
      Story.message(Handwriting.PenEnded({ id: 1, revision: 0 })),
      Story.model(next => { expect(Handwriting.isComplete(next)).toBe(true); expect(next.celebrated).toBe(true) }),
      Story.Command.expectNone(),
    )
  })

  it('reacquires a partial stroke slightly behind its saved endpoint without losing ink', () => {
    const model = target(HANDWRITING_LETTERS.indexOf('l'))
    const stroke = Handwriting.currentGuide(model).strokes[0]!
    let partial = model
    Story.story(
      mutedUpdate,
      Story.with(model),
      Story.message(Handwriting.PenStarted({ id: 1, ...stroke[0]!, revision: 0 })),
      Story.message(Handwriting.PenMoved({ id: 1, points: stroke.slice(1, 8), revision: 0 })),
      Story.message(Handwriting.PenEnded({ id: 1, revision: 0 })),
      Story.model(next => { partial = next; expect(next.progress[0]).toBeGreaterThan(5); expect(next.contacts).toEqual([]) }),
      Story.Command.expectNone(),
    )
    const progress = partial.progress[0]!
    const resume = progress - 5
    Story.story(
      mutedUpdate,
      Story.with(partial),
      Story.message(Handwriting.PenStarted({ id: 2, ...stroke[resume]!, revision: 0 })),
      Story.model(next => { expect(next.contacts.map(contact => [contact.id, contact.stroke])).toEqual([[2, 0]]); expect(next.progress[0]).toBe(progress) }),
      Story.message(Handwriting.PenMoved({ id: 2, points: stroke.slice(resume + 1), revision: 0 })),
      Story.message(Handwriting.PenEnded({ id: 2, revision: 0 })),
      Story.model(next => { expect(next.progress[0]).toBe(stroke.length); expect(Handwriting.isComplete(next)).toBe(true); expect(next.celebrated).toBe(true) }),
      Story.Command.expectNone(),
    )
  })

  it('keeps widened touch targets owned by their original fingers without crossing into another stroke', () => {
    const model = target(HANDWRITING_LETTERS.indexOf('h'))
    const [left, right] = Handwriting.currentGuide(model).strokes
    let progress: ReadonlyArray<number> = []
    Story.story(
      mutedUpdate,
      Story.with(model),
      Story.message(Handwriting.PenStarted({ id: 1, x: left![0]!.x + 15, y: left![0]!.y, revision: 0 })),
      Story.message(Handwriting.PenStarted({ id: 2, x: left![0]!.x + 15, y: left![0]!.y, revision: 0 })),
      Story.model(next => expect(next.contacts.map(contact => [contact.id, contact.stroke])).toEqual([[1, 0]])),
      Story.message(Handwriting.PenStarted({ id: 2, x: right![0]!.x - 15, y: right![0]!.y, revision: 0 })),
      Story.model(next => { expect(next.contacts.map(contact => [contact.id, contact.stroke])).toEqual([[1, 0], [2, 1]]); progress = next.progress }),
      Story.message(Handwriting.PenMoved({ id: 1, points: right!.slice(1), revision: 0 })),
      Story.model(next => { expect(next.progress).toEqual(progress); expect(next.contacts.map(contact => [contact.id, contact.stroke])).toEqual([[1, 0], [2, 1]]) }),
      Story.message(Handwriting.PenCancelled({ id: 1, revision: 0 })),
      Story.message(Handwriting.PenCancelled({ id: 2, revision: 0 })),
      Story.model(next => { expect(next.contacts).toEqual([]); expect(Handwriting.isComplete(next)).toBe(false) }),
      Story.Command.expectNone(),
    )
  })

  it.each([2, 9])('starts the untouched right A leg at its shared apex after lifting the left leg at sample %s', sample => {
    const model = Handwriting.init()
    const [left, right] = Handwriting.currentGuide(model).strokes
    let leftProgress = 0
    Story.story(
      mutedUpdate,
      Story.with(model),
      Story.message(Handwriting.PenStarted({ id: 1, ...left![0]!, revision: 0 })),
      Story.message(Handwriting.PenMoved({ id: 1, points: left!.slice(1, sample + 1), revision: 0 })),
      Story.message(Handwriting.PenEnded({ id: 1, revision: 0 })),
      Story.model(next => { leftProgress = next.progress[0]!; expect(leftProgress).toBeGreaterThan(0); expect(leftProgress).toBeLessThan(left!.length); expect(next.progress[1]).toBe(0) }),
      Story.message(Handwriting.PenStarted({ id: 2, ...right![0]!, revision: 0 })),
      Story.model(next => { expect(next.contacts.map(contact => [contact.id, contact.stroke])).toEqual([[2, 1]]); expect(next.progress[0]).toBe(leftProgress) }),
      Story.message(Handwriting.PenMoved({ id: 2, points: right!.slice(1), revision: 0 })),
      Story.message(Handwriting.PenEnded({ id: 2, revision: 0 })),
      Story.model(next => { expect(next.progress[0]).toBe(leftProgress); expect(next.progress[1]).toBe(right!.length); expect(Handwriting.isComplete(next)).toBe(false) }),
      Story.Command.expectNone(),
    )
  })

  it('owns separate strokes per finger while an unrelated held touch does not block tracing', () => {
    const model = target(HANDWRITING_LETTERS.indexOf('h'))
    const [left, right, bar] = Handwriting.currentGuide(model).strokes
    Story.story(
      mutedUpdate,
      Story.with(model),
      Story.message(Handwriting.PenStarted({ id: 99, x: 0, y: 0, revision: 0 })),
      Story.message(Handwriting.PenStarted({ id: 1, ...left![0]!, revision: 0 })),
      Story.message(Handwriting.PenStarted({ id: 2, ...left![0]!, revision: 0 })),
      Story.model(next => expect(next.contacts.map(contact => [contact.id, contact.stroke])).toEqual([[1, 0]])),
      Story.message(Handwriting.PenStarted({ id: 2, ...bar![0]!, revision: 0 })),
      Story.message(Handwriting.PenStarted({ id: 1, ...bar![0]!, revision: 0 })),
      Story.model(next => expect(next.contacts.map(contact => [contact.id, contact.stroke])).toEqual([[1, 0], [2, 2]])),
      Story.message(Handwriting.PenMoved({ id: 2, points: bar!.slice(1), revision: 0 })),
      Story.model(next => { expect(next.progress[2]).toBe(bar!.length); expect(next.progress[0]).toBeLessThan(left!.length) }),
      Story.message(Handwriting.PenEnded({ id: 2, revision: 0 })),
      Story.message(Handwriting.PenMoved({ id: 1, points: left!.slice(1), revision: 0 })),
      Story.message(Handwriting.PenEnded({ id: 1, revision: 0 })),
      Story.message(Handwriting.PenStarted({ id: 3, ...right![0]!, revision: 0 })),
      Story.message(Handwriting.PenMoved({ id: 3, points: right!.slice(1), revision: 0 })),
      Story.message(Handwriting.PenEnded({ id: 3, revision: 0 })),
      Story.model(next => { expect(Handwriting.isComplete(next)).toBe(true); expect(next.contacts).toEqual([]) }),
      Story.Command.expectNone(),
    )
  })

  it.each(['b', 'h'])('traces lowercase %s through the stem retrace and arch without lifting', letter => {
    const model = target(HANDWRITING_LETTERS.indexOf(letter), 'lower')
    const guide = Handwriting.currentGuide(model)
    expect(guide.strokes).toHaveLength(1)
    const stroke = guide.strokes[0]!
    Story.story(
      update,
      Story.with(model),
      Story.message(Handwriting.PenStarted({ id: 1, ...stroke[0]!, revision: 0 })),
      ...stroke.slice(1).map(point => Story.message(Handwriting.PenMoved({ id: 1, points: [point], revision: 0 }))),
      Story.model(next => { expect(next.progress).toEqual([stroke.length]); expect(next.contacts.map(contact => contact.id)).toEqual([1]); expect(next.celebrated).toBe(false) }),
      Story.Command.expectNone(),
      Story.message(Handwriting.PenEnded({ id: 1, revision: 0 })),
      Story.Command.resolveAll(sound),
      Story.model(next => { expect(next.celebrated).toBe(true); expect(next.contacts).toEqual([]) }),
      Story.Command.expectNone(),
    )
  })

  it('rejects invalid contact identifiers, revisions, points, and movement batches without partial mutation', () => {
    const model = Handwriting.init()
    const start = Handwriting.currentGuide(model).strokes[0]![0]!
    const invalidStarts = [
      ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(id => Handwriting.PenStarted({ id, ...start, revision: 0 })),
      ...[-1, 1, 0.5, NaN, Infinity].map(revision => Handwriting.PenStarted({ id: 1, ...start, revision })),
      ...[NaN, Infinity, -Infinity, 10000].flatMap(value => [Handwriting.PenStarted({ id: 1, x: value, y: start.y, revision: 0 }), Handwriting.PenStarted({ id: 1, x: start.x, y: value, revision: 0 })]),
    ]
    for (const message of invalidStarts) expect(update(model, message)).toEqual([model, []])
    const [held] = mutedUpdate(model, Handwriting.PenStarted({ id: 1, ...start, revision: 0 }))
    const invalidMoves = [
      Handwriting.PenMoved({ id: 999, points: [start], revision: 0 }),
      Handwriting.PenMoved({ id: 1, points: [], revision: 0 }),
      Handwriting.PenMoved({ id: 1, points: Array.from({ length: 257 }, () => start), revision: 0 }),
      Handwriting.PenMoved({ id: 1, points: [start, { x: NaN, y: 0 }], revision: 0 }),
      Handwriting.PenMoved({ id: 1, points: [{ x: 0, y: Infinity }], revision: 0 }),
      ...[-1, 0.5, NaN, Infinity].map(id => Handwriting.PenMoved({ id, points: [start], revision: 0 })),
      ...[-1, 1, NaN, Infinity].map(revision => Handwriting.PenMoved({ id: 1, points: [start], revision })),
    ]
    for (const message of invalidMoves) expect(update(held, message)).toEqual([held, []])
    for (const id of [-1, 0.5, NaN, Infinity, 999]) {
      expect(update(held, Handwriting.PenEnded({ id, revision: 0 }))).toEqual([held, []])
      expect(update(held, Handwriting.PenCancelled({ id, revision: 0 }))).toEqual([held, []])
    }
  })

  it('keeps partial ink through cancellation without feedback and resumes at its next dot', () => {
    const stroke = Handwriting.currentGuide(Handwriting.init()).strokes[0]!
    let progress = 0
    Story.story(
      update,
      Story.with(Handwriting.init()),
      Story.message(Handwriting.PenStarted({ id: 1, ...stroke[0]!, revision: 0 })),
      Story.message(Handwriting.PenMoved({ id: 1, points: stroke.slice(1, 8), revision: 0 })),
      Story.model(next => { progress = next.progress[0]!; expect(progress).toBeGreaterThan(1); expect(progress).toBeLessThan(stroke.length) }),
      Story.message(Handwriting.PenCancelled({ id: 1, revision: 0 })),
      Story.model(next => { expect(next.contacts).toEqual([]); expect(next.progress[0]).toBe(progress); expect(next.celebrated).toBe(false) }),
      Story.message(Handwriting.PenEnded({ id: 1, revision: 0 })),
      Story.message(Handwriting.PenCancelled({ id: 1, revision: 0 })),
      Story.Command.expectNone(),
    )
  })
})

describe('Handwriting feedback and navigation', () => {
  it('plays a chime only on a successful release after the final stroke and acknowledges it once', () => {
    const model = target(11)
    const stroke = Handwriting.currentGuide(model).strokes[0]!
    Story.story(
      update,
      Story.with(model),
      Story.message(Handwriting.PenStarted({ id: 1, ...stroke[0]!, revision: 0 })),
      Story.message(Handwriting.PenMoved({ id: 1, points: stroke.slice(1), revision: 0 })),
      Story.model(next => { expect(Handwriting.isComplete(next)).toBe(true); expect(next.celebrated).toBe(false) }),
      Story.Command.expectNone(),
      Story.message(Handwriting.PenEnded({ id: 1, revision: 0 })),
      Story.model(next => { expect(next.celebrated).toBe(true); expect(next.contacts).toEqual([]) }),
      Story.Command.expectExact({ name: 'HandwritingPlayChime' }),
      Story.Command.resolveAll(sound),
      Story.message(Handwriting.PenEnded({ id: 1, revision: 0 })),
      Story.message(Handwriting.PenStarted({ id: 2, ...stroke[0]!, revision: 0 })),
      Story.message(Handwriting.PenMoved({ id: 1, points: [stroke[0]!], revision: 0 })),
      Story.Command.expectNone(),
    )
  })

  it('keeps completion visible when muted or canceled, and acknowledges a missing audio API', async () => {
    const held = traced(target(11), false)
    const [canceled, canceledCommands] = update(held, Handwriting.PenCancelled({ id: 0, revision: 0 }))
    expect(Handwriting.isComplete(canceled)).toBe(true)
    expect(canceled.celebrated).toBe(false)
    expect(canceledCommands).toEqual([])
    const [muted, mutedCommands] = mutedUpdate(held, Handwriting.PenEnded({ id: 0, revision: 0 }))
    expect(muted.celebrated).toBe(true)
    expect(mutedCommands).toEqual([])
    vi.spyOn(Audio, 'chime').mockReturnValue({ name: 'PlayChime', effect: Effect.die(new Error('audio unavailable')) })
    const [complete, commands] = update(held, Handwriting.PenEnded({ id: 0, revision: 0 }))
    expect(complete.celebrated).toBe(true)
    expect(commands[0]?.name).toBe('HandwritingPlayChime')
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Handwriting.SoundPlayed())
  })

  it('selects every letter variant and every word, resetting ink and keeping each catalogue index', () => {
    Story.story(
      mutedUpdate,
      Story.with(Handwriting.init()),
      ...(['upper', 'lower'] as const).flatMap(letterCase => [
        Story.message(Handwriting.SetCase({ letterCase })),
        ...HANDWRITING_LETTERS.flatMap((letter, index) => [
          Story.message(Handwriting.SelectedTarget({ index })),
          Story.model((model: Handwriting.Model) => { expect(Handwriting.currentGuide(model).text).toBe(letterCase === 'upper' ? letter.toUpperCase() : letter); expect(model.letterIndex).toBe(index); expect(model.progress.every(progress => progress === 0)).toBe(true) }),
        ]),
      ]),
      Story.message(Handwriting.SetMode({ mode: 'words' })),
      ...HANDWRITING_WORDS.flatMap((word, index) => [
        Story.message(Handwriting.SelectedTarget({ index })),
        Story.model((model: Handwriting.Model) => { expect(Handwriting.currentGuide(model).text).toBe(word.text); expect(model.wordIndex).toBe(index) }),
      ]),
      Story.message(Handwriting.SetMode({ mode: 'letters' })),
      Story.model(model => { expect(model.letterIndex).toBe(25); expect(model.wordIndex).toBe(31); expect(Handwriting.currentGuide(model).text).toBe('z') }),
      Story.Command.expectNone(),
    )
  })

  it('wraps next and previous choices in each catalogue and rejects malformed or duplicate selection', () => {
    for (const mode of ['letters', 'words', 'numbers'] as const) {
      const model = target(0, 'upper', mode)
      const count = mode === 'letters' ? HANDWRITING_LETTERS.length : mode === 'words' ? HANDWRITING_WORDS.length : HANDWRITING_NUMBERS.length
      for (const index of [-1, 0, 0.5, NaN, Infinity, count]) expect(update(model, Handwriting.SelectedTarget({ index }))).toEqual([model, []])
      Story.story(
        mutedUpdate, Story.with(model),
        Story.message(Handwriting.PreviousTarget()),
        Story.model(next => expect(mode === 'letters' ? next.letterIndex : mode === 'words' ? next.wordIndex : next.numberIndex).toBe(count - 1)),
        Story.message(Handwriting.NextTarget()),
        Story.model(next => expect(mode === 'letters' ? next.letterIndex : mode === 'words' ? next.wordIndex : next.numberIndex).toBe(0)),
        Story.Command.expectNone(),
      )
    }
    const model = Handwriting.init()
    expect(update(model, Handwriting.SetMode({ mode: 'letters' }))).toEqual([model, []])
    expect(update(model, Handwriting.SetCase({ letterCase: 'upper' }))).toEqual([model, []])
    expect(update(model, { ...Handwriting.SetMode({ mode: 'letters' }), mode: 'unknown' } as unknown as Handwriting.Message)).toEqual([model, []])
    expect(update(model, { ...Handwriting.SetCase({ letterCase: 'upper' }), letterCase: 'unknown' } as unknown as Handwriting.Message)).toEqual([model, []])
    const words = target(0, 'upper', 'words')
    expect(update(words, Handwriting.SetCase({ letterCase: 'lower' }))).toEqual([words, []])
  })

  it('invalidates held contacts and queued keyboard events on reset, target, case, and mode changes', () => {
    const stroke = Handwriting.currentGuide(Handwriting.init()).strokes[0]!
    const [held] = mutedUpdate(Handwriting.init(), Handwriting.PenStarted({ id: 1, ...stroke[0]!, revision: 0 }))
    for (const change of [Handwriting.Restarted(), Handwriting.NextTarget(), Handwriting.PreviousTarget(), Handwriting.SelectedTarget({ index: 4 }), Handwriting.SetCase({ letterCase: 'lower' }), Handwriting.SetMode({ mode: 'words' }), Handwriting.SetMode({ mode: 'numbers' }), Handwriting.SetStyle({ style: 'cursive' })]) {
      Story.story(
        update, Story.with(held), Story.message(change),
        Story.model(model => { expect(model.revision).toBe(1); expect(model.contacts).toEqual([]); expect(model.pen).toBeNull(); expect(model.progress.every(progress => progress === 0)).toBe(true); expect(model.celebrated).toBe(false) }),
        Story.message(Handwriting.PenMoved({ id: 1, points: stroke.slice(1), revision: 0 })),
        Story.message(Handwriting.PenEnded({ id: 1, revision: 0 })),
        Story.message(Handwriting.PenCancelled({ id: 1, revision: 0 })),
        Story.message(Handwriting.KeyboardPressed({ key: 'ArrowDown', revision: 0 })),
        Story.message(Handwriting.KeyboardLifted({ revision: 0 })),
        Story.model(model => { expect(model.progress.every(progress => progress === 0)).toBe(true); expect(model.pen).toBeNull() }),
        Story.Command.expectNone(),
      )
    }
  })

  it('interrupts contacts on navigation while preserving colored writing and completion state', () => {
    const partial = { ...traced(target(11), false), pen: { stroke: 0, point: { x: 80, y: 120 } } }
    const interrupted = Handwriting.interrupt(partial)
    expect(interrupted).toEqual({ ...partial, revision: partial.revision + 1, contacts: [], pen: null })
    expect(interrupted.progress).toEqual(partial.progress)
    expect(Handwriting.isComplete(interrupted)).toBe(true)
    expect(update(interrupted, Handwriting.PenEnded({ id: 0, revision: 0 }))).toEqual([interrupted, []])
  })
})

describe('Handwriting keyboard and accessible view', () => {
  it('moves a keyboard pen along the actual L guide, celebrates once, and lifts with Enter or Space', () => {
    const model = target(11)
    Story.story(
      update, Story.with(model),
      ...Array.from({ length: 13 }, () => [Story.message(Handwriting.KeyboardPressed({ key: 'ArrowDown', revision: 0 })), Story.Command.expectNone()]).flat(),
      Story.model(next => { expect(next.pen?.point.x).toBe(20); expect(next.pen?.point.y).toBe(103); expect(next.progress[0]).toBeGreaterThan(10); expect(Handwriting.isComplete(next)).toBe(false) }),
      Story.message(Handwriting.KeyboardPressed({ key: 'Enter', revision: 0 })),
      Story.model(next => expect(next.pen).toBeNull()),
      Story.Command.expectNone(),
      ...Array.from({ length: 2 }, () => [Story.message(Handwriting.KeyboardPressed({ key: 'ArrowDown', revision: 0 })), Story.Command.expectNone()]).flat(),
      ...Array.from({ length: 6 }, () => [Story.message(Handwriting.KeyboardPressed({ key: 'ArrowRight', revision: 0 })), Story.Command.expectNone()]).flat(),
      Story.message(Handwriting.KeyboardPressed({ key: 'ArrowRight', revision: 0 })),
      Story.model(next => { expect(Handwriting.isComplete(next)).toBe(true); expect(next.celebrated).toBe(true) }),
      Story.Command.resolveAll(sound),
      Story.message(Handwriting.KeyboardPressed({ key: ' ', revision: 0 })),
      Story.model(next => expect(next.pen).toBeNull()),
      Story.message(Handwriting.KeyboardPressed({ key: 'Enter', revision: 0 })),
      Story.message(Handwriting.KeyboardPressed({ key: 'ArrowRight', revision: 0 })),
      Story.Command.expectNone(),
    )
  })

  it('ignores unknown and inherited key names, preserves partial ink on blur, and rejects stale keyboard events', () => {
    const model = target(11)
    for (const key of ['Tab', 'Escape', 'x', 'toString', 'constructor', '__proto__', 'hasOwnProperty']) expect(update(model, Handwriting.KeyboardPressed({ key, revision: 0 }))).toEqual([model, []])
    Story.story(
      mutedUpdate, Story.with(model),
      Story.message(Handwriting.KeyboardPressed({ key: 'ArrowDown', revision: 0 })),
      Story.message(Handwriting.KeyboardLifted({ revision: 1 })),
      Story.model(next => expect(next.pen).not.toBeNull()),
      Story.message(Handwriting.KeyboardLifted({ revision: 0 })),
      Story.model(next => { expect(next.pen).toBeNull(); expect(next.progress[0]).toBeGreaterThan(0) }),
      Story.Command.expectNone(),
    )
  })

  it('renders native pressed controls, keyboard-accessible guide dots, and localized progress without ink', () => {
    Scene.scene(
      { update: mutedUpdate, view }, Scene.with(Handwriting.init()),
      Scene.Mount.resolveAll(boardMounted()),
      Scene.expect(Scene.role('button', { name: t('handwritingLetters', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('button', { name: t('handwritingWords', 'en') })).toHaveAttr('aria-pressed', 'false'),
      Scene.expect(Scene.role('button', { name: t('handwritingUppercaseLabel', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('button', { name: 'A' })).toHaveAttr('aria-pressed', 'true'),
      Scene.expectAll(Scene.all.selector('.handwriting-choice')).toHaveCount(26),
      Scene.expect(Scene.role('application', { name: tf('handwritingBoard', 'en', 'A') })).toHaveAttr('tabindex', '0'),
      Scene.expect(Scene.selector('.handwriting-board')).toHaveAccessibleDescription(t('handwritingKeyboardHint', 'en')),
      Scene.expect(Scene.selector('.handwriting-board')).toHaveAttr('data-complete', 'false'),
      Scene.expectAll(Scene.all.selector('.handwriting-guide')).toHaveCount(3),
      Scene.expectAll(Scene.all.selector('.handwriting-start')).toHaveCount(2),
      Scene.expectAll(Scene.all.selector('.handwriting-stroke-badge')).toHaveCount(3),
      Scene.expectAll(Scene.all.selector('.handwriting-direction')).toHaveCount(3),
      Scene.tap(simulation => expect(Scene.findAll(simulation.html, '.handwriting-stroke-number').map(Scene.textContent)).toEqual(['1', '2', '3'])),
      Scene.expectAll(Scene.all.selector('.handwriting-ink')).toBeEmpty(),
      Scene.expect(Scene.selector('.handwriting-feedback[role="status"][aria-live="polite"]')).toHaveText(tf('handwritingProgress', 'en', '0', '3')),
      Scene.expect(Scene.role('button', { name: t('handwritingPrevious', 'en') })).toBeEnabled(),
      Scene.expect(Scene.role('button', { name: t('handwritingAgain', 'en') })).toBeEnabled(),
      Scene.expect(Scene.role('button', { name: t('handwritingNext', 'en') })).toBeEnabled(),
      Scene.Command.expectNone(),
    )
  })

  it('renders gradient writing and its highlight and gives the reset board a new structural identity', () => {
    const complete = traced(target(11))
    Scene.scene(
      { update: mutedUpdate, view }, Scene.with(complete),
      Scene.Mount.resolveAll(boardMounted()),
      Scene.expect(Scene.selector('.handwriting-board')).toHaveAttr('data-complete', 'true'),
      Scene.expect(Scene.selector('.handwriting-ink')).toHaveAttr('stroke', 'url(#handwriting-gradient-0-0)'),
      Scene.expect(Scene.selector('linearGradient')).toHaveAttr('gradientUnits', 'userSpaceOnUse'),
      Scene.tap(simulation => expect(Option.getOrThrow(Scene.find(simulation.html, '.handwriting-board'))?.key).toBe('handwriting-board-0')),
      Scene.expectAll(Scene.all.selector('.handwriting-ink-highlight')).toHaveCount(1),
      Scene.expectAll(Scene.all.selector('.handwriting-start')).toBeEmpty(),
      Scene.expectAll(Scene.all.selector('.handwriting-stroke-badge')).toBeEmpty(),
      Scene.expectAll(Scene.all.selector('.handwriting-direction')).toBeEmpty(),
      Scene.expect(Scene.selector('.handwriting-feedback')).toHaveText(t('handwritingComplete', 'en')),
      Scene.click(Scene.role('button', { name: t('handwritingAgain', 'en') })),
      Scene.tap(simulation => expect(Option.getOrThrow(Scene.find(simulation.html, '.handwriting-board'))?.key).toBe('handwriting-board-1')),
      Scene.expect(Scene.selector('.handwriting-board')).toHaveAttr('data-handwriting-revision', '1'),
      Scene.expect(Scene.selector('.handwriting-board')).toHaveAttr('data-complete', 'false'),
      Scene.expectAll(Scene.all.selector('.handwriting-ink')).toBeEmpty(),
      Scene.Command.expectNone(),
    )
  })

  it('removes the active stroke’s formation cues while keeping the remaining numbered directions', () => {
    const model = Handwriting.init()
    const stroke = Handwriting.currentGuide(model).strokes[0]!
    const [held] = mutedUpdate(model, Handwriting.PenStarted({ id: 1, ...stroke[0]!, revision: 0 }))
    Scene.scene(
      { update: mutedUpdate, view }, Scene.with(held),
      Scene.Mount.resolveAll(boardMounted()),
      Scene.expectAll(Scene.all.selector('.handwriting-stroke-badge')).toHaveCount(2),
      Scene.expectAll(Scene.all.selector('.handwriting-direction')).toHaveCount(2),
      Scene.tap(simulation => expect(Scene.findAll(simulation.html, '.handwriting-stroke-number').map(Scene.textContent)).toEqual(['2', '3'])),
      Scene.expect(Scene.selector('g')).toHaveAttr('aria-hidden', 'true'),
      Scene.Command.expectNone(),
    )
  })

  it('localizes stroke numbers while leaving a lowercase dot without a misleading direction arrow', () => {
    Scene.scene(
      { update: mutedUpdate, view: (model: Handwriting.Model) => Handwriting.view(model, 'fa') }, Scene.with(target(HANDWRITING_LETTERS.indexOf('i'), 'lower')),
      Scene.Mount.resolveAll(boardMounted()),
      Scene.expectAll(Scene.all.selector('.handwriting-stroke-badge')).toHaveCount(2),
      Scene.expectAll(Scene.all.selector('.handwriting-direction')).toHaveCount(1),
      Scene.tap(simulation => expect(Scene.findAll(simulation.html, '.handwriting-stroke-number').map(Scene.textContent)).toEqual(['۱', '۲'])),
      Scene.Command.expectNone(),
    )
  })

  it('changes cases and words through native buttons and keeps Latin writing left to right in Persian', () => {
    Scene.scene(
      { update: mutedUpdate, view: (model: Handwriting.Model) => Handwriting.view(model, 'fa') }, Scene.with(Handwriting.init()),
      Scene.Mount.resolveAll(boardMounted()),
      Scene.click(Scene.role('button', { name: t('handwritingLowercaseLabel', 'fa') })),
      Scene.expect(Scene.role('button', { name: 'a' })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('button', { name: t('handwritingLowercaseLabel', 'fa') })).toHaveAttr('aria-pressed', 'true'),
      Scene.click(Scene.role('button', { name: t('handwritingWords', 'fa') })),
      Scene.expect(Scene.role('button', { name: t('handwritingWords', 'fa') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expectAll(Scene.all.selector('.handwriting-choice')).toHaveCount(32),
      Scene.expectAll(Scene.all.role('group', { name: t('handwritingLetters', 'fa') })).toBeEmpty(),
      Scene.expect(Scene.selector('.handwriting-choice[aria-pressed="true"]')).toContainText('cat'),
      Scene.expect(Scene.selector('.handwriting-target')).toHaveAttr('dir', 'ltr'),
      Scene.expect(Scene.role('application', { name: tf('handwritingBoard', 'fa', 'cat') })).toHaveAttr('viewBox', '0 0 320 160'),
      Scene.Command.expectNone(),
    )
  })
})
