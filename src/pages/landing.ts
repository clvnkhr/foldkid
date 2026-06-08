import { html } from 'foldkit/html'

import { ClickedBubbles, ClickedCounter, ClickedFindIt, ClickedGreeting, ClickedMusicBox } from '../message'
import { t } from '../i18n'

type Message = ReturnType<typeof ClickedGreeting>
  | ReturnType<typeof ClickedCounter>
  | ReturnType<typeof ClickedFindIt>
  | ReturnType<typeof ClickedBubbles>
  | ReturnType<typeof ClickedMusicBox>

export const view = (language: string) => {
  const h = html<Message>()

  return h.div(
    [h.Class('landing')],
    [
      h.div([h.Class('header')], [
        h.h1([h.Class('logo')], [t('appName', language)]),
        h.p([h.Class('subtitle')], [t('pickGame', language)]),
      ]),
      h.div([h.Class('game-grid')], [
        h.div(
          [h.OnClick(ClickedGreeting()), h.Class('game-card')],
          [
            h.div([h.Class('game-emoji')], ['👋']),
            h.h2([h.Class('game-name')], [t('greetingTitle', language)]),
          ],
        ),
        h.div(
          [h.OnClick(ClickedCounter()), h.Class('game-card')],
          [
            h.div([h.Class('game-emoji')], ['🔢']),
            h.h2([h.Class('game-name')], [t('counterTitle', language)]),
          ],
        ),
        h.div(
          [h.OnClick(ClickedFindIt()), h.Class('game-card')],
          [
            h.div([h.Class('game-emoji')], ['🔎']),
            h.h2([h.Class('game-name')], [t('findItTitle', language)]),
          ],
        ),
        h.div(
          [h.OnClick(ClickedBubbles()), h.Class('game-card')],
          [
            h.div([h.Class('game-emoji')], ['🫧']),
            h.h2([h.Class('game-name')], [t('bubblesTitle', language)]),
          ],
        ),
        h.div(
          [h.OnClick(ClickedMusicBox()), h.Class('game-card')],
          [
            h.div([h.Class('game-emoji')], ['🎵']),
            h.h2([h.Class('game-name')], [t('musicBoxTitle', language)]),
          ],
        ),
        h.a(
          [h.Href('http://foldkit.dev'), h.Class('built-with'), h.Target('_blank')],
          [t('builtWithFoldkit', language)],
        ),
      ]),
    ],
  )
}
