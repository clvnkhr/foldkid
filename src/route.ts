import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

export const PageLanding = ts('PageLanding')
export const PageGreeting = ts('PageGreeting')
export const PageCounter = ts('PageCounter')
export const PageFindIt = ts('PageFindIt')
export const PageBubbles = ts('PageBubbles')
export const PageMusicBox = ts('PageMusicBox')

export const Page = S.Union([PageLanding, PageGreeting, PageCounter, PageFindIt, PageBubbles, PageMusicBox])
export type Page = typeof Page.Type
