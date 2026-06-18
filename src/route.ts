import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

export const PageLanding = ts('PageLanding')
export const PageCounter = ts('PageCounter')
export const PageFindIt = ts('PageFindIt')
export const PageBubbles = ts('PageBubbles')
export const PageLetters = ts('PageLetters')
export const PageMusicBox = ts('PageMusicBox')
export const PageAudioTest = ts('PageAudioTest')

export const Page = S.Union([PageLanding, PageCounter, PageFindIt, PageBubbles, PageLetters, PageMusicBox, PageAudioTest])
export type Page = typeof Page.Type
