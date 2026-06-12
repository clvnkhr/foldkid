import { html } from 'foldkit/html'

import { ClickedAudioTest, ClickedBubbles, ClickedCounter, ClickedFindIt, ClickedGreeting, ClickedMusicBox, LandingDragEnded, LandingDragStarted, LandingDroppedOn } from '../message'
import { t } from '../i18n'

type Message = ReturnType<typeof ClickedGreeting>
  | ReturnType<typeof ClickedCounter>
  | ReturnType<typeof ClickedFindIt>
  | ReturnType<typeof ClickedBubbles>
  | ReturnType<typeof ClickedMusicBox>
  | ReturnType<typeof ClickedAudioTest>
  | ReturnType<typeof LandingDragStarted>
  | ReturnType<typeof LandingDroppedOn>
  | ReturnType<typeof LandingDragEnded>

const GAMES = [
  { msg: ClickedGreeting, title: 'greetingTitle' as const, emoji: '👋' },
  { msg: ClickedCounter, title: 'counterTitle' as const, emoji: '🔢' },
  { msg: ClickedFindIt, title: 'findItTitle' as const, emoji: '🔎' },
  { msg: ClickedBubbles, title: 'bubblesTitle' as const, emoji: '🫧' },
  { msg: ClickedMusicBox, title: 'musicBoxTitle' as const, emoji: '🎵' },
]

export const view = (order: number[], language: string, dragIndex: number) => {
  const h = html<Message>()

  return h.div(
    [h.Class('landing')],
    [
      h.div([h.Class('header')], [
        h.h1([h.Class('logo')], [t('appName', language)]),
        h.p([h.Class('subtitle')], [t('pickGame', language)]),
      ]),
      h.div([h.Class('game-grid')], [
        ...order.map((gameIdx, displayIdx) => {
          const game = GAMES[gameIdx]
          if (!game) return null
          return h.div(
            [
              h.OnClick(game.msg()),
              h.Class('game-card' + (dragIndex === displayIdx ? ' game-card--dragging' : '')),
              h.Attribute('draggable', 'true'),
              h.OnDragStart(LandingDragStarted({ index: displayIdx })),
              h.AllowDrop(),
              h.OnDrop(LandingDroppedOn({ index: displayIdx })),
              h.OnDragEnd(LandingDragEnded()),
              h.Key(gameIdx.toString()),
            ],
            [
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
