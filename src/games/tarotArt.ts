import { html, type Html } from 'foldkit/html'
import { TAROT_CARDS } from './tarotDomain'

type Builder<Message> = ReturnType<typeof html<Message>>
export interface TarotArtOptions {
  readonly showName?: boolean
  readonly dropRevision?: number | string
  readonly angle?: number
  readonly faceDown?: boolean
}

export const tarotImageSource = (index: number): string => {
  const card = Number.isSafeInteger(index) && index >= 0 ? TAROT_CARDS[index] : undefined
  return `${import.meta.env.BASE_URL}tarot/${card?.[0] ?? 'Fool'}.webp`
}
const safeId = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, '-')

/** A reversible, celestial-and-botanical back shared by the deck and every flip. */
export const renderTarotBack = <Message>(h: Builder<Message>, id = 'tarot-deck-back'): Html => {
  const prefix = `tarot-back-${safeId(id)}`
  return h.svg([h.Class('tarot-art-back'), h.ViewBox('0 0 120 200'), h.AriaHidden(true), h.Attribute('focusable', 'false')], [
    h.defs([], [
      h.linearGradient([h.Id(`${prefix}-ground`), h.Attribute('x1', '0'), h.Attribute('y1', '0'), h.Attribute('x2', '1'), h.Attribute('y2', '1')], [
        h.stop([h.Attribute('offset', '0'), h.Attribute('stop-color', '#15394b')], []),
        h.stop([h.Attribute('offset', '.5'), h.Attribute('stop-color', '#253046')], []),
        h.stop([h.Attribute('offset', '1'), h.Attribute('stop-color', '#152536')], []),
      ]),
      h.pattern([h.Id(`${prefix}-weave`), h.Width('20'), h.Height('20'), h.Attribute('patternUnits', 'userSpaceOnUse')], [
        h.path([h.D('M10 0 20 10 10 20 0 10zM10 5v10M5 10h10'), h.Fill('none'), h.Stroke('#c4a773'), h.Attribute('stroke-width', '.45'), h.Attribute('opacity', '.28')], []),
        h.circle([h.Cx('10'), h.Cy('10'), h.R('1.2'), h.Fill('#e9d4a2'), h.Attribute('opacity', '.35')], []),
      ]),
    ]),
    h.rect([h.X('1'), h.Y('1'), h.Width('118'), h.Height('198'), h.Attribute('rx', '8'), h.Fill(`url(#${prefix}-ground)`), h.Stroke('#dac395'), h.Attribute('stroke-width', '1.5')], []),
    h.rect([h.X('7'), h.Y('7'), h.Width('106'), h.Height('186'), h.Attribute('rx', '5'), h.Fill(`url(#${prefix}-weave)`), h.Stroke('#b79a64'), h.Attribute('stroke-width', '.7')], []),
    h.rect([h.X('11'), h.Y('11'), h.Width('98'), h.Height('178'), h.Attribute('rx', '3'), h.Fill('none'), h.Stroke('#cbb180'), h.Attribute('stroke-width', '.4')], []),
    ...['', 'translate(120 0) scale(-1 1)', 'translate(0 200) scale(1 -1)', 'translate(120 200) scale(-1 -1)'].map(transform =>
      h.g([h.Attribute('transform', transform), h.Fill('none'), h.Stroke('#dcc595'), h.Attribute('stroke-width', '.75'), h.Attribute('stroke-linecap', 'round')], [
        h.path([h.D('M17 40V18h22M18 33c17 1 7-17 19-13M20 37c8-9 12-7 19-7M23 28c0-9 10-9 10-3-1 6-8 5-10 3M18 47c7-2 9-7 10-11')], []),
        h.path([h.D('M17 20c6 0 8 2 8 7-5 0-8-2-8-7M35 17c0 6-2 8-7 8 0-5 2-8 7-8'), h.Fill('#cbb180'), h.Attribute('fill-opacity', '.18')], []),
      ])),
    h.g([h.Fill('none'), h.Stroke('#cbb180'), h.Attribute('stroke-width', '.75')], [
      h.path([h.D('M60 25v22m-7-9 7-13 7 13-7-4zM60 175v-22m-7 9 7 13 7-13-7 4z')], []),
      h.path([h.D('M27 70q-14 30 0 60m66-60q14 30 0 60M24 77l-5-1m3 12-6-1m6 16-7 2m9 11-6 4m78-43 5-1m-3 12 6-1m-6 16 7 2m-9 11 6 4')], []),
      h.circle([h.Cx('60'), h.Cy('100'), h.R('39'), h.Fill('#1b3042'), h.Attribute('fill-opacity', '.95')], []),
      h.circle([h.Cx('60'), h.Cy('100'), h.R('35'), h.Attribute('stroke-dasharray', '1 2.6')], []),
      ...Array.from({ length: 8 }, (_, index) => h.path([
        h.D('M60 65c-14 12-13 22 0 35 13-13 14-23 0-35z'), h.Attribute('transform', `rotate(${index * 45} 60 100)`), h.Fill('#cbb180'), h.Attribute('fill-opacity', '.06'), h.Attribute('stroke-opacity', '.65'),
      ], [])),
      h.path([h.D('M60 70l7 18 18-7-8 19 8 19-18-7-7 18-7-18-18 7 8-19-8-19 18 7z'), h.Fill('#cbb180'), h.Attribute('fill-opacity', '.1')], []),
      h.circle([h.Cx('60'), h.Cy('100'), h.R('14'), h.Stroke('#e2cca0'), h.Attribute('stroke-width', '1')], []),
      h.path([h.D('M64 88a13 13 0 1 0 5 20 12 12 0 0 1-5-20z'), h.Fill('#e2cca0'), h.Attribute('fill-opacity', '.85'), h.Stroke('none')], []),
      h.path([h.D('M58 95v7m-3-3h6M68 93v4m-2-2h4')], []),
    ]),
    ...[[40, 49], [80, 49], [37, 149], [83, 149], [60, 53], [60, 147]].map(([x, y]) => h.path([
      h.D(`M${x} ${y! - 3}v6m-3-3h6`), h.Fill('none'), h.Stroke('#e4cea0'), h.Attribute('stroke-width', '.7'),
    ], [])),
  ])
}

