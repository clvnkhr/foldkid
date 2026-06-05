import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

export const PageLanding = ts('PageLanding')
export const PageGreeting = ts('PageGreeting')
export const PageCounter = ts('PageCounter')
export const PagePeekaboo = ts('PagePeekaboo')
export const PageBubbles = ts('PageBubbles')

export const Page = S.Union([PageLanding, PageGreeting, PageCounter, PagePeekaboo, PageBubbles])
export type Page = typeof Page.Type
