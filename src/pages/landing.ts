import { html } from 'foldkit/html'

import { ClickedAudioTest, ClickedBsl, ClickedBubbles, ClickedCounter, ClickedDraw, ClickedFindIt, ClickedMagneticBlocks, ClickedMemory, ClickedMusicBox, ClickedPhonemeGarden, ClickedRps, ClickedSpeakerCalculator, ClickedTalkingClock, ClickedTalkingKeyboard, ClickedWhackamole, ClickedPattern, LandingDragEnded, LandingDragStarted, LandingDroppedOn } from '../message'
import { t } from '../i18n'
import { pointerReorder } from '../pointerReorder'

type Message = ReturnType<typeof ClickedCounter>
  | ReturnType<typeof ClickedFindIt>
  | ReturnType<typeof ClickedBubbles>
  | ReturnType<typeof ClickedDraw>
  | ReturnType<typeof ClickedMusicBox>
  | ReturnType<typeof ClickedMemory>
  | ReturnType<typeof ClickedPhonemeGarden>
  | ReturnType<typeof ClickedAudioTest>
  | ReturnType<typeof ClickedSpeakerCalculator>
  | ReturnType<typeof ClickedWhackamole>
  | ReturnType<typeof ClickedPattern>
  | ReturnType<typeof ClickedBsl>
  | ReturnType<typeof ClickedRps>
  | ReturnType<typeof ClickedMagneticBlocks>
  | ReturnType<typeof ClickedTalkingKeyboard>
  | ReturnType<typeof ClickedTalkingClock>
  | ReturnType<typeof LandingDragStarted>
  | ReturnType<typeof LandingDroppedOn>
  | ReturnType<typeof LandingDragEnded>

export const LANDING_GAMES = [
  { msg: ClickedCounter, title: 'counterTitle' as const, emoji: '🔢' },
  { msg: ClickedFindIt, title: 'findItTitle' as const, emoji: '🔎' },
  { msg: ClickedBubbles, title: 'bubblesTitle' as const, emoji: '🫧' },
  { msg: ClickedDraw, title: 'drawTitle' as const, emoji: '✍️' },
  { msg: ClickedMusicBox, title: 'musicBoxTitle' as const, emoji: '🎵' },
  { msg: ClickedMemory, title: 'memoryCardsTitle' as const, emoji: '🃏' },
  { msg: ClickedPhonemeGarden, title: 'phonemeGardenTitle' as const, emoji: '🌱' },
  { msg: ClickedSpeakerCalculator, title: 'calculatorTitle' as const, emoji: '🧮' },
  { msg: ClickedWhackamole, title: 'whackTitle' as const, emoji: '🔨' },
  { msg: ClickedPattern, title: 'patternTitle' as const, emoji: '🧩' },
  { msg: ClickedBsl, title: 'bslTitle' as const, emoji: '🤟' },
  { msg: ClickedRps, title: 'rpsTitle' as const, emoji: '✊' },
  { msg: ClickedMagneticBlocks, title: 'magneticBlocksTitle' as const, emoji: '🧲' },
  { msg: ClickedTalkingKeyboard, title: 'talkingKeyboardTitle' as const, emoji: '⌨️' },
  { msg: ClickedTalkingClock, title: 'talkingClockTitle' as const, emoji: '🕰️' },
]

export const LANDING_GAME_COUNT = LANDING_GAMES.length

export const view = (order: readonly number[], hiddenGames: readonly boolean[], language: string, dragIndex: number) => {
  const h = html<Message>()
  const visibleOrder = order.filter(gameIdx => hiddenGames[gameIdx] !== true)

  return h.div(
    [h.Class('landing')],
    [
      h.div([h.Class('header')], [
        h.h1([h.Class('logo')], [
          h.svg([h.Class('landing-icon'), h.ViewBox('0 0 512 512'), h.Width('64'), h.Height('64')], [
            h.rect([h.Width('512'), h.Height('512'), h.Attribute('rx', '115'), h.Fill('#667eea')], []),
            h.circle([h.Cx('256'), h.Cy('268'), h.R('160'), h.Fill('#fef9c3')], []),
            h.ellipse([h.Cx('196'), h.Cy('240'), h.Attribute('rx', '22'), h.Attribute('ry', '26'), h.Fill('#475569')], []),
            h.ellipse([h.Cx('316'), h.Cy('240'), h.Attribute('rx', '22'), h.Attribute('ry', '26'), h.Fill('#475569')], []),
            h.circle([h.Cx('192'), h.Cy('232'), h.R('8'), h.Fill('#fff')], []),
            h.circle([h.Cx('312'), h.Cy('232'), h.R('8'), h.Fill('#fff')], []),
            h.path([h.D('M175 300 Q256 360 337 300'), h.Stroke('#475569'), h.StrokeWidth('14'), h.Attribute('stroke-linecap', 'round'), h.Fill('none')], []),
            h.circle([h.Cx('128'), h.Cy('120'), h.R('18'), h.Fill('#fde047')], []),
            h.circle([h.Cx('400'), h.Cy('160'), h.R('12'), h.Fill('#fde047')], []),
            h.circle([h.Cx('370'), h.Cy('100'), h.R('14'), h.Fill('#86efac')], []),
            h.circle([h.Cx('140'), h.Cy('380'), h.R('10'), h.Fill('#fca5a5')], []),
            h.circle([h.Cx('380'), h.Cy('370'), h.R('16'), h.Fill('#c4b5fd')], []),
          ]),
          t('appName', language),
        ]),
        h.p([h.Class('subtitle')], [t('pickGame', language)]),
      ]),
      h.div([
        h.Class('game-grid'),
        h.OnMount(pointerReorder<Message>({
          name: 'landingGamePointerReorder',
          itemSelector: '.game-card',
          handleSelector: '.game-card-drag-handle',
          start: index => LandingDragStarted({ index }),
          drop: index => LandingDroppedOn({ index }),
          end: () => LandingDragEnded(),
        })),
      ], [
        ...visibleOrder.map((gameIdx, displayIdx) => {
          const game = LANDING_GAMES[gameIdx]
          if (!game) return null
          return h.div(
            [
              h.OnClick(game.msg()),
              h.Class('game-card' + (dragIndex === displayIdx ? ' game-card--dragging' : '')),
              h.DataAttribute('drag-index', displayIdx.toString()),
              h.AllowDrop(),
              h.OnDrop(LandingDroppedOn({ index: displayIdx })),
              h.Key(gameIdx.toString()),
            ],
            [
              h.span(
                [
                  h.Class('game-card-drag-handle'),
                  h.Attribute('draggable', 'true'),
                  h.Attribute('aria-label', 'Reorder game'),
                  h.Title('Reorder game'),
                  h.OnDragStart(LandingDragStarted({ index: displayIdx })),
                  h.OnDragEnd(LandingDragEnded()),
                ],
                ['⠿'],
              ),
              h.div([h.Class('game-emoji')], [game.emoji]),
              h.h2([h.Class('game-name')], [t(game.title, language)]),
            ],
          )
        }),
      ]),
      h.div([h.Class('landing-footer')], [
        h.a(
          [h.Href('http://foldkit.dev'), h.Class('built-with'), h.Target('_blank')],
          [t('builtWithFoldkit', language)],
        ),
      ]),
      h.a(
        [h.OnClick(ClickedAudioTest()), h.Class('diag-link')],
        ['diag'],
      ),
    ],
  )
}
