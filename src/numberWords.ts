import { toCardinal } from 'n2words/en-US'
import { toCardinal as toCardinalDe } from 'n2words/de-DE'
import { toCardinal as toCardinalFr } from 'n2words/fr-FR'
import { toCardinal as toCardinalFa } from 'n2words/fa-IR'
import { toCardinal as toCardinalMs } from 'n2words/ms-MY'
import { toCardinal as toCardinalZh } from 'n2words/zh-Hans-CN'
import { toCardinal as toCardinalZhHant } from 'n2words/zh-Hant-TW'
import { toCardinal as toCardinalJa } from 'n2words/ja-JP'

const WORD_FN: Record<string, (n: number, opts: Record<string, boolean>) => string> = {
  en: toCardinal,
  de: toCardinalDe,
  fr: toCardinalFr,
  fa: toCardinalFa,
  ms: toCardinalMs,
  zh: toCardinalZh,
  'zh-HK': toCardinalZhHant,
  ja: toCardinalJa,
}

const WORD_OPTS: Record<string, Record<string, boolean>> = {
  zh: { formal: false },
  'zh-HK': { formal: false },
}

const zhStripLeadingOne = (s: string): string => s.startsWith('一十') ? s.slice(1) : s

export const numberToWord = (n: number, language: string = 'en'): string => {
  const fn = WORD_FN[language]
  if (!fn) return n.toString()
  try {
    let word = fn(n, WORD_OPTS[language] ?? {})
    if (language === 'ms' && word === 'sifar') word = 'kosong'
    if (language === 'zh' || language === 'zh-HK') word = zhStripLeadingOne(word)
    return word
  } catch {
    return n.toString()
  }
}
