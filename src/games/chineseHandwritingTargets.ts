import { BIANG_CHARACTER, BIANG_PINYIN, BIANG_STROKE_COUNT, biangHandwritingGuide } from './chineseHandwritingBiang'
import { CHINESE_CHARACTERS, chineseHandwritingGuide } from './chineseHandwritingData'

export interface ChineseHandwritingTarget {
  readonly character: string
  readonly pinyin: string
  readonly strokeCount: number
}

// Keep the upstream common-character data unchanged; unusual local guides are
// appended here so every target still has one stable, unambiguous index.
export const BIANG_TARGET_INDEX = CHINESE_CHARACTERS.length
export const CHINESE_HANDWRITING_TARGETS: ReadonlyArray<ChineseHandwritingTarget> = Object.freeze([
  ...CHINESE_CHARACTERS,
  Object.freeze({ character: BIANG_CHARACTER, pinyin: BIANG_PINYIN, strokeCount: BIANG_STROKE_COUNT }),
])

export const guideForChineseHandwritingTarget = (index: number) => index === BIANG_TARGET_INDEX
  ? biangHandwritingGuide() : chineseHandwritingGuide(index)

export const chineseHandwritingTargetText = (index: number): string => index === BIANG_TARGET_INDEX
  ? BIANG_PINYIN : CHINESE_HANDWRITING_TARGETS[index]?.character ?? CHINESE_HANDWRITING_TARGETS[0]!.character
