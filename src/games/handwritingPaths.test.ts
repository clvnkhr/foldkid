import { describe, expect, it } from 'vitest'

import { cursiveJoinStarts } from './handwritingCursive'
import {
  advanceHandwritingStroke, HANDWRITING_LETTERS, HANDWRITING_NUMBERS, HANDWRITING_TOLERANCE, HANDWRITING_WORDS,
  handwritingGuide, handwritingPath, handwritingResumeDistance, type HandwritingPoint, type HandwritingStroke,
} from './handwritingPaths'

const distance = (from: HandwritingPoint, to: HandwritingPoint): number => Math.hypot(from.x - to.x, from.y - to.y)
const completeTrace = (points: HandwritingStroke): number => {
  let progress = advanceHandwritingStroke(points, 0, points[0]!, points[0]!)
  for (let index = 1; index < points.length; index++) {
    const advanced = advanceHandwritingStroke(points, progress, points[index - 1]!, points[index]!)
    expect(advanced).toBeGreaterThanOrEqual(progress)
    expect(advanced).toBeLessThanOrEqual(points.length)
    progress = advanced
  }
  return progress
}

describe('handwriting stroke guides', () => {
  it('offers all English letters and at least twenty unique illustrated three-letter words', () => {
    expect(HANDWRITING_LETTERS.join('')).toBe('abcdefghijklmnopqrstuvwxyz')
    expect(new Set(HANDWRITING_LETTERS).size).toBe(26)
    expect(HANDWRITING_WORDS.length).toBeGreaterThanOrEqual(20)
    expect(new Set(HANDWRITING_WORDS.map(word => word.text)).size).toBe(HANDWRITING_WORDS.length)
    for (const word of HANDWRITING_WORDS) {
      expect(word.text).toMatch(/^[a-z]{3}$/)
      expect(word.emoji.trim()).not.toBe('')
    }
  })

  for (const letterCase of ['upper', 'lower'] as const) {
    it.each(HANDWRITING_LETTERS.map((letter, index) => ({ letter, index })))(`makes a finite, evenly sampled and traceable ${letterCase} $letter`, ({ letter, index }) => {
      const guide = handwritingGuide('letters', letterCase, index)
      expect(guide.text).toBe(letterCase === 'upper' ? letter.toUpperCase() : letter)
      expect(guide.emoji).toBe('')
      expect([guide.width, guide.height]).toEqual([100, 160])
      expect(guide.strokes.length).toBeGreaterThan(0)
      for (const points of guide.strokes) {
        expect(points.length).toBeGreaterThan(1)
        const steps: number[] = []
        for (const [sample, point] of points.entries()) {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
          expect(point.x).toBeGreaterThanOrEqual(15 - 0.000001)
          expect(point.x).toBeLessThanOrEqual(85 + 0.000001)
          expect(point.y).toBeGreaterThanOrEqual(20)
          expect(point.y).toBeLessThanOrEqual(140)
          if (sample > 0) steps.push(distance(points[sample - 1]!, point))
        }
        expect(steps.every(step => step > 0 && step <= 5.51)).toBe(true)
        if (steps.length > 3) {
          const ordered = steps.slice(0, -1).sort((a, b) => a - b)
          expect(ordered[Math.floor(ordered.length / 2)]).toBeGreaterThan(5.3)
        }
        expect(handwritingPath(points)).toMatch(/^M[\d.]+ [\d.]+ L/)
        expect(completeTrace(points)).toBe(points.length)
      }
    })

    it.each(HANDWRITING_WORDS.map((word, index) => ({ ...word, index })))(`assembles the ${letterCase} word $text with its exact letter guides`, ({ text, emoji, index }) => {
      const guide = handwritingGuide('words', letterCase, index)
      expect(guide.text).toBe(letterCase === 'upper' ? text.toUpperCase() : text)
      expect(guide.emoji).toBe(emoji)
      expect([guide.width, guide.height]).toEqual([320, 160])
      const expected = [...text].flatMap((letter, position) =>
        handwritingGuide('letters', letterCase, HANDWRITING_LETTERS.indexOf(letter)).strokes.map(points =>
          points.map(({ x, y }) => ({ x: x + 110 * position, y })),
        ),
      )
      expect(guide.strokes).toEqual(expected)
      for (const points of guide.strokes) expect(completeTrace(points)).toBe(points.length)
    })
  }

  it('uses a distinct guide for every letter and case', () => {
    const identities = ['upper', 'lower'].flatMap(letterCase => HANDWRITING_LETTERS.map((_, index) =>
      handwritingGuide('letters', letterCase as 'upper' | 'lower', index).strokes.map(handwritingPath).join('|'),
    ))
    expect(new Set(identities).size).toBe(52)
  })

  it('preserves counters, separate bars and the small dots on lowercase i and j', () => {
    const letter = (text: string, letterCase: 'upper' | 'lower') => handwritingGuide('letters', letterCase, HANDWRITING_LETTERS.indexOf(text)).strokes
    expect(letter('a', 'upper')).toHaveLength(3)
    expect(letter('h', 'upper')).toHaveLength(3)
    expect(letter('x', 'upper')).toHaveLength(2)
    for (const letterCase of ['upper', 'lower'] as const) {
      const counter = letter('o', letterCase)[0]!
      expect(distance(counter[0]!, counter.at(-1)!)).toBeLessThan(0.02)
      expect(new Set(counter.map(point => point.x.toFixed(1))).size).toBeGreaterThan(10)
      expect(new Set(counter.map(point => point.y.toFixed(1))).size).toBeGreaterThan(10)
    }
    for (const text of ['i', 'j']) {
      const [stem, dot] = letter(text, 'lower')
      expect(dot).toHaveLength(2)
      expect(Math.max(...dot!.map(point => point.y))).toBeLessThan(Math.min(...stem!.map(point => point.y)))
    }
  })

  it.each([-1, 26, 1000, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('safely uses the first letter for invalid index %s', index => {
    expect(handwritingGuide('letters', 'upper', index)).toBe(handwritingGuide('letters', 'upper', 0))
  })

  it.each([-1, HANDWRITING_WORDS.length, 0.5, Number.NaN])('safely uses the first word for invalid index %s', index => {
    expect(handwritingGuide('words', 'lower', index)).toBe(handwritingGuide('words', 'lower', 0))
  })

  it('returns stable immutable guides without rebuilding their stroke samples', () => {
    const guide = handwritingGuide('letters', 'lower', 0)
    const expected = structuredClone(guide)
    expect(handwritingGuide('letters', 'lower', 0)).toBe(guide)
    expect(handwritingGuide('words', 'upper', 0)).toBe(handwritingGuide('words', 'upper', 0))
    expect(Object.isFrozen(guide)).toBe(true)
    expect(Object.isFrozen(guide.strokes)).toBe(true)
    expect(Object.isFrozen(guide.strokes[0])).toBe(true)
    const mutablePoint = guide.strokes[0]![0]! as { x: number }
    expect(() => { mutablePoint.x = 999 }).toThrow(TypeError)
    expect(handwritingGuide('letters', 'lower', 0)).toEqual(expected)
  })

  it('creates compact SVG polylines and safely rejects non-finite coordinates', () => {
    expect(handwritingPath([{ x: 1.234, y: 2.345 }, { x: 10, y: 20 }])).toBe('M1.23 2.35 L10 20')
    expect(handwritingPath([])).toBe('')
    expect(handwritingPath([{ x: Number.NaN, y: 20 }])).toBe('')
    expect(handwritingPath([{ x: 10, y: Number.POSITIVE_INFINITY }])).toBe('')
  })
})

describe('cursive and numeric stroke guides', () => {
  it('offers the ten decimal digits in counting order', () => {
    expect(HANDWRITING_NUMBERS).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(new Set(HANDWRITING_NUMBERS).size).toBe(10)
  })

  for (const letterCase of ['upper', 'lower'] as const) {
    it.each(HANDWRITING_LETTERS.map((letter, index) => ({ letter, index })))(`provides a finite, evenly sampled cursive ${letterCase} $letter that can be traced fully`, ({ letter, index }) => {
      const guide = handwritingGuide('letters', letterCase, index, 'cursive')
      expect(guide.text).toBe(letterCase === 'upper' ? letter.toUpperCase() : letter)
      expect([guide.width, guide.height]).toEqual([100, 160])
      expect(guide.emoji).toBe('')
      expect(guide.strokes.length).toBeGreaterThan(0)
      for (const points of guide.strokes) {
        expect(points.length).toBeGreaterThan(1)
        for (const [sample, point] of points.entries()) {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
          expect(point.x).toBeGreaterThanOrEqual(8)
          expect(point.x).toBeLessThanOrEqual(92)
          expect(point.y).toBeGreaterThanOrEqual(20)
          expect(point.y).toBeLessThanOrEqual(145)
          if (sample > 0) {
            expect(distance(points[sample - 1]!, point)).toBeGreaterThan(0)
            expect(distance(points[sample - 1]!, point)).toBeLessThanOrEqual(5.51)
          }
        }
        expect(completeTrace(points)).toBe(points.length)
      }
      if (letterCase === 'lower') expect(guide.strokes[0]![0]).toEqual({ x: 15, y: 115 })
    })
  }

  it('uses distinct cursive forms for every letter and preserves the existing print guides', () => {
    const identities = ['upper', 'lower'].flatMap(letterCase => HANDWRITING_LETTERS.map((_, index) =>
      handwritingGuide('letters', letterCase as 'upper' | 'lower', index, 'cursive').strokes.map(handwritingPath).join('|'),
    ))
    expect(new Set(identities).size).toBe(52)
    for (const [index] of HANDWRITING_LETTERS.entries()) {
      expect(handwritingGuide('letters', 'lower', index, 'cursive').strokes.map(handwritingPath)).not.toEqual(handwritingGuide('letters', 'lower', index).strokes.map(handwritingPath))
      expect(handwritingGuide('letters', 'lower', index, 'print')).toBe(handwritingGuide('letters', 'lower', index))
    }
  })

  it.each(HANDWRITING_NUMBERS.map((number, index) => ({ number, index })))('makes digit $number traceable with finite samples and one case-independent guide', ({ number, index }) => {
    const guide = handwritingGuide('numbers', 'upper', index)
    expect(guide.text).toBe(number)
    expect(guide.emoji).toBe('')
    expect([guide.width, guide.height]).toEqual([100, 160])
    expect(guide.strokes.length).toBeGreaterThan(0)
    expect(handwritingGuide('numbers', 'lower', index, 'cursive')).toBe(guide)
    for (const points of guide.strokes) {
      expect(points.length).toBeGreaterThan(1)
      for (const [sample, point] of points.entries()) {
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
        expect(point.x).toBeGreaterThanOrEqual(15)
        expect(point.x).toBeLessThanOrEqual(85)
        expect(point.y).toBeGreaterThanOrEqual(20)
        expect(point.y).toBeLessThanOrEqual(140)
        if (sample > 0) expect(distance(points[sample - 1]!, point)).toBeLessThanOrEqual(5.51)
      }
      expect(completeTrace(points)).toBe(points.length)
    }
  })

  it.each(HANDWRITING_WORDS.map((word, index) => ({ ...word, index })))('joins cursive $text into one complete word stroke before its detached marks', ({ text, emoji, index }) => {
    const guide = handwritingGuide('words', 'lower', index, 'cursive')
    expect(guide.text).toBe(text)
    expect(guide.emoji).toBe(emoji)
    expect([guide.width, guide.height]).toEqual([270, 160])
    const main = guide.strokes[0]!
    expect(main[0]).toEqual({ x: 15, y: 115 })
    expect(Math.max(...main.map(point => point.x)) - Math.min(...main.map(point => point.x))).toBeGreaterThan(210)
    expect(guide.strokes).toHaveLength(1 + [...text].filter(letter => ['i', 'j', 't', 'x'].includes(letter)).length)
    for (const points of guide.strokes) {
      for (const [sample, point] of points.entries()) {
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThanOrEqual(guide.width)
        expect(point.y).toBeGreaterThanOrEqual(20)
        expect(point.y).toBeLessThanOrEqual(145)
        if (sample > 0) expect(distance(points[sample - 1]!, point)).toBeLessThanOrEqual(5.51)
      }
      expect(completeTrace(points)).toBe(points.length)
    }
    expect(advanceHandwritingStroke(main, 0, main[0]!, main.at(-1)!)).toBeLessThan(main.length)
  })

  it('finishes the cursive word body before crossing t or dotting i', () => {
    const cat = handwritingGuide('words', 'lower', HANDWRITING_WORDS.findIndex(word => word.text === 'cat'), 'cursive')
    const pig = handwritingGuide('words', 'lower', HANDWRITING_WORDS.findIndex(word => word.text === 'pig'), 'cursive')
    expect(cat.strokes).toHaveLength(2)
    const bar = cat.strokes[1]!
    expect(Math.max(...bar.map(point => point.y)) - Math.min(...bar.map(point => point.y))).toBeLessThan(4)
    expect(bar.at(-1)!.x).toBeGreaterThan(bar[0]!.x)
    expect(Math.min(...bar.map(point => point.x))).toBeGreaterThan(170)
    expect(pig.strokes).toHaveLength(2)
    const dot = pig.strokes[1]!
    expect(dot).toHaveLength(2)
    expect(dot.every(point => point.y < 60)).toBe(true)
    expect(dot[0]!.x).toBeGreaterThan(85)
    expect(dot[0]!.x).toBeLessThan(170)
  })

  it('joins the high exit of o directly into w without dipping back to the baseline', () => {
    const owl = handwritingGuide('words', 'lower', HANDWRITING_WORDS.findIndex(word => word.text === 'owl'), 'cursive')
    expect(owl.strokes).toHaveLength(1)
    const bridge = owl.strokes[0]!.filter(point => point.x > 90 && point.x < 105)
    expect(bridge.length).toBeGreaterThan(1)
    expect(bridge.every(point => point.y < 85)).toBe(true)
  })

  it.each(['a', 'g', 'q'])('keeps the oval body of cursive %s after its joining entry', letter => {
    const main = handwritingGuide('letters', 'lower', HANDWRITING_LETTERS.indexOf(letter), 'cursive').strokes[0]!
    const body = main.slice(cursiveJoinStarts[letter]).filter(point => point.y >= 65 && point.y <= 115)
    expect(body.some(point => point.x < 35)).toBe(true)
    expect(body.some(point => point.y > 110)).toBe(true)
  })

  it.each(['bag', 'bat'])('retains the full a oval after the high exit of b in %s', text => {
    const main = handwritingGuide('words', 'lower', HANDWRITING_WORDS.findIndex(word => word.text === text), 'cursive').strokes[0]!
    const bottomOfA = main.filter(point => point.x > 108 && point.x < 135 && point.y > 110 && point.y <= 120)
    expect(bottomOfA.length).toBeGreaterThan(1)
  })

  it('keeps cursive loops and numeral curves forgiving of a finger-width wobble', () => {
    const guides = (['upper', 'lower'] as const).flatMap(letterCase => HANDWRITING_LETTERS.map((_, index) => handwritingGuide('letters', letterCase, index, 'cursive')))
    guides.push(...HANDWRITING_NUMBERS.map((_, index) => handwritingGuide('numbers', 'upper', index)))
    for (const guide of guides) for (const points of guide.strokes) {
      const input = points.map((point, sample) => ({ x: point.x + (sample % 2 === 0 ? 14 : 16), y: point.y }))
      let progress = advanceHandwritingStroke(points, 0, input[0]!, input[0]!)
      for (let sample = 1; sample < input.length; sample++) progress = advanceHandwritingStroke(points, progress, input[sample - 1]!, input[sample]!)
      expect(progress, `${guide.text} forgiving trace`).toBe(points.length)
    }
  })

  it('uses a closed zero, an open four and a continuous figure eight with familiar downward strokes', () => {
    const zero = handwritingGuide('numbers', 'upper', 0).strokes[0]!
    expect(distance(zero[0]!, zero.at(-1)!)).toBeLessThan(0.02)
    expect(zero[1]!.x).toBeLessThan(zero[0]!.x)
    expect(zero[1]!.y).toBeLessThan(zero[0]!.y)
    const [diagonal, stem] = handwritingGuide('numbers', 'upper', 4).strokes
    expect(diagonal![1]!.x).toBeLessThan(diagonal![0]!.x)
    expect(diagonal![1]!.y).toBeGreaterThan(diagonal![0]!.y)
    expect(diagonal!.at(-1)!.x).toBeGreaterThan(diagonal![0]!.x)
    expect(stem![0]!.y).toBeLessThan(stem!.at(-1)!.y)
    expect(stem!.every(point => point.x === stem![0]!.x)).toBe(true)
    const eight = handwritingGuide('numbers', 'upper', 8)
    expect(eight.strokes).toHaveLength(1)
    expect(distance(eight.strokes[0]![0]!, eight.strokes[0]!.at(-1)!)).toBeLessThan(0.02)
    const body = eight.strokes[0]!
    expect(body.filter(point => point.y < 60).some(point => point.x < 35)).toBe(true)
    expect(body.filter(point => point.y > 85).some(point => point.x < 35)).toBe(true)
    expect(body.filter(point => point.y > 85).some(point => point.x > 70)).toBe(true)
  })

  it.each([-1, 10, 1000, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('falls back to digit zero for invalid index %s', index => {
    expect(handwritingGuide('numbers', 'lower', index, 'cursive')).toBe(handwritingGuide('numbers', 'upper', 0))
  })

  it('caches immutable cursive and numeric guides just as it caches print guides', () => {
    for (const guide of [handwritingGuide('letters', 'lower', 0, 'cursive'), handwritingGuide('words', 'lower', 0, 'cursive'), handwritingGuide('numbers', 'upper', 0)]) {
      expect(Object.isFrozen(guide)).toBe(true)
      expect(Object.isFrozen(guide.strokes)).toBe(true)
      expect(Object.isFrozen(guide.strokes[0])).toBe(true)
      expect(Object.isFrozen(guide.strokes[0]![0])).toBe(true)
    }
    expect(handwritingGuide('letters', 'lower', 0, 'cursive')).toBe(handwritingGuide('letters', 'lower', 0, 'cursive'))
    expect(handwritingGuide('words', 'lower', 0, 'cursive')).toBe(handwritingGuide('words', 'lower', 0, 'cursive'))
  })
})

describe('natural handwriting formation', () => {
  const letter = (text: string, letterCase: 'upper' | 'lower' = 'upper') =>
    handwritingGuide('letters', letterCase, HANDWRITING_LETTERS.indexOf(text)).strokes
  const ends = (points: HandwritingStroke) => [points[0], points.at(-1)]

  it('starts both uppercase A legs at the apex and draws the crossbar left to right', () => {
    const [left, right, bar] = letter('a')
    expect(ends(left!)).toEqual([{ x: 50, y: 25 }, { x: 20, y: 120 }])
    expect(ends(right!)).toEqual([{ x: 50, y: 25 }, { x: 80, y: 120 }])
    expect(ends(bar!)).toEqual([{ x: 32, y: 82 }, { x: 68, y: 82 }])
    expect(left![1]!.y).toBeGreaterThan(left![0]!.y)
    expect(right![1]!.y).toBeGreaterThan(right![0]!.y)
  })

  it.each(['e', 'f'])('draws uppercase %s down its stem before separate left-to-right bars', text => {
    const [stem, ...bars] = letter(text)
    expect(ends(stem!)).toEqual([{ x: 20, y: 25 }, { x: 20, y: 120 }])
    expect(bars).toHaveLength(text === 'e' ? 3 : 2)
    expect(bars.map(points => points[0]!.y)).toEqual(text === 'e' ? [25, 72, 120] : [25, 72])
    for (const bar of bars) {
      expect(bar[0]!.x).toBe(20)
      expect(bar.at(-1)!.x).toBeGreaterThan(bar[0]!.x)
      expect(bar.every(point => point.y === bar[0]!.y)).toBe(true)
    }
  })

  it.each(['m', 'n'])('starts uppercase %s with a downward left stem and finishes with a downward right stem', text => {
    const [left, diagonal, right] = letter(text)
    expect(left![0]!.y).toBe(25)
    expect(left!.at(-1)!.y).toBe(120)
    expect(left!.every(point => point.x === left![0]!.x)).toBe(true)
    expect(diagonal![0]).toEqual(left![0])
    expect(diagonal![1]!.x).toBeGreaterThan(diagonal![0]!.x)
    expect(diagonal![1]!.y).toBeGreaterThan(diagonal![0]!.y)
    expect(right![0]!.y).toBe(25)
    expect(right!.at(-1)!.y).toBe(120)
    expect(right!.every(point => point.x === right![0]!.x)).toBe(true)
  })

  it('draws both uppercase Y branches downward and continues the right branch into its stem', () => {
    const [left, right] = letter('y')
    expect(ends(left!)).toEqual([{ x: 20, y: 25 }, { x: 50, y: 72 }])
    expect(ends(right!)).toEqual([{ x: 80, y: 25 }, { x: 50, y: 120 }])
    expect(right![1]!.y).toBeGreaterThan(right![0]!.y)
    expect(Math.min(...right!.map(point => point.y))).toBe(25)
  })

  it.each([
    { text: 'o', letterCase: 'upper' as const }, { text: 'q', letterCase: 'upper' as const },
    ...['a', 'd', 'g', 'o', 'q'].map(text => ({ text, letterCase: 'lower' as const })),
  ])('starts $letterCase $text counters at the upper right and curves anticlockwise', ({ text, letterCase }) => {
    const counter = letter(text, letterCase)[0]!
    const centerX = (Math.min(...counter.map(point => point.x)) + Math.max(...counter.map(point => point.x))) / 2
    const centerY = (Math.min(...counter.map(point => point.y)) + Math.max(...counter.map(point => point.y))) / 2
    expect(counter[0]!.x).toBeGreaterThan(centerX)
    expect(counter[0]!.y).toBeLessThan(centerY)
    expect(counter[1]!.x).toBeLessThan(counter[0]!.x)
    expect(counter[1]!.y).toBeLessThan(counter[0]!.y)
    expect(distance(counter[0]!, counter.at(-1)!)).toBeLessThan(0.02)
  })

  it.each(['b', 'h', 'm', 'n', 'p', 'r'])('keeps the lowercase %s downstroke and retraced arch connected', text => {
    const strokes = letter(text, 'lower')
    expect(strokes).toHaveLength(1)
    const points = strokes[0]!
    const stemX = points[0]!.x
    expect(points[1]!.x).toBe(stemX)
    expect(points[1]!.y).toBeGreaterThan(points[0]!.y)
    const turn = points.findIndex((point, index) => index > 0 && point.y < points[index - 1]!.y)
    expect(turn).toBeGreaterThan(5)
    expect(points[turn]!.x).toBe(stemX)
    const shoulder = points.findIndex((point, index) => index > turn && point.x > stemX + 5)
    expect(shoulder).toBeGreaterThan(turn)
    expect(points[shoulder]!.y).toBeLessThan(points[turn - 1]!.y - 15)
    expect(completeTrace(points)).toBe(points.length)
  })

  it('continues uppercase G from its open curve into the inward crossbar without another start', () => {
    const [points] = letter('g')
    expect(letter('g')).toHaveLength(1)
    expect(points![0]).toEqual(letter('c')[0]![0])
    expect(points!.at(-1)).toEqual({ x: 50, y: 78 })
    const end = points!.slice(-3)
    expect(end.every(point => point.y === 78)).toBe(true)
    expect(end[1]!.x).toBeLessThan(end[0]!.x)
  })

  it('connects the uppercase R bow to its diagonal leg instead of introducing a floating start', () => {
    const [stem, bow] = letter('r')
    expect(letter('r')).toHaveLength(2)
    expect(ends(stem!)).toEqual([{ x: 20, y: 25 }, { x: 20, y: 120 }])
    expect(ends(bow!)).toEqual([{ x: 20, y: 25 }, { x: 85, y: 120 }])
    expect(Math.min(...bow!.map(point => distance(point, { x: 20, y: 75 })))).toBeLessThan(3)
    expect(bow!.at(-1)!.y).toBeGreaterThan(bow!.at(-2)!.y)
    expect(bow!.at(-1)!.x).toBeGreaterThan(bow!.at(-2)!.x)
  })

  it('keeps lowercase u connected and draws its final right stem downward', () => {
    const [points] = letter('u', 'lower')
    expect(letter('u', 'lower')).toHaveLength(1)
    expect(ends(points!)).toEqual([{ x: 25, y: 65 }, { x: 75, y: 115 }])
    expect(points![1]!.y).toBeGreaterThan(points![0]!.y)
    expect(points!.at(-1)!.y).toBeGreaterThan(points!.at(-2)!.y)
  })

  it('joins both lowercase y diagonals before the right stroke continues into its descender', () => {
    const [left, right] = letter('y', 'lower')
    const junction = left!.at(-1)!
    const start = right![0]!
    const end = right!.at(-1)!
    const fraction = (junction.y - start.y) / (end.y - start.y)
    expect(fraction).toBeGreaterThan(0)
    expect(fraction).toBeLessThan(1)
    expect(junction.x).toBeCloseTo(start.x + (end.x - start.x) * fraction)
  })

  it('starts lowercase f at its upper hook and curves over into its downward stem', () => {
    const [hook, bar] = letter('f', 'lower')
    expect(hook![0]!.x).toBeGreaterThan(hook!.at(-1)!.x)
    expect(hook![0]!.y).toBeLessThan(45)
    expect(hook![1]!.x).toBeLessThan(hook![0]!.x)
    expect(hook!.at(-1)!.y).toBe(115)
    expect(bar![0]!.x).toBeLessThan(bar!.at(-1)!.x)
  })
})

describe('handwriting tracing', () => {
  const straight = handwritingGuide('letters', 'upper', HANDWRITING_LETTERS.indexOf('h')).strokes[0]!
  const curve = handwritingGuide('letters', 'upper', HANDWRITING_LETTERS.indexOf('c')).strokes[0]!

  it('accepts a fast continuous straight stroke without requiring one event per dot', () => {
    expect(advanceHandwritingStroke(straight, 0, straight[0]!, straight.at(-1)!)).toBe(straight.length)
  })

  it('resumes from the current sample and advances monotonically', () => {
    const first = advanceHandwritingStroke(straight, 0, straight[0]!, straight[5]!)
    expect(first).toBeGreaterThan(5)
    expect(first).toBeLessThan(straight.length)
    expect(advanceHandwritingStroke(straight, first, straight[first - 1]!, straight.at(-1)!)).toBe(straight.length)
    expect(advanceHandwritingStroke(straight, straight.length, straight.at(-1)!, straight[0]!)).toBe(straight.length)
  })

  it('accepts a nearby trace but rejects the same movement outside the stroke tolerance', () => {
    const shifted = (point: HandwritingPoint, offset: number) => ({ x: point.x + offset, y: point.y })
    expect(advanceHandwritingStroke(straight, 0, shifted(straight[0]!, HANDWRITING_TOLERANCE - 1), shifted(straight.at(-1)!, HANDWRITING_TOLERANCE - 1))).toBe(straight.length)
    expect(advanceHandwritingStroke(straight, 0, shifted(straight[0]!, HANDWRITING_TOLERANCE + 1), shifted(straight.at(-1)!, HANDWRITING_TOLERANCE + 1))).toBe(0)
  })

  it('rejects a chord through a curved guide and follows the actual curve instead', () => {
    expect(advanceHandwritingStroke(curve, 0, curve[0]!, curve.at(-1)!)).toBe(0)
    expect(completeTrace(curve)).toBe(curve.length)
    const loop = handwritingGuide('letters', 'lower', HANDWRITING_LETTERS.indexOf('o')).strokes[0]!
    expect(advanceHandwritingStroke(loop, 0, loop[0]!, loop.at(-1)!)).toBeLessThan(loop.length / 4)
    expect(completeTrace(loop)).toBe(loop.length)
  })

  it('accepts a rough oval with only four movements around its curve', () => {
    const points = handwritingGuide('letters', 'lower', HANDWRITING_LETTERS.indexOf('o')).strokes[0]!
    let progress = advanceHandwritingStroke(points, 0, points[0]!, points[0]!)
    let from = points[0]!
    for (let quarter = 1; quarter <= 4; quarter++) {
      const to = points[Math.round((points.length - 1) * quarter / 4)]!
      progress = advanceHandwritingStroke(points, progress, from, to)
      from = to
    }
    expect(progress).toBe(points.length)
    expect(completeTrace(points)).toBe(points.length)
  })

  it('accepts wobbly traces across every uppercase and lowercase guide', () => {
    for (const letterCase of ['upper', 'lower'] as const) for (const [index, letter] of HANDWRITING_LETTERS.entries()) {
      for (const points of handwritingGuide('letters', letterCase, index).strokes) {
        const input = points.map((point, sample) => ({ x: point.x + (sample % 2 === 0 ? 14 : 16), y: point.y }))
        let progress = advanceHandwritingStroke(points, 0, input[0]!, input[0]!)
        for (let sample = 1; sample < input.length; sample++) progress = advanceHandwritingStroke(points, progress, input[sample - 1]!, input[sample]!)
        expect(progress, `${letterCase} ${letter}`).toBe(points.length)
      }
    }
  })

  it('rejoins after a brief slip without crediting distant off-guide jumps', () => {
    const progress = advanceHandwritingStroke(straight, 0, straight[0]!, straight[6]!)
    const outside = { x: 90, y: straight[6]!.y }
    expect(advanceHandwritingStroke(straight, progress, straight[6]!, outside)).toBe(progress)
    const rejoined = advanceHandwritingStroke(straight, progress, outside, straight[11]!)
    expect(rejoined).toBeGreaterThan(progress)
    expect(rejoined).toBeLessThan(straight.length)
    const beginning = advanceHandwritingStroke(straight, 0, straight[0]!, straight[0]!)
    expect(advanceHandwritingStroke(straight, beginning, outside, straight.at(-1)!)).toBe(beginning)
  })

  it('resumes on nearby existing ink while ignoring old stroke starts and completed strokes', () => {
    const progress = advanceHandwritingStroke(straight, 0, straight[0]!, straight[9]!)
    const behind = straight[progress - 5]!
    expect(handwritingResumeDistance(straight, progress, behind)).toBe(0)
    expect(advanceHandwritingStroke(straight, progress, behind, straight.at(-1)!)).toBe(straight.length)
    expect(handwritingResumeDistance(straight, progress, straight[0]!)).toBeGreaterThan(HANDWRITING_TOLERANCE)
    expect(handwritingResumeDistance(straight, straight.length, straight.at(-1)!)).toBe(Infinity)
    expect(handwritingResumeDistance(straight, Number.NaN, straight[0]!)).toBe(Infinity)
    expect(handwritingResumeDistance(straight, progress, { x: Infinity, y: 0 })).toBe(Infinity)
  })

  it('rejects diagonal corner cutting and wild jumps to another letter or past the guide', () => {
    const corner = handwritingGuide('letters', 'upper', HANDWRITING_LETTERS.indexOf('l')).strokes[0]!
    expect(advanceHandwritingStroke(corner, 0, corner[0]!, corner.at(-1)!)).toBe(0)
    expect(advanceHandwritingStroke(straight, 0, straight[0]!, { x: straight.at(-1)!.x + 110, y: straight.at(-1)!.y })).toBe(0)
    expect(advanceHandwritingStroke(straight, 0, straight[0]!, { x: straight.at(-1)!.x, y: 1000 })).toBe(0)
    expect(advanceHandwritingStroke(straight, 0, { x: -100, y: -100 }, straight.at(-1)!)).toBe(0)
    expect(advanceHandwritingStroke(straight, 0, { x: straight.at(-1)!.x + 110, y: straight.at(-1)!.y }, straight[0]!)).toBe(0)
  })

  it('leaves valid progress unchanged for non-finite coordinates and malformed guide points', () => {
    for (const invalid of [{ x: Number.NaN, y: 20 }, { x: 20, y: Number.POSITIVE_INFINITY }]) {
      expect(advanceHandwritingStroke(straight, 3, invalid, straight.at(-1)!)).toBe(3)
      expect(advanceHandwritingStroke(straight, 3, straight[2]!, invalid)).toBe(3)
    }
    expect(advanceHandwritingStroke([{ x: Number.NaN, y: 20 }], 0, { x: 20, y: 20 }, { x: 20, y: 20 })).toBe(0)
    expect(advanceHandwritingStroke([], 0, { x: 20, y: 20 }, { x: 20, y: 20 })).toBe(0)
  })

  it('keeps malformed progress within the valid sample range without advancing', () => {
    for (const progress of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(advanceHandwritingStroke(straight, progress, straight[0]!, straight.at(-1)!)).toBe(0)
    }
    expect(advanceHandwritingStroke(straight, straight.length + 1, straight[0]!, straight.at(-1)!)).toBe(straight.length)
  })
})
