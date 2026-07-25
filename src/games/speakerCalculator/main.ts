import { Match as M, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { speak, type SpeechOptions } from '../../speech'
import { t } from '../../i18n'

// MODEL

const THEME_COUNT = 5

export const Model = S.Struct({
  display: S.String,
  isResult: S.Boolean,
  theme: S.Number,
})
export type Model = typeof Model.Type

export const init: Model = { display: '0', isResult: false, theme: 0 }

// MESSAGE

export const ClickedClear = m('ClickedClear')
export const ClickedClearEntry = m('ClickedClearEntry')
export const ClickedDelete = m('ClickedDelete')
export const ClickedDigit = m('ClickedDigit', { digit: S.String })
export const ClickedOperator = m('ClickedOperator', { operator: S.String })
export const ClickedDecimal = m('ClickedDecimal')
export const ClickedEquals = m('ClickedEquals')
export const ClickedNegate = m('ClickedNegate')
export const ClickedPercent = m('ClickedPercent')
export const ClickedRandom = m('ClickedRandom')
export const ClickedSay = m('ClickedSay')
export const ClickedTheme = m('ClickedTheme')
export const SpeakCompleted = m('SpeakCompleted')

export const Message = S.Union([
  ClickedClear,
  ClickedClearEntry,
  ClickedDelete,
  ClickedDigit,
  ClickedOperator,
  ClickedDecimal,
  ClickedEquals,
  ClickedNegate,
  ClickedPercent,
  ClickedRandom,
  ClickedSay,
  ClickedTheme,
  SpeakCompleted,
])
export type Message = typeof Message.Type

// UPDATE

const speakButton = (
  text: string,
  language: string,
  muted: boolean,
  speech: SpeechOptions,
): ReadonlyArray<Command.Command<Message>> =>
  muted ? [] : [speak(text, SpeakCompleted(), { ...speech, lang: language })]

const opWord = (op: string, language: string): string => {
  if (op === '+') return t('calcPlus', language)
  if (op === '-') return t('calcMinus', language)
  if (op === '*') return t('calcTimes', language)
  if (op === '/') return t('calcDivide', language)
  return op
}

const evaluate = (display: string): string => {
  if (!/^[0-9+\-*/.\s]+$/.test(display)) return 'Error'
  try {
    const result = Function(`"use strict";return(${display})`)()
    if (!Number.isFinite(result)) return 'Error'
    return String(result)
  } catch {
    return 'Error'
  }
}

const OPERATORS = ['+', '-', '*', '/'] as const

const isOperator = (ch: string): boolean =>
  (OPERATORS as readonly string[]).includes(ch)

const negateLastOperand = (display: string): string => {
  for (let i = display.length - 1; i >= 0; i--) {
    const ch = display[i]!
    if (isOperator(ch) && i > 0 && display[i - 1] !== '*' && display[i - 1] !== '/') {
      const before = display.slice(0, i)
      const rest = display.slice(i)
      if (rest.startsWith('-')) {
        return before + rest.slice(1)
      }
      return before + '-' + rest
    }
  }
  if (display.startsWith('-')) return display.slice(1)
  if (display !== '0' && display !== '') return '-' + display
  return display
}

const percentLastOperand = (display: string): string => {
  for (let i = display.length - 1; i >= 0; i--) {
    const ch = display[i]!
    if (isOperator(ch) && i > 0 && display[i - 1] !== '*' && display[i - 1] !== '/') {
      const before = display.slice(0, i + 1)
      const rest = display.slice(i + 1)
      const num = parseFloat(rest)
      if (!Number.isFinite(num)) return display
      return before + String(num / 100)
    }
  }
  const num = parseFloat(display)
  if (!Number.isFinite(num)) return display
  return String(num / 100)
}

const deleteLast = (display: string): string => {
  if (display.length <= 1 || display === '0') return '0'
  const next = display.slice(0, -1)
  if (next === '' || next === '-') return '0'
  return next
}

const randomValue = (): string => String(1 + Math.floor(Math.random() * 100))

export const update = (
  model: Model,
  message: Message,
  language: string = 'en',
  muted: boolean = false,
  speech: SpeechOptions = {},
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      ClickedClear: () => [
        { ...model, display: '0', isResult: false },
        speakButton(t('calcClear', language), language, muted, speech),
      ],
      ClickedClearEntry: () => [
        { ...model, display: '0', isResult: false },
        speakButton(t('calcClear', language), language, muted, speech),
      ],
      ClickedDelete: () => {
        if (model.display === '0' || model.isResult) {
          return [
            { ...model, display: '0', isResult: false },
            speakButton(t('calcClear', language), language, muted, speech),
          ]
        }
        const next = deleteLast(model.display)
        return [
          { ...model, display: next, isResult: false },
          speakButton(t('calcDelete', language), language, muted, speech),
        ]
      },
      ClickedDigit: (msg) => {
        const digit = msg.digit
        const nextDisplay = model.isResult
          ? (digit === '0' ? '0' : digit)
          : (model.display === '0' ? digit : model.display + digit)
        return [
          { ...model, display: nextDisplay, isResult: false },
          speakButton(digit, language, muted, speech),
        ]
      },
      ClickedOperator: (msg) => {
        const op = msg.operator
        const word = opWord(op, language)
        const trimmed = model.display.trimEnd()
        if (trimmed === '' || trimmed === '-' || trimmed === '+' || trimmed === '*' || trimmed === '/') {
          return [model, speakButton(word, language, muted, speech)]
        }
        const last = trimmed.slice(-1)
        if (isOperator(last)) {
          return [
            { ...model, display: trimmed.slice(0, -1) + op, isResult: false },
            speakButton(word, language, muted, speech),
          ]
        }
        return [
          { ...model, display: trimmed + op, isResult: false },
          speakButton(word, language, muted, speech),
        ]
      },
      ClickedDecimal: () => {
        const display = model.display
        const pointWord = t('calcPoint', language)
        if (model.isResult) {
          return [
            { ...model, display: '0.', isResult: false },
            speakButton(pointWord, language, muted, speech),
          ]
        }
        const tail = display.split(/[+\-*/]/).pop() ?? ''
        if (tail.includes('.')) {
          return [model, speakButton(pointWord, language, muted, speech)]
        }
        return [
          { ...model, display: display + '.', isResult: false },
          speakButton(pointWord, language, muted, speech),
        ]
      },
      ClickedEquals: () => {
        const result = evaluate(model.display)
        return [
          { ...model, display: result, isResult: true },
          speakButton(t('calcEquals', language) + ' ' + result, language, muted, speech),
        ]
      },
      ClickedNegate: () => {
        const next = negateLastOperand(model.display)
        return [
          { ...model, display: next, isResult: false },
          speakButton(t('calcNegate', language), language, muted, speech),
        ]
      },
      ClickedPercent: () => {
        const next = percentLastOperand(model.display)
        return [
          { ...model, display: next, isResult: false },
          speakButton(t('calcPercent', language), language, muted, speech),
        ]
      },
      ClickedRandom: () => {
        const val = randomValue()
        return [
          { ...model, display: val, isResult: true },
          speakButton(t('calcRandom', language) + ' ' + val, language, muted, speech),
        ]
      },
      ClickedSay: () => [
        model,
        speakButton(model.display, language, muted, speech),
      ],
      ClickedTheme: () => {
        const nextTheme = (model.theme + 1) % THEME_COUNT
        return [
          { ...model, theme: nextTheme },
          speakButton(t('calcTheme', language) + ' ' + (nextTheme + 1), language, muted, speech),
        ]
      },
      SpeakCompleted: () => [model, []],
    }),
  )

