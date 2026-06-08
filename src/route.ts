import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

export const PageLanding = ts('PageLanding')
export const PageGreeting = ts('PageGreeting')
export const PageCounter = ts('PageCounter')
export const PageFindIt = ts('PageFindIt')
export const PageBubbles = ts('PageBubbles')

export const Page = S.Union([PageLanding, PageGreeting, PageCounter, PageFindIt, PageBubbles])
export type Page = typeof Page.Type