/** Full public-domain RWS illustrations; the name stays outside every tilt and flip. */
export const renderTarotArt = <Message>(h: Builder<Message>, index: number, id: string, label: string, options: TarotArtOptions = {}): Html => {
  const validIndex = Number.isSafeInteger(index) && index >= 0 && index < TAROT_CARDS.length ? index : 0
  const card = TAROT_CARDS[validIndex]!
  const angle = Number.isFinite(options.angle) ? Math.max(-15, Math.min(15, options.angle!)) : 0
  const flipping = options.dropRevision !== undefined && !options.faceDown
  const flipKey = options.dropRevision === undefined ? `card-${validIndex}` : `drop-${options.dropRevision}-${validIndex}`
  return h.div([h.Class('tarot-face'), h.Attribute('role', 'img'), h.Attribute('aria-label', label)], [
    h.div([h.Class('tarot-card-visual'), h.Style({ '--tarot-settled-angle': `${angle}deg` })], [
      h.div([
        h.Class(`tarot-card-flipper${flipping ? ' tarot-card-flipper--dropping' : options.faceDown ? ' tarot-card-flipper--face-down' : ''}`), h.Key(flipKey),
      ], [
        h.div([h.Class('tarot-card-front')], [h.div([h.Class('tarot-art-frame')], [
          h.img([
            h.Class('tarot-art-image'), h.Src(tarotImageSource(validIndex)), h.Alt(''), h.AriaHidden(true),
            h.Width('440'), h.Height('760'), h.Attribute('loading', 'lazy'), h.Attribute('decoding', 'async'), h.Attribute('draggable', 'false'),
          ]),
        ])]),
        h.div([h.Class('tarot-card-back'), h.AriaHidden(true)], [renderTarotBack(h, `${id}-flip`)]),
      ]),
    ]),
    ...(options.showName === false || options.faceDown ? [] : [h.div([h.Class('tarot-art-caption')], [
      h.span([h.Class('tarot-art-rank'), h.AriaHidden(true), h.Attribute('dir', 'ltr')], [card[1]]),
      h.span([h.Class('tarot-face-name')], [label]),
    ])]),
  ])
}
