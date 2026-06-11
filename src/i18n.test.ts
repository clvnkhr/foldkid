import { describe, expect, it } from 'vitest'
import * as i18n from './i18n'

describe('i18n completeness', () => {
  const langKeys = Object.keys(i18n.translations) as Array<keyof typeof i18n.translations>

  it('every language has exactly the same keys', () => {
    const keysByLang = langKeys.map(lang => ({ lang, keys: new Set(Object.keys(i18n.translations[lang])) }))
    if (keysByLang.length < 2) return
    const first = keysByLang[0]
    if (!first) return
    for (const entry of keysByLang.slice(1)) {
      const missing: string[] = []
      const extra: string[] = []
      for (const k of first.keys) { if (!entry.keys.has(k)) missing.push(k) }
      for (const k of entry.keys) { if (!first.keys.has(k)) extra.push(k) }
      if (missing.length) expect.fail(`${entry.lang} is missing keys: ${missing.join(', ')}`)
      if (extra.length) expect.fail(`${entry.lang} has extra keys: ${extra.join(', ')}`)
    }
  })

  it('every translation key resolves to a string', () => {
    for (const [lang, dict] of Object.entries(i18n.translations)) {
      for (const key of Object.keys(dict)) {
        const val = dict[key as keyof typeof dict]
        expect(
          typeof val === 'string' || typeof val === 'function',
          `${lang}.${key} is ${typeof val}`,
        ).toBe(true)
      }
    }
  })
})