// VIEW

const DISPLAY_OP: Readonly<Record<string, string>> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
}

const keyButton = (
  h: ReturnType<typeof html<Message>>,
  label: string,
  message: Message,
  cls: string,
): Html =>
  h.button(
    [h.OnClick(message), h.Class(cls)],
    [label],
  )

export const view = (model: Model, language: string = 'en'): Html => {
  const h = html<Message>()

  const base = 'calc-btn'
  const numStyle = `${base} calc-btn-num`
  const opStyle = `${base} calc-btn-op`
  const fnStyle = `${base} calc-btn-fn`
  const eqStyle = `${base} calc-btn-eq`
  const delStyle = `${base} calc-btn-del`
  const negStyle = `${base} calc-btn-neg`
  const pctStyle = `${base} calc-btn-pct`
  const rndStyle = `${base} calc-btn-rnd`
  const sayStyle = `${base} calc-btn-say`
  const themeStyle = `${base} calc-btn-theme`
  const ceStyle = `${base} calc-btn-ce`

  const opMessage = (op: string): Message => ClickedOperator({ operator: op })

  const displayLabel = (): string => {
    let out = model.display
    for (const sym of ['*', '/']) {
      out = out.split(sym).join(DISPLAY_OP[sym] ?? sym)
    }
    return out
  }

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class(`card calc-theme-${model.theme}`)], [
        h.h1([h.Class('title')], [t('calculatorTitle', language)]),
        h.div(
          [h.Class('calc-display')],
          [h.span([h.Class('calc-display-text' + (model.isResult ? ' calc-display-result' : ''))], [displayLabel()])],
        ),
        h.div([h.Class('calc-grid')], [
          keyButton(h, 'AC', ClickedClear(), fnStyle),
          keyButton(h, 'C', ClickedClearEntry(), ceStyle),
          keyButton(h, '÷', opMessage('/'), opStyle),
          keyButton(h, '×', opMessage('*'), opStyle),

          keyButton(h, '7', ClickedDigit({ digit: '7' }), numStyle),
          keyButton(h, '8', ClickedDigit({ digit: '8' }), numStyle),
          keyButton(h, '9', ClickedDigit({ digit: '9' }), numStyle),
          keyButton(h, '+', opMessage('+'), opStyle),

          keyButton(h, '4', ClickedDigit({ digit: '4' }), numStyle),
          keyButton(h, '5', ClickedDigit({ digit: '5' }), numStyle),
          keyButton(h, '6', ClickedDigit({ digit: '6' }), numStyle),
          keyButton(h, '=', ClickedEquals(), eqStyle),

          keyButton(h, '1', ClickedDigit({ digit: '1' }), numStyle),
          keyButton(h, '2', ClickedDigit({ digit: '2' }), numStyle),
          keyButton(h, '3', ClickedDigit({ digit: '3' }), numStyle),

          keyButton(h, '−', opMessage('-'), opStyle),
          keyButton(h, '0', ClickedDigit({ digit: '0' }), `${numStyle} calc-btn-zero`),
          keyButton(h, '.', ClickedDecimal(), numStyle),

          keyButton(h, '⌫', ClickedDelete(), delStyle),
          keyButton(h, '±', ClickedNegate(), negStyle),
          keyButton(h, '%', ClickedPercent(), pctStyle),
          keyButton(h, '🎲', ClickedRandom(), rndStyle),

          keyButton(h, '🎨', ClickedTheme(), themeStyle),
          keyButton(h, '🔊', ClickedSay(), `${sayStyle} calc-btn-triple`),
        ]),
      ]),
    ],
  )
}
