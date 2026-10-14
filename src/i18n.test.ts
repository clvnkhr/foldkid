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

  it('formats musical keys in each language and names the audible instruments', () => {
    const majorKeys = {
      en: 'Key: E♭ major', zh: '调性：E♭ 大调', fr: 'Tonalité : E♭ majeur',
      de: 'Tonart: E♭-Dur', fa: 'گام: E♭ ماژور', ms: 'Nada: E♭ major',
      'zh-HK': '調性：E♭ 大調', ja: 'キー：E♭ メジャー',
    }
    for (const language of langKeys) {
      expect(i18n.tf('musicBoxMajorKey', language, 'E♭')).toBe(majorKeys[language])
      expect(i18n.tf('musicBoxMinorKey', language, 'A')).toContain('A')
      expect(i18n.tf('musicBoxMinorKey', language, 'A')).not.toBe(i18n.tf('musicBoxMajorKey', language, 'A'))
      expect(i18n.t('musicBoxBell', language)).not.toBe('')
      expect(i18n.t('musicBoxSawtooth', language)).not.toBe('')
    }
    expect(i18n.t('musicBoxBell')).toBe('Bell')
    expect(i18n.t('musicBoxSawtooth')).toBe('Synth')
  })

  it('names all ten additional nursery rhymes in every language', () => {
    const titles = [
      ['musicBoxBaaBaa', 'Baa Baa Black Sheep'], ['musicBoxHickory', 'Hickory Dickory Dock'],
      ['musicBoxHotCross', 'Hot Cross Buns'], ['musicBoxBlindMice', 'Three Blind Mice'],
      ['musicBoxPolly', 'Polly Put the Kettle On'], ['musicBoxHumpty', 'Humpty Dumpty'],
      ['musicBoxJackJill', 'Jack and Jill'], ['musicBoxHeyDiddle', 'Hey Diddle Diddle'],
      ['musicBoxThisOldMan', 'This Old Man'], ['musicBoxBoPeep', 'Little Bo Peep'],
    ] as const
    for (const [key, title] of titles) expect(i18n.t(key, 'en')).toBe(title)
    for (const language of langKeys) {
      const labels = titles.map(([key]) => i18n.t(key, language))
      expect(labels.every(label => label.trim().length > 0)).toBe(true)
      expect(new Set(labels).size).toBe(titles.length)
    }
  })

  it('names accompaniment styles and volume in every language', () => {
    const keys = ['musicBoxAccompaniment', 'musicBoxAccompanimentOff', 'musicBoxAccompanimentChords', 'musicBoxAccompanimentArpeggio', 'musicBoxAccompanimentVolume'] as const
    for (const language of langKeys) {
      for (const key of keys) expect(i18n.t(key, language).trim().length, `${language}.${key}`).toBeGreaterThan(0)
      expect(new Set(keys.slice(1, 4).map(key => i18n.t(key, language))).size).toBe(3)
    }
    expect(keys.map(key => i18n.t(key, 'en'))).toEqual(['Accompaniment', 'Off', 'Chords', 'Arpeggio', 'Accompaniment volume'])
  })

  it('names Picnic Basket controls and sixteen distinct foods in every language', () => {
    const controls = [
      'picnicBasketTitle', 'pageTitlePicnicBasket', 'picnicBasketTwo', 'picnicBasketThree',
      'picnicBasketLength', 'picnicBasketShow', 'picnicBasketRemember', 'picnicBasketMemory',
      'picnicBasketRepeat', 'picnicBasketChoices', 'picnicBasketHidden', 'picnicBasketTryAgain',
      'picnicBasketPacked', 'picnicBasketBasket',
    ] as const
    const foods = [
      ['picnicBasketApple', 'Apple'], ['picnicBasketBanana', 'Banana'], ['picnicBasketStrawberry', 'Strawberry'],
      ['picnicBasketGrapes', 'Grapes'], ['picnicBasketWatermelon', 'Watermelon'], ['picnicBasketPear', 'Pear'],
      ['picnicBasketPeach', 'Peach'], ['picnicBasketOrange', 'Orange'], ['picnicBasketCarrot', 'Carrot'],
      ['picnicBasketCorn', 'Corn'], ['picnicBasketBroccoli', 'Broccoli'], ['picnicBasketBread', 'Bread'],
      ['picnicBasketCheese', 'Cheese'], ['picnicBasketEgg', 'Egg'], ['picnicBasketCookie', 'Cookie'],
      ['picnicBasketMilk', 'Milk'],
    ] as const
    for (const [key, english] of foods) expect(i18n.t(key, 'en')).toBe(english)
    for (const language of langKeys) {
      for (const key of controls) expect(i18n.t(key, language).trim().length, `${language}.${key}`).toBeGreaterThan(0)
      const names = foods.map(([key]) => i18n.t(key, language))
      expect(names.every(name => name.trim().length > 0), language).toBe(true)
      expect(new Set(names).size, language).toBe(foods.length)
      expect(i18n.t('picnicBasketTwo', language)).not.toBe(i18n.t('picnicBasketThree', language))
      expect(i18n.t('picnicBasketShow', language)).not.toBe(i18n.t('picnicBasketRemember', language))
      expect(i18n.t('pageTitlePicnicBasket', language)).toContain(i18n.t('appName', language))
      for (const name of names) {
        expect(i18n.tf('picnicBasketFoodLabel', language, name, false)).toBe(name)
        expect(i18n.tf('picnicBasketFoodLabel', language, name, true)).toContain(name)
        expect(i18n.tf('picnicBasketFoodLabel', language, name, true)).not.toBe(name)
        expect(i18n.tf('picnicBasketPicked', language, name)).toContain(name)
        expect(i18n.tf('picnicBasketOrder', language, name, '', '').toLocaleLowerCase(language)).toContain(name.toLocaleLowerCase(language))
      }
    }
    expect(i18n.t('picnicBasketPacked', 'en')).toBe('Picnic ready!')
    expect(i18n.tf('picnicBasketPicked', 'en', 'Apple')).toBe('Apple packed')
  })

  it('speaks complete Picnic Basket instructions for one, two or three remaining foods using locale grammar', () => {
    const orders = {
      en: [
        'Put the apple in the basket.', 'Put the apple, then the banana in the basket.',
        'Put the apple, then the banana, then the cookie in the basket.',
      ],
      zh: ['把苹果放进篮子里。', '先把苹果放进篮子，再放香蕉。', '先把苹果放进篮子，再放香蕉，最后放饼干。'],
      fr: [
        'Mets dans le panier : pomme.', 'Mets dans le panier : pomme, puis banane.',
        'Mets dans le panier : pomme, puis banane, puis biscuit.',
      ],
      de: [
        'Packe in den Korb: Apfel.', 'Packe in den Korb: Apfel, dann Banane.',
        'Packe in den Korb: Apfel, dann Banane, dann Keks.',
      ],
      fa: ['سیب را در سبد بگذار.', 'اول سیب، بعد موز را در سبد بگذار.', 'اول سیب، بعد موز و بعد بیسکویت را در سبد بگذار.'],
      ms: [
        'Masukkan epal ke dalam bakul.', 'Masukkan epal, kemudian pisang ke dalam bakul.',
        'Masukkan epal, kemudian pisang, kemudian biskut ke dalam bakul.',
      ],
      'zh-HK': ['放蘋果入籃啦。', '先放蘋果入籃，跟住放香蕉。', '先放蘋果入籃，跟住放香蕉，最後放餅乾。'],
      ja: ['かごにりんごをいれよう。', 'かごにりんご、つぎにバナナをいれよう。', 'かごにりんご、つぎにバナナ、つぎにクッキーをいれよう。'],
    } as const
    for (const language of langKeys) {
      const first = i18n.t('picnicBasketApple', language)
      const second = i18n.t('picnicBasketBanana', language)
      const third = i18n.t('picnicBasketCookie', language)
      expect(i18n.tf('picnicBasketOrder', language, first, '', '')).toBe(orders[language][0])
      expect(i18n.tf('picnicBasketOrder', language, first, second, '')).toBe(orders[language][1])
      expect(i18n.tf('picnicBasketOrder', language, first, second, third)).toBe(orders[language][2])
    }
    expect(i18n.tf('picnicBasketOrder', 'en', 'Banana', 'Cookie', '')).toBe('Put the banana, then the cookie in the basket.')
    expect(i18n.tf('picnicBasketOrder', 'xx', 'Cookie', '', '')).toBe('Put the cookie in the basket.')
  })

  it('labels Picnic Basket places, ordered clues and hidden clues with caller-formatted position numbers', () => {
    for (const language of langKeys) {
      const position = new Intl.NumberFormat(language).format(1234)
      const food = i18n.t('picnicBasketApple', language)
      expect(i18n.tf('picnicBasketSlot', language, position)).toContain(position)
      expect(i18n.tf('picnicBasketHiddenItem', language, position)).toContain(position)
      for (const key of ['picnicBasketBasketItem', 'picnicBasketOrderItem'] as const) {
        const label = i18n.tf(key, language, position, food)
        expect(label).toContain(position)
        expect(label).toContain(food)
      }
      expect(i18n.tf('picnicBasketHiddenItem', language, position)).not.toContain(food)
    }
    expect(i18n.tf('picnicBasketBasketItem', 'en', '2', 'Apple')).toBe('Basket place 2: Apple, packed')
    expect(i18n.tf('picnicBasketOrderItem', 'en', '2', 'Banana')).toBe('Food 2: Banana')
    expect(i18n.tf('picnicBasketHiddenItem', 'en', '2')).toBe('Food 2: remember this food')
  })

  it('names all additional matching silhouettes and speaks their paired captions in every language', () => {
    const entries = [
      ['shapeCrescent', 'Crescent'], ['shapeCross', 'Cross'], ['shapeArrow', 'Arrow'],
      ['shapeLightning', 'Lightning bolt'], ['shapeKite', 'Kite'], ['shapeParallelogram', 'Parallelogram'],
      ['shapeRightTriangle', 'Right triangle'], ['shapeCapsule', 'Capsule'], ['shapeTeardrop', 'Teardrop'],
      ['shapeEgg', 'Egg'], ['shapeClover', 'Clover'], ['shapeFlower', 'Flower'], ['shapeCloud', 'Cloud'],
      ['shapeArch', 'Arch'], ['shapeChevron', 'Chevron'], ['shapeSixPointStar', 'Six-point star'],
      ['shapeEightPointStar', 'Eight-point star'],
    ] as const
    for (const [key, name] of entries) expect(i18n.t(key, 'en')).toBe(name)
    for (const language of langKeys) {
      const names = entries.map(([key]) => i18n.t(key, language))
      expect(names.every(name => name.trim().length > 0), language).toBe(true)
      expect(new Set(names).size, language).toBe(entries.length)
      const circle = i18n.t('shapeCircle', language)
      for (const name of names) {
        const pair = i18n.tf('shapeMatchPair', language, name, circle)
        expect(pair.indexOf(name)).toBeLessThan(pair.indexOf(circle))
        expect(i18n.tf('shapeMatchPairPrompt', language, pair)).toContain(pair)
        expect(i18n.tf('shapeMatchPairSuccess', language, pair)).toContain(pair)
        expect(i18n.tf('shapeMatchHome', language, name).toLocaleLowerCase(language)).toContain(name.toLocaleLowerCase(language))
        expect(i18n.tf('shapeMatchPrompt', language, name).toLocaleLowerCase(language)).toContain(name.toLocaleLowerCase(language))
      }
    }
    expect(i18n.t('shapeRightTriangle', 'fr')).toBe('Triangle rectangle')
    expect(i18n.t('shapeParallelogram', 'ms')).toBe('Segi empat selari')
    expect(i18n.t('shapeClover', 'zh')).toBe('四叶草')
    expect(i18n.t('shapeSixPointStar', 'ja')).not.toBe(i18n.t('shapeEightPointStar', 'ja'))
  })

  it('names nine- and ten-sided shapes in each language for matching labels and speech', () => {
    const names = {
      en: ['Nonagon', 'Decagon'], zh: ['九边形', '十边形'], fr: ['Ennéagone', 'Décagone'],
      de: ['Neuneck', 'Zehneck'], fa: ['نه‌ضلعی', 'ده‌ضلعی'], ms: ['Nonagon', 'Dekagon'],
      'zh-HK': ['九邊形', '十邊形'], ja: ['きゅうかくけい', 'じゅっかくけい'],
    } as const
    for (const language of langKeys) {
      const shapes = [i18n.t('shapeNonagon', language), i18n.t('shapeDecagon', language)]
      expect(shapes, language).toEqual(names[language])
      expect(new Set(shapes).size).toBe(2)
      const pair = i18n.tf('shapeMatchPair', language, shapes[0]!, shapes[1]!)
      expect(i18n.tf('shapeMatchPairPrompt', language, pair)).toContain(pair)
      expect(i18n.tf('shapeMatchPairSuccess', language, pair)).toContain(pair)
      for (const shape of shapes) expect(i18n.tf('shapeMatchHome', language, shape).toLocaleLowerCase(language)).toContain(shape.toLocaleLowerCase(language))
    }
  })

  it('names shape matching modes and ordered pairs without changing their visual order', () => {
    const labels = {
      en: 'Circle, then Triangle', zh: '先圓形，再三角形', fr: 'Cercle, puis Triangle',
      de: 'Kreis, dann Dreieck', fa: 'دایره، بعد مثلث', ms: 'Bulat, kemudian Segi tiga',
      'zh-HK': '先圓形，再三角形', ja: 'まる、つぎにさんかく',
    } as const
    for (const language of langKeys) {
      const modes = ['shapeMatchSimple', 'shapeMatchPairs', 'shapeMatchMode'] as const
      for (const key of modes) expect(i18n.t(key, language).trim().length, `${language}.${key}`).toBeGreaterThan(0)
      expect(i18n.t('shapeMatchSimple', language)).not.toBe(i18n.t('shapeMatchPairs', language))
      const first = i18n.t('shapeCircle', language)
      const second = i18n.t('shapeTriangle', language)
      const pair = i18n.tf('shapeMatchPair', language, first, second)
      expect(pair).toBe(labels[language])
      expect(pair.indexOf(first)).toBeLessThan(pair.indexOf(second))
      expect(i18n.tf('shapeMatchPair', language, second, first)).not.toBe(pair)
      expect(i18n.tf('shapeMatchPairPrompt', language, pair)).toContain(pair)
      expect(i18n.tf('shapeMatchPairSuccess', language, pair)).toContain(pair)
    }
    expect(i18n.tf('shapeMatchPairPrompt', 'en', labels.en)).toBe('Find the matching pair: Circle, then Triangle.')
    expect(i18n.tf('shapeMatchPairSuccess', 'en', labels.en)).toBe('A match! Circle, then Triangle.')
  })

  it('localizes shape matching prompts and homes using each locale grammar', () => {
    const prompts = {
      en: 'Find the circle.', zh: '找一找圓形。', fr: 'Trouve cette forme : cercle.',
      de: 'Finde diese Form: Kreis.', fa: 'دایره را پیدا کن.', ms: 'Cari bulat.',
      'zh-HK': '搵下圓形喺邊。', ja: 'まるをさがそう。',
    } as const
    const homes = {
      en: 'Circle home', zh: '圓形的家', fr: 'Maison : cercle',
      de: 'Platz für Kreis', fa: 'خانهٔ دایره', ms: 'Rumah bulat',
      'zh-HK': '圓形嘅屋企', ja: 'まるのおうち',
    } as const
    const keys = [
      'shapeMatchTitle', 'pageTitleShapeMatch', 'shapeMatchTryAgain',
    ] as const
    for (const language of langKeys) {
      for (const key of keys) expect(i18n.t(key, language).trim().length, `${language}.${key}`).toBeGreaterThan(0)
      const shape = i18n.t('shapeCircle', language)
      expect(i18n.tf('shapeMatchPrompt', language, shape)).toBe(prompts[language])
      expect(i18n.tf('shapeMatchHome', language, shape)).toBe(homes[language])
      expect(i18n.tf('shapeMatchSuccess', language, shape)).toContain(shape)
      expect(i18n.t('pageTitleShapeMatch', language)).toContain(i18n.t('appName', language))
    }
    expect(i18n.tf('shapeMatchSuccess', 'en', 'Circle')).toBe('A match! Circle.')
    expect(i18n.tf('shapeMatchPrompt', 'xx', 'Square')).toBe('Find the square.')
  })

  it('localizes dot shapes and formats dot counts using each locale grammar', () => {
    const statuses = {
      en: 'Triangle · 3 dots', zh: '三角形 · 3个点', fr: 'Triangle · 3 points',
      de: 'Dreieck · 3 Punkte', fa: 'مثلث · ۳ نقطه', ms: 'Segi tiga · 3 titik',
      'zh-HK': '三角形 · 3個點', ja: '三角形 · てん3こ',
    }
    const keys = [
      'dotShapesTitle', 'pageTitleDotShapes', 'dotShapesBoard', 'dotShapesKeyboard',
      'dotShapesEmpty', 'dotShapesUndo', 'dotShapesDot', 'dotShapesLine', 'dotShapesTriangle',
      'dotShapesQuadrilateral', 'dotShapesPentagon', 'dotShapesHexagon', 'dotShapesHeptagon',
      'dotShapesOctagon', 'dotShapesNonagon', 'dotShapesDecagon',
    ] as const
    for (const language of langKeys) {
      for (const key of keys) expect(i18n.t(key, language), `${language}.${key}`).not.toBe('')
      const number = new Intl.NumberFormat(language).format(3)
      expect(i18n.tf('dotShapesStatus', language, i18n.t('dotShapesTriangle', language), number)).toBe(statuses[language])
      expect(i18n.tf('dotShapesPolygon', language, new Intl.NumberFormat(language).format(32))).not.toBe('')
      expect(i18n.tf('dotShapesDotLabel', language, number)).toContain(number)
    }
    expect(i18n.tf('dotShapesStatus', 'en', 'Dot', '1')).toBe('Dot · 1 dot')
    expect(i18n.tf('dotShapesStatus', 'fr', 'Point', '1')).toBe('Point · 1 point')
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

  it('localizes handwriting controls while retaining English letter case samples', () => {
    const keys = [
      'handwritingTitle', 'pageTitleHandwriting', 'handwritingLetters', 'handwritingWords',
      'handwritingNumbers', 'handwritingPrint', 'handwritingCursive', 'handwritingStyle',
      'handwritingUppercaseLabel', 'handwritingLowercaseLabel', 'handwritingAgain', 'handwritingNext',
      'handwritingPrevious', 'handwritingTrace', 'handwritingComplete', 'handwritingKeyboardHint', 'handwritingPenLabel',
    ] as const
    for (const lang of langKeys) {
      for (const key of keys) expect(i18n.t(key, lang).length, `${lang}.${key}`).toBeGreaterThan(0)
      expect(i18n.t('handwritingUppercase', lang), lang).toBe('ABC')
      expect(i18n.t('handwritingLowercase', lang), lang).toBe('abc')
      expect(i18n.t('handwritingUppercaseLabel', lang), lang).not.toBe(i18n.t('handwritingLowercaseLabel', lang))
      expect(i18n.t('handwritingComplete', lang), lang).toContain('✨')
    }
    expect(i18n.t('handwritingTitle')).toBe('Handwriting')
    expect(i18n.t('handwritingWords')).toBe('3-letter words')
    expect(i18n.t('handwritingNumbers')).toBe('Numbers')
    expect(i18n.t('handwritingPrint')).toBe('Print')
    expect(i18n.t('handwritingCursive')).toBe('Cursive')
    expect(i18n.t('handwritingTitle', 'xx')).toBe('Handwriting')
    expect(i18n.t('handwritingNext', 'fa')).toBe('بعدی ⬅')
    expect(i18n.t('handwritingPrevious', 'fa')).toBe('➡ قبلی')
    expect(i18n.t('handwritingWords', 'de')).toBe('Wörter mit 3 Buchstaben')
  })

  it('formats handwriting board labels and progress with each locale’s grammar and supplied numerals', () => {
    const boardLabels = {
      en: 'Trace cat', zh: '描写cat', fr: 'Trace cat', de: 'Schreibe cat nach',
      fa: 'cat را روی نقطه‌ها بنویس', ms: 'Surih cat', 'zh-HK': '跟住啲點寫cat', ja: 'catをなぞろう',
    } as const
    const progressLabels = {
      en: (done: string, total: string) => `${done} of ${total} strokes`,
      zh: (done: string, total: string) => `共${total}笔，已完成${done}笔`,
      fr: (done: string, total: string) => `${done} traits sur ${total}`,
      de: (done: string, total: string) => `${done} von ${total} Strichen`,
      fa: (done: string, total: string) => `${done} از ${total} خط`,
      ms: (done: string, total: string) => `${done} daripada ${total} strok`,
      'zh-HK': (done: string, total: string) => `共${total}筆，完成咗${done}筆`,
      ja: (done: string, total: string) => `${total}画中${done}画`,
    } as const
    for (const lang of langKeys) {
      const format = new Intl.NumberFormat(lang)
      const done = format.format(1234)
      const total = format.format(5678)
      expect(i18n.tf('handwritingBoard', lang, 'cat'), lang).toBe(boardLabels[lang])
      expect(i18n.tf('handwritingProgress', lang, done, total), lang).toBe(progressLabels[lang](done, total))
    }
    expect(i18n.tf('handwritingBoard', 'xx', 'A')).toBe('Trace A')
    expect(i18n.tf('handwritingProgress', 'xx', '1', '3')).toBe('1 of 3 strokes')
  })
})
