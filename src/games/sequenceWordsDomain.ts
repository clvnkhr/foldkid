import { Schema as S } from 'effect'
import { normalizeLanguage, t, type StringKey } from '../i18n'

export const Group = S.Literals(['ordinals', 'weekdays', 'months', 'seasons', 'rainbow', 'solfege'])
export type Group = typeof Group.Type
export const GROUPS = ['ordinals', 'weekdays', 'months', 'seasons', 'rainbow', 'solfege'] as const
export const GROUP_KEYS: Readonly<Record<Group, StringKey>> = {
  ordinals: 'sequenceWordsOrdinals', weekdays: 'sequenceWordsWeekdays', months: 'sequenceWordsMonths',
  seasons: 'sequenceWordsSeasons', rainbow: 'sequenceWordsRainbow', solfege: 'sequenceWordsSolfege',
}
export const GROUP_ICONS: Readonly<Record<Group, string>> = {
  ordinals: '🏅', weekdays: '📅', months: '🗓️', seasons: '🌱', rainbow: '🌈', solfege: '🎶',
}
export const GROUP_SIZES: Readonly<Record<Group, number>> = {
  ordinals: 12, weekdays: 7, months: 12, seasons: 4, rainbow: 7, solfege: 7,
}
const LIST_KEYS: Readonly<Partial<Record<Group, StringKey>>> = {
  ordinals: 'sequenceWordsOrdinalList', seasons: 'sequenceWordsSeasonList',
  rainbow: 'sequenceWordsRainbowList', solfege: 'sequenceWordsSolfegeList',
}
export const BASIS_KEYS: Readonly<Record<Group, StringKey>> = {
  ordinals: 'sequenceWordsOrdinalBasis', weekdays: 'sequenceWordsWeekdayBasis', months: 'sequenceWordsMonthBasis',
  seasons: 'sequenceWordsSeasonBasis', rainbow: 'sequenceWordsRainbowBasis', solfege: 'sequenceWordsSolfegeBasis',
}
export const wordsFor = (group: Group, language: string): readonly string[] => {
  const locale = normalizeLanguage(language)
  const key = LIST_KEYS[group]
  if (key) return t(key, locale).split('|')
  if (group === 'weekdays') {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })
    return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(Date.UTC(2024, 0, index + 1))))
  }
  const formatter = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC', calendar: 'gregory' })
  return Array.from({ length: 12 }, (_, index) => formatter.format(new Date(Date.UTC(2024, index, 1))))
}

export interface Board { readonly numbers: readonly number[]; readonly words: readonly number[]; readonly seed: number }
export const INITIAL_SEED = 0x73a9bd1
export const generateBoard = (sourceSeed: number, group: Group, count: number): Board => {
  let seed = Number.isSafeInteger(sourceSeed) && sourceSeed >= 0 && sourceSeed <= 0xffffffff ? sourceSeed : INITIAL_SEED
  const random = (size: number): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return Math.floor(seed / 0x100000000 * size)
  }
  const shuffle = (values: number[]): number[] => {
    for (let index = values.length - 1; index > 0; index--) {
      const other = random(index + 1)
      ;[values[index], values[other]] = [values[other]!, values[index]!]
    }
    return values
  }
  const numbers = shuffle(Array.from({ length: GROUP_SIZES[group] }, (_, index) => index)).slice(0, Math.min(count, GROUP_SIZES[group]))
  let words = shuffle([...numbers])
  // A worksheet should invite connecting across rows, rather than giving every
  // answer away through its horizontal alignment.
  if (words.every((value, index) => value === numbers[index])) words = [...words.slice(1), words[0]!]
  return { numbers, words, seed }
}
