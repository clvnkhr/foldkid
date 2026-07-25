import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

export const PageLanding = ts('PageLanding')
export const PageCounter = ts('PageCounter')
export const PageFindIt = ts('PageFindIt')
export const PageBubbles = ts('PageBubbles')
export const PageDraw = ts('PageDraw')
export const PageMusicBox = ts('PageMusicBox')
export const PageMemory = ts('PageMemory')
export const PagePhonemeGarden = ts('PagePhonemeGarden')
export const PageAudioTest = ts('PageAudioTest')
export const PageSpeakerCalculator = ts('PageSpeakerCalculator')
export const PageWhackamole = ts('PageWhackamole')
export const PagePattern = ts('PagePattern')

export const Page = S.Union([
  PageLanding,
  PageCounter,
  PageFindIt,
  PageBubbles,
  PageDraw,
  PageMusicBox,
  PageMemory,
  PagePhonemeGarden,
  PageAudioTest,
  PageSpeakerCalculator,
  PageWhackamole,
  PagePattern,
])
export type Page = typeof Page.Type
