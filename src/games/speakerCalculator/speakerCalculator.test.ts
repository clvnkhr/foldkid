import { describe, expect, it } from 'vitest'
import { Story } from 'foldkit'

import {
  ClickedClear,
  ClickedDecimal,
  ClickedDelete,
  ClickedDigit,
  ClickedEquals,
  ClickedNegate,
  ClickedOperator,
  ClickedPercent,
  ClickedRandom,
  ClickedSay,
  init,
  SpeakCompleted,
  update,
} from './main'

const resolveSpeak = [{ name: 'Speak' }, SpeakCompleted()] as const

describe('SpeakerCalculator', () => {
  it('init state', () => {
    expect(init).toStrictEqual({ display: '0', isResult: false, theme: 0 })
  })

  it('clears display', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedClear()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('0')
        expect(model.isResult).toBe(false)
      }),
    )
  })

  it('adds digit to display', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '5' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('5')
        expect(model.isResult).toBe(false)
      }),
    )
  })

  it('appends multiple digits', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '1' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedDigit({ digit: '2' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedDigit({ digit: '3' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('123')
      }),
    )
  })

  it('delete removes last character', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '4' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedDigit({ digit: '2' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedDelete()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('4')
      }),
    )
  })

  it('delete on single digit resets to zero', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '7' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedDelete()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('0')
      }),
    )
  })

  it('negate toggles sign of single number', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '5' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedNegate()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('-5')
      }),
      Story.message(ClickedNegate()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('5')
      }),
    )
  })

  it('percent divides by 100', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '5' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedDigit({ digit: '0' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedPercent()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('0.5')
      }),
    )
  })

  it('random produces a number 1-100', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedRandom()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        const n = parseInt(model.display, 10)
        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(100)
        expect(model.isResult).toBe(true)
      }),
    )
  })

  it('say does not change display', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '9' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedSay()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('9')
      }),
    )
  })

  it('clears display on digit press after result', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '1' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedOperator({ operator: '+' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedDigit({ digit: '2' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedEquals()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('3')
        expect(model.isResult).toBe(true)
      }),
      Story.message(ClickedDigit({ digit: '7' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('7')
        expect(model.isResult).toBe(false)
      }),
    )
  })

  it('adds operator to display', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '5' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedOperator({ operator: '+' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('5+')
        expect(model.isResult).toBe(false)
      }),
    )
  })

  it('replaces trailing operator', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '5' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedOperator({ operator: '+' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedOperator({ operator: '-' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('5-')
      }),
    )
  })

  it('adds decimal', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDecimal()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('0.')
      }),
    )
  })

  it('does not add duplicate decimal', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '5' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedDecimal()),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedDecimal()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('5.')
      }),
    )
  })

  it('evaluates addition', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '1' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedOperator({ operator: '+' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedDigit({ digit: '2' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedEquals()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('3')
        expect(model.isResult).toBe(true)
      }),
    )
  })

  it('evaluates multiplication', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '6' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedOperator({ operator: '*' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedDigit({ digit: '7' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedEquals()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('42')
      }),
    )
  })

  it('evaluates division', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedDigit({ digit: '8' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedOperator({ operator: '/' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedDigit({ digit: '2' })),
      Story.Command.resolveAll(resolveSpeak),
      Story.message(ClickedEquals()),
      Story.Command.resolveAll(resolveSpeak),
      Story.model((model) => {
        expect(model.display).toBe('4')
      }),
    )
  })
})
