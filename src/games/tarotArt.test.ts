import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import { html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { cardKey, TAROT_CARDS } from './tarotDomain'
import { renderTarotArt, renderTarotBack, tarotImageSource, type TarotArtOptions } from './tarotArt'
import { t } from '../i18n'

type State = { readonly index: number; readonly language: string; readonly options?: TarotArtOptions }
const update = (model: State, _message: never) => [model, []] as const
const view = (model: State) => renderTarotArt(html<never>(), model.index, 'test-art', t(cardKey(model.index), model.language), model.options)
const initial: State = { index: 0, language: 'en' }

describe('Tarot illustrated deck artwork', () => {
  it('maps all 78 cards to distinct local illustrations under the configured site base', () => {
    const sources = TAROT_CARDS.map((_, index) => tarotImageSource(index))
    expect(sources).toHaveLength(78)
    expect(new Set(sources).size).toBe(78)
    expect(sources.every(source => source.startsWith(`${import.meta.env.BASE_URL}tarot/`) && source.endsWith('.webp'))).toBe(true)
    expect(sources[0]).toBe(`${import.meta.env.BASE_URL}tarot/Fool.webp`)
    expect(sources[21]).toBe(`${import.meta.env.BASE_URL}tarot/World.webp`)
    expect(sources[22]).toBe(`${import.meta.env.BASE_URL}tarot/WandsAce.webp`)
    expect(sources[36]).toBe(`${import.meta.env.BASE_URL}tarot/CupsAce.webp`)
    expect(sources[77]).toBe(`${import.meta.env.BASE_URL}tarot/PentaclesKing.webp`)
  })

  it.each([-1, .5, NaN, Infinity, 78])('uses the actual Fool illustration for malformed card index %s', index => {
    expect(tarotImageSource(index)).toBe(`${import.meta.env.BASE_URL}tarot/Fool.webp`)
  })

  it('renders a framed full illustration with asynchronous decoding and an accessible localized name', () => {
    const model = { ...initial, index: 36, language: 'fr' }
    Scene.scene({ update, view }, Scene.with(model),
      Scene.expect(Scene.role('img', { name: t(cardKey(model.index), 'fr') })).toExist(),
      Scene.expect(Scene.selector('.tarot-art-image')).toHaveAttr('src', `${import.meta.env.BASE_URL}tarot/CupsAce.webp`),
      Scene.expect(Scene.selector('.tarot-art-image')).toHaveAttr('loading', 'lazy'),
      Scene.expect(Scene.selector('.tarot-art-image')).toHaveAttr('decoding', 'async'),
      Scene.expect(Scene.selector('.tarot-art-image')).toHaveAttr('draggable', 'false'),
      Scene.expect(Scene.selector('.tarot-art-image')).toHaveAttr('alt', ''),
      Scene.expect(Scene.selector('.tarot-art-image')).toHaveAttr('aria-hidden', 'true'),
      Scene.expect(Scene.selector('.tarot-face-name')).toHaveText(t(cardKey(model.index), 'fr')), Scene.Command.expectNone())
  })

  it('keeps the localized name and rank upright outside the tilted, independently keyed flip', () => {
    Scene.scene({ update, view }, Scene.with({ ...initial, options: { dropRevision: 12, angle: -7 } }),
      Scene.expect(Scene.selector('.tarot-card-visual')).toHaveStyle('--tarot-settled-angle', '-7deg'),
      Scene.expect(Scene.selector('.tarot-card-flipper--dropping')).toExist(),
      Scene.expect(Scene.selector('.tarot-card-visual .tarot-face-name')).not.toExist(),
      Scene.expect(Scene.selector('.tarot-art-caption .tarot-face-name')).toHaveText(t(cardKey(0), 'en')),
      Scene.expect(Scene.selector('.tarot-art-rank')).toHaveText('0'),
      Scene.tap(simulation => expect(Option.getOrThrow(Scene.find(simulation.html, '.tarot-card-flipper')).key).toBe('drop-12-0')),
      Scene.Command.expectNone())
    Scene.scene({ update, view }, Scene.with({ ...initial, options: { dropRevision: 13, angle: 4 } }),
      Scene.tap(simulation => expect(Option.getOrThrow(Scene.find(simulation.html, '.tarot-card-flipper')).key).toBe('drop-13-0')),
      Scene.Command.expectNone())
  })

  it('shows a complete patterned back without starting the flip or exposing the caption while face down', () => {
    Scene.scene({ update, view }, Scene.with({ ...initial, options: { faceDown: true, dropRevision: 1 } }),
      Scene.expect(Scene.selector('.tarot-card-flipper--face-down')).toExist(),
      Scene.expect(Scene.selector('.tarot-card-flipper--dropping')).not.toExist(),
      Scene.expect(Scene.selector('.tarot-face-name')).not.toExist(),
      Scene.expect(Scene.selector('.tarot-card-back .tarot-art-back')).toHaveAttr('viewBox', '0 0 120 200'),
      Scene.expect(Scene.selector('.tarot-card-back svg')).toHaveAttr('focusable', 'false'),
      Scene.expect(Scene.selector('.tarot-card-back svg')).toHaveAttr('aria-hidden', 'true'), Scene.Command.expectNone())
  })

  it('scopes the detailed backs’ resource IDs when several cards and the deck share one view', () => {
    const multiple = () => {
      const h = html<never>()
      return h.div([], [renderTarotBack(h, 'deck'), renderTarotArt(h, 0, 'drawn', 'The Fool'), renderTarotArt(h, 1, 'reading 1', 'The Magician')])
    }
    Scene.scene({ update, view: multiple }, Scene.with(initial),
      Scene.tap(simulation => {
        const ids = Scene.findAll(simulation.html, '[id]').map(node => Option.getOrThrow(Scene.attr(node, 'id')))
        expect(ids.length).toBeGreaterThanOrEqual(6)
        expect(new Set(ids).size).toBe(ids.length)
      }), Scene.Command.expectNone())
  })

  it('normalizes invalid or extreme tilt values and can hide a history-card caption', () => {
    Scene.scene({ update, view }, Scene.with({ ...initial, options: { angle: NaN, showName: false } }),
      Scene.expect(Scene.selector('.tarot-card-visual')).toHaveStyle('--tarot-settled-angle', '0deg'),
      Scene.expect(Scene.selector('.tarot-face-name')).not.toExist(), Scene.Command.expectNone())
    Scene.scene({ update, view }, Scene.with({ ...initial, options: { angle: 600 } }),
      Scene.expect(Scene.selector('.tarot-card-visual')).toHaveStyle('--tarot-settled-angle', '15deg'), Scene.Command.expectNone())
  })
})
