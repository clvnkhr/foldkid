import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

export const ClickedLanding = m('ClickedLanding')
export const ClickedGreeting = m('ClickedGreeting')
export const ClickedCounter = m('ClickedCounter')
export const ClickedPeekaboo = m('ClickedPeekaboo')
export const ClickedBubbles = m('ClickedBubbles')
export const ClickedDarkMode = m('ClickedDarkMode')
export const SystemDarkModeChanged = m('SystemDarkModeChanged')

export const NavigationMessage = S.Union([
  ClickedLanding,
  ClickedGreeting,
  ClickedCounter,
  ClickedPeekaboo,
  ClickedBubbles,
])
