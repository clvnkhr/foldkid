import { Option, Schema as S } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import * as Bubbles from './games/bubbles'
import * as Bubbles3d from './games/bubbles3d'
import { BUBBLE3D_SHAPES } from './games/bubbles3dShapes'
import * as Counter from './games/counter'
import * as FindIt from './games/findit'
import * as Memory from './games/memory'
import * as MusicBox from './games/musicbox'
import * as Main from './main'
import * as GrowingNumbers from './games/growingNumbers'
import * as ShapeWorkshop from './games/shapeWorkshop'
import { translations, t } from './i18n'
import { LANDING_GAME_COUNT } from './pages/landing'

afterEach(() => {
  MusicBox.resetKeyboardControls()
  MusicBox.resetWakeMonitor()
})

describe('codebase invariants', () => {
  it('Find It emoji packs partition the emoji pool and all localized name tables match', () => {
    const packKeys = FindIt.EMOJI_PACKS.map(pack => pack.key)
    expect(new Set(packKeys).size).toBe(packKeys.length)
    expect(FindIt.DEFAULT_EMOJI_PACK_KEYS).toEqual(packKeys)

    const emojisByPack = FindIt.EMOJI_PACKS.flatMap(pack => {
      const pool = FindIt.emojiPoolForPacks([pack.key])
      expect(pool.length, `${pack.key} should not be empty`).toBeGreaterThan(0)
      return pool
    })
    expect(emojisByPack).toHaveLength(FindIt.EMOJI_COUNT)
    expect(new Set(emojisByPack).size).toBe(FindIt.EMOJI_COUNT)

    for (const [language, names] of Object.entries(FindIt.EMOJI_NAMES_BY_LANG)) {
      expect(names, `${language} emoji names`).toHaveLength(FindIt.EMOJI_COUNT)
      expect(names.every(name => name.length > 0), `${language} emoji names should be non-empty`).toBe(true)
    }
  })

  it('MusicBox songs, translation keys, notes, and settings arrays stay aligned', () => {
    const init = MusicBox.init()
    const songKeys = MusicBox.SONGS.map(song => song.key)
    expect(new Set(songKeys).size).toBe(songKeys.length)
    expect(init.songOrder).toEqual(MusicBox.SONGS.map((_, index) => index))
    expect(init.hiddenSongs).toHaveLength(MusicBox.SONGS.length)

    for (const song of MusicBox.SONGS) {
      const titleKey = MusicBox.SONG_TKEYS[song.key]
      expect(titleKey, `${song.key} should have a title translation key`).toBeDefined()
      if (titleKey) expect(t(titleKey)).not.toBe('')
      expect(song.notes.length, `${song.key} notes`).toBeGreaterThan(0)
      expect(song.lyrics.length, `${song.key} lyrics`).toBeGreaterThan(0)
      expect(song.drums.length, `${song.key} drums`).toBeGreaterThan(0)
      const duration = song.notes.reduce((sum, note) => sum + note.dur, 0)
      for (const note of song.notes) {
        expect(note.dur, `${song.key} note duration`).toBeGreaterThan(0)
        if (note.pitch) expect(MusicBox.FREQUENCIES[note.pitch], `${song.key} note ${note.pitch}`).toBeDefined()
      }
      for (const drum of song.drums) {
        expect(MusicBox.DRUM_KINDS, `${song.key} drum kind`).toContain(drum.kind)
        expect(drum.at, `${song.key} drum at`).toBeGreaterThanOrEqual(0)
        expect(drum.at, `${song.key} drum at`).toBeLessThan(duration)
        if (drum.gain !== undefined) expect(drum.gain, `${song.key} drum gain`).toBeGreaterThan(0)
      }
    }
  })

  it('MusicBox instruments have unique keys, translations, harmonics, and sane envelopes', () => {
    const instrumentKeys = MusicBox.INSTRUMENTS.map(instrument => instrument.key)
    expect(new Set(instrumentKeys).size).toBe(instrumentKeys.length)

    for (const instrument of MusicBox.INSTRUMENTS) {
      const titleKey = MusicBox.INST_TKEYS[instrument.key]
      expect(titleKey, `${instrument.key} should have a translation key`).toBeDefined()
      if (titleKey) expect(t(titleKey)).not.toBe('')
      expect(instrument.gain, `${instrument.key} gain`).toBeGreaterThan(0)
      expect(instrument.attack, `${instrument.key} attack`).toBeGreaterThanOrEqual(0)
      expect(instrument.decay, `${instrument.key} decay`).toBeGreaterThanOrEqual(0)
      expect(instrument.sustain, `${instrument.key} sustain`).toBeGreaterThanOrEqual(0)
      expect(instrument.release, `${instrument.key} release`).toBeGreaterThan(0)
      expect(instrument.harmonics.length, `${instrument.key} harmonics`).toBeGreaterThan(0)
      for (const harmonic of instrument.harmonics) {
        expect(harmonic.ratio, `${instrument.key} harmonic ratio`).toBeGreaterThan(0)
        expect(harmonic.gain, `${instrument.key} harmonic gain`).toBeGreaterThan(0)
      }
    }
  })

  it('landing order matches the visible landing game list', () => {
    const [model] = Main.init()
    expect(model.landingOrder).toHaveLength(LANDING_GAME_COUNT)
    expect(model.landingOrder).toEqual(Array.from({ length: LANDING_GAME_COUNT }, (_, index) => index))
  })

  it('all translation dictionaries remain key-compatible with English', () => {
    const englishKeys = Object.keys(translations.en).sort()
    for (const [language, dict] of Object.entries(translations)) {
      expect(Object.keys(dict).sort(), `${language} translation keys`).toEqual(englishKeys)
    }
  })

  it('every 3D shape has a localized name and valid schema identity', () => {
    expect(Object.keys(Bubbles3d.BUBBLE3D_SHAPE_KEYS).sort()).toEqual(BUBBLE3D_SHAPES.map(shape => shape.id).sort())
    for (const shape of BUBBLE3D_SHAPES) {
      const key = Bubbles3d.BUBBLE3D_SHAPE_KEYS[shape.id]
      for (const language of Object.keys(translations)) expect(t(key, language), `${shape.id} in ${language}`).not.toBe('')
    }
    const initial = Bubbles3d.init()
    expect(initial.bubbles).toEqual([])
    const validBubble = Bubbles3d.makeBubble(0, 'sphere', '#FF4757', 0)
    const { shape: _shape, ...missingShape } = validBubble
    const { rainbow: _rainbow, ...missingRainbow } = validBubble
    for (const bubble of [missingShape, { ...validBubble, shape: 'unknown-shape' }, missingRainbow, { ...validBubble, rainbow: 'yes' }]) {
      expect(Option.isNone(S.decodeUnknownOption(Bubbles3d.Model)({ ...initial, bubbles: [bubble] }))).toBe(true)
      expect(Option.isNone(S.decodeUnknownOption(Main.Model)({ ...Main.init()[0], bubbles3d: { ...initial, bubbles: [bubble] } }))).toBe(true)
    }
  })

  it('initial game and app models decode through their Effect schemas', () => {
    const modelCases = [
      ['Counter', Counter.Model, Counter.init],
      ['FindIt', FindIt.Model, FindIt.init()],
      ['Bubbles', Bubbles.Model, Bubbles.init()],
      ['3D Bubbles', Bubbles3d.Model, Bubbles3d.init()],
      ['Memory', Memory.Model, Memory.init()],
      ['MusicBox', MusicBox.Model, MusicBox.init()],
      ['GrowingNumbers', GrowingNumbers.Model, GrowingNumbers.init],
      ['ShapeWorkshop', ShapeWorkshop.Model, ShapeWorkshop.init],
      ['Main', Main.Model, Main.init()[0]],
    ] as const

    for (const [label, schema, model] of modelCases) {
      expect(Option.isSome(S.decodeUnknownOption(schema)(model)), `${label} model`).toBe(true)
    }
  })

  it('rejects an unknown owner of a landing reorder', () => {
    expect(Option.isNone(S.decodeUnknownOption(Main.Model)({ ...Main.init()[0], landingDragSource: 'another-list' }))).toBe(true)
  })

  it('rejects invalid nested messages at Effect schema boundaries', () => {
    const messageCases = [
      ['3D Bubbles pop', Main.Message, { _tag: 'Bubbles3dClickedPop', id: '0', revision: 0 }],
      ['3D Bubbles creation shape', Main.Message, { _tag: 'Bubbles3dCreatedBubble', shape: 'unknown-shape', color: '#FF4757', duration: 0, revision: 0, creationId: 0 }],
      ['3D Bubbles creation color', Main.Message, { _tag: 'Bubbles3dCreatedBubble', shape: 'sphere', color: 'red', duration: 0, revision: 0, creationId: 0 }],
      ['3D Bubbles creation duration', Main.Message, { _tag: 'Bubbles3dCreatedBubble', shape: 'sphere', color: '#FF4757', duration: '500', revision: 0, creationId: 0 }],
      ['3D Bubbles creation ID', Main.Message, { _tag: 'Bubbles3dCreatedBubble', shape: 'sphere', color: '#FF4757', duration: 0, revision: 0, creationId: 'finger' }],
      ['3D Bubbles selected shape', Main.Message, { _tag: 'Bubbles3dSelectedShape', shape: 'unknown-shape' }],
      ['Counter display mode', Counter.Message, { _tag: 'CounterSetDisplayMode', value: 'huge' }],
      ['Counter press pointer', Counter.Message, { _tag: 'CounterPointerDown', button: 'inc', timeStamp: 0, pointerId: 'finger' }],
      ['Main nested Counter cancellation', Main.Message, { _tag: 'CounterPressCancelled', pointerId: 'finger' }],
      ['FindIt emoji pack', FindIt.Message, { _tag: 'FindItSetEmojiPackEnabled', key: 'space', value: true }],
      ['Bubbles color duration', Bubbles.Message, { _tag: 'BubblesClickedColor', color: '#fff', duration: 'fast' }],
      ['Memory card id', Memory.Message, { _tag: 'MemoryClickedCard', id: '0' }],
      ['MusicBox song index', MusicBox.Message, { _tag: 'MusicBoxToggleSongVisibility', index: '1' }],
      ['Growing Numbers choice', GrowingNumbers.Message, { _tag: 'GrowingNumbersChooseGrowth', amount: '1' }],
      ['Shape Workshop piece', ShapeWorkshop.Message, { _tag: 'ShapeWorkshopTapPiece', index: '0' }],
      ['Main nested FindIt message', Main.Message, { _tag: 'FindItSetEmojiPackEnabled', key: 'space', value: true }],
    ] as const

    for (const [label, schema, payload] of messageCases) {
      expect(Option.isNone(S.decodeUnknownOption(schema)(payload)), label).toBe(true)
    }
  })
})
