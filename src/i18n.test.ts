import { describe, expect, it } from 'vitest'
import { Option, Schema as S } from 'effect'
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

  it('normalizes supported and unsupported language codes', () => {
    expect(i18n.normalizeLanguage('ja')).toBe('ja')
    expect(i18n.normalizeLanguage('xx')).toBe('en')
    expect(i18n.normalizeLanguage(undefined)).toBe('en')
  })

  it('decodes the supported language set through Effect Schema', () => {
    const decodeLanguage = S.decodeUnknownOption(i18n.Language)

    for (const lang of langKeys) {
      const decoded = decodeLanguage(lang)
      expect(Option.isSome(decoded), `${lang} should decode as a supported language`).toBe(true)
      if (Option.isSome(decoded)) {
        expect(decoded.value).toBe(lang)
      }
    }

    expect(Option.isSome(decodeLanguage('en'))).toBe(true)
    expect(Option.isSome(decodeLanguage('zh-HK'))).toBe(true)
    expect(Option.isNone(decodeLanguage('en-GB'))).toBe(true)
    expect(Option.isNone(decodeLanguage(123))).toBe(true)
  })

  it('falls back to English for unsupported language lookups', () => {
    expect(i18n.t('appName', 'xx')).toBe(i18n.translations.en.appName)
    expect(i18n.tf('whereIs', 'xx', '⭐')).toBe(i18n.translations.en.whereIs('⭐'))
  })

  it('localizes 3D bubble statuses and formats scores with the supplied locale number', () => {
    const poppedLabels = {
      en: 'Popped: ', zh: '已戳破: ', fr: 'Éclatées : ', de: 'Geplatzt: ', fa: 'ترکیده: ', ms: 'Dipecahkan: ', 'zh-HK': '已戳破: ', ja: 'わったかず: ',
    } as const
    for (const lang of langKeys) {
      const number = new Intl.NumberFormat(lang).format(1234)
      expect(i18n.tf('bubbles3dPopped', lang, number)).toBe(`${poppedLabels[lang]}${number}`)
      for (const key of ['bubbles3dTitle', 'bubbles3dClearing', 'pageTitleBubbles3d', 'next'] as const) {
        expect(i18n.t(key, lang).length, `${lang}.${key}`).toBeGreaterThan(0)
      }
      for (const key of ['bubbles3dAdd', 'bubbles3dReset', 'bubbles3dBubble', 'bubbles3dPrompt', 'bubbles3dEmpty', 'bubbles3dUnavailable', 'bubbles3dLimit']) expect(i18n.translations[lang]).not.toHaveProperty(key)
    }
    expect(i18n.t('bubbles3dClearing')).toBe('Popping bubbles…')
    expect(i18n.t('bubbles3dClearing', 'xx')).toBe(i18n.t('bubbles3dClearing'))
  })

  it('speaks newly created 3D color and shape names in each language\'s word order', () => {
    const coloredCubes = {
      en: 'red cube',
      zh: '红色 正方体',
      fr: 'cube rouge',
      de: 'rot würfel',
      fa: 'مکعب قرمز',
      ms: 'kubus merah',
      'zh-HK': '紅色 正方體',
      ja: 'あか 立方体',
    } as const
    for (const lang of langKeys) {
      const color = i18n.t('colorRed', lang).toLowerCase()
      const shape = i18n.t('bubbles3dShapeCube', lang).toLowerCase()
      expect(i18n.tf('coloredShape', lang, color, shape), lang).toBe(coloredCubes[lang])
    }
  })

  it('names every 3D shape in every language and formats numbered names with locale grammar', () => {
    const shapeKeys = [
      'bubbles3dShapeSphere', 'bubbles3dShapeCube', 'bubbles3dShapeCuboid', 'bubbles3dShapeRoundedCube',
      'bubbles3dShapeTetrahedron', 'bubbles3dShapeOctahedron', 'bubbles3dShapeDodecahedron', 'bubbles3dShapeIcosahedron',
      'bubbles3dShapeCone', 'bubbles3dShapeCylinder', 'bubbles3dShapeTriangularPrism', 'bubbles3dShapePentagonalPrism',
      'bubbles3dShapeHexagonalPrism', 'bubbles3dShapePyramid', 'bubbles3dShapeTriangularBipyramid', 'bubbles3dShapeCapsule',
      'bubbles3dShapeTorus', 'bubbles3dShapeTorusKnot', 'bubbles3dShapeStar', 'bubbles3dShapeHeart',
      'bubbles3dShapeCrescent', 'bubbles3dShapeGear', 'bubbles3dShapeCross', 'bubbles3dShapeDiamond',
      'bubbles3dShapeHemisphere', 'bubbles3dShapeEllipsoid', 'bubbles3dShapeEgg', 'bubbles3dShapeFrustum',
      'bubbles3dShapeHexagonalBipyramid',
    ] as const
    const numberedCubes = {
      en: (number: string) => `Cube ${number}`,
      zh: (number: string) => `第${number}个正方体`,
      fr: (number: string) => `Cube ${number}`,
      de: (number: string) => `Würfel ${number}`,
      fa: (number: string) => `مکعب شمارهٔ ${number}`,
      ms: (number: string) => `Kubus ${number}`,
      'zh-HK': (number: string) => `第${number}個正方體`,
      ja: (number: string) => `立方体 ${number}ばん`,
    } as const
    for (const lang of langKeys) {
      const names = shapeKeys.map(key => i18n.t(key, lang))
      expect(names.every(name => name.length > 0), `${lang} names every shape`).toBe(true)
      expect(new Set(names).size, `${lang} has distinct shape names`).toBe(shapeKeys.length)
      const number = new Intl.NumberFormat(lang).format(1234)
      expect(i18n.tf('bubbles3dShape', lang, i18n.t('bubbles3dShapeCube', lang), number)).toBe(numberedCubes[lang](number))
    }
    expect(i18n.tf('bubbles3dShape', 'xx', 'Cube', '12')).toBe('Cube 12')
  })

  it('uses donut and trefoil knot names for labels and spoken colored shapes in every language', () => {
    const labels = {
      en: ['Donut', 'Trefoil knot'],
      zh: ['甜甜圈', '三叶结'],
      fr: ['Donut', 'Nœud de trèfle'],
      de: ['Donut', 'Kleeblattknoten'],
      fa: ['دونات', 'گره سه‌پر'],
      ms: ['Donat', 'Simpulan trefoil'],
      'zh-HK': ['冬甩', '三葉結'],
      ja: ['ドーナツ', '三葉結び目'],
    } as const
    const spokenNames = {
      en: ['red donut', 'red trefoil knot'],
      zh: ['红色 甜甜圈', '红色 三叶结'],
      fr: ['donut rouge', 'nœud de trèfle rouge'],
      de: ['rot donut', 'rot kleeblattknoten'],
      fa: ['دونات قرمز', 'گره سه‌پر قرمز'],
      ms: ['donat merah', 'simpulan trefoil merah'],
      'zh-HK': ['紅色 冬甩', '紅色 三葉結'],
      ja: ['あか ドーナツ', 'あか 三葉結び目'],
    } as const
    for (const lang of langKeys) {
      const color = i18n.t('colorRed', lang).toLowerCase()
      const names = [i18n.t('bubbles3dShapeTorus', lang), i18n.t('bubbles3dShapeTorusKnot', lang)]
      expect(names, lang).toEqual(labels[lang])
      expect(names.map(name => i18n.tf('coloredShape', lang, color, name.toLowerCase())), lang).toEqual(spokenNames[lang])
    }
  })

  it('uses the appended shape names in labels and speech, with an accessible clear status', () => {
    const newShapeNames = [
      ['bubbles3dShapeHemisphere', 'Hemisphere'],
      ['bubbles3dShapeEllipsoid', 'Ellipsoid'],
      ['bubbles3dShapeEgg', 'Egg'],
      ['bubbles3dShapeFrustum', 'Frustum'],
      ['bubbles3dShapeHexagonalBipyramid', 'Hexagonal bipyramid'],
    ] as const
    for (const [key, name] of newShapeNames) {
      expect(i18n.t(key)).toBe(name)
      expect(i18n.tf('coloredShape', 'en', 'blue', i18n.t(key).toLowerCase())).toBe(`blue ${name.toLowerCase()}`)
    }
    expect(i18n.t('bubbles3dClearing')).toBe('Popping bubbles…')
    expect(i18n.t('bubbles3dClearing', 'xx')).toBe('Popping bubbles…')
  })
})
