import { html } from 'foldkit/html'

import { ClickedBubbles, ClickedCounter, ClickedGreeting, ClickedPeekaboo } from '../message'
import { t } from '../i18n'

type Message = ReturnType<typeof ClickedGreeting>
  | ReturnType<typeof ClickedCounter>
  | ReturnType<typeof ClickedPeekaboo>
  | ReturnType<typeof ClickedBubbles>

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
            h.p([h.Class('game-desc')], [t('greetingDesc', language)]),
          ],
        ),
        h.div(
          [h.OnClick(ClickedCounter()), h.Class('game-card')],
          [
            h.div([h.Class('game-emoji')], ['🔢']),
            h.h2([h.Class('game-name')], [t('counterTitle', language)]),
            h.p([h.Class('game-desc')], [t('counterDesc', language)]),
          ],
        ),
        h.div(
          [h.OnClick(ClickedPeekaboo()), h.Class('game-card')],
          [
            h.div([h.Class('game-emoji')], ['🙈']),
            h.h2([h.Class('game-name')], [t('peekabooTitle', language)]),
            h.p([h.Class('game-desc')], [t('peekabooDesc', language)]),
          ],
        ),
        h.div(
          [h.OnClick(ClickedBubbles()), h.Class('game-card')],
          [
            h.div([h.Class('game-emoji')], ['🫧']),
            h.h2([h.Class('game-name')], [t('bubblesTitle', language)]),
            h.p([h.Class('game-desc')], [t('bubblesDesc', language)]),
          ],
        ),
      ]),
    ],
  )
}
