import { html } from 'foldkit/html'

import { ClickedBubbles, ClickedCounter, ClickedGreeting, ClickedPeekaboo } from '../message'

type Message = ReturnType<typeof ClickedGreeting>
  | ReturnType<typeof ClickedCounter>
  | ReturnType<typeof ClickedPeekaboo>
  | ReturnType<typeof ClickedBubbles>

export const view = () => {
  const h = html<Message>()

  return h.div(
    [h.Class('landing')],
    [
      h.div([h.Class('header')], [
        h.h1([h.Class('logo')], ['foldkid']),
        h.p([h.Class('subtitle')], ['Pick a game to play!']),
      ]),
      h.div([h.Class('game-grid')], [
        h.div(
          [h.OnClick(ClickedGreeting()), h.Class('game-card')],
          [
            h.div([h.Class('game-emoji')], ['👋']),
            h.h2([h.Class('game-name')], ['Say Hello!']),
            h.p([h.Class('game-desc')], ['A friendly hello greets you every time']),
          ],
        ),
        h.div(
          [h.OnClick(ClickedCounter()), h.Class('game-card')],
          [
            h.div([h.Class('game-emoji')], ['🔢']),
            h.h2([h.Class('game-name')], ['Counter']),
            h.p([h.Class('game-desc')], ['Count up and down with big buttons']),
          ],
        ),
        h.div(
          [h.OnClick(ClickedPeekaboo()), h.Class('game-card')],
          [
            h.div([h.Class('game-emoji')], ['🙈']),
            h.h2([h.Class('game-name')], ['Peek-a-Boo']),
            h.p([h.Class('game-desc')], ['Hide and seek with a friendly face']),
          ],
        ),
        h.div(
          [h.OnClick(ClickedBubbles()), h.Class('game-card')],
          [
            h.div([h.Class('game-emoji')], ['🫧']),
            h.h2([h.Class('game-name')], ['Bubbles']),
            h.p([h.Class('game-desc')], ['Add and pop colorful bubbles']),
          ],
        ),
      ]),
    ],
  )
}
