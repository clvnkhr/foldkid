import { oval, stroke, type HandwritingStroke } from './handwritingGeometry'

export const HANDWRITING_NUMBERS: ReadonlyArray<string> = '0123456789'.split('')

/** Familiar school numerals: rounded counters, an open four and a continuous figure eight. */
export const numberStrokes: ReadonlyArray<ReadonlyArray<HandwritingStroke>> = [
  [oval(50, 72.5, 28, 47.5)],
  [stroke([35, 42], [50, 25], [50, 120])],
  [stroke([20, 45], [20, 18, 80, 18, 80, 45], [80, 70, 42, 85, 20, 120], [80, 120])],
  [stroke([25, 35], [48, 18, 80, 22, 80, 45], [80, 62, 62, 72, 45, 72], [68, 70, 82, 85, 82, 101], [82, 124, 44, 127, 23, 110])],
  [stroke([65, 25], [20, 87], [85, 87]), stroke([65, 25], [65, 120])],
  [stroke([25, 25], [25, 70], [35, 58, 80, 62, 80, 94], [80, 126, 40, 128, 20, 109]), stroke([25, 25], [80, 25])],
  [stroke([75, 30], [45, 10, 20, 60, 20, 89], [20, 130, 80, 128, 80, 93], [80, 62, 26, 56, 20, 89])],
  [stroke([20, 25], [80, 25], [35, 120])],
  [stroke([65, 30], [48, 12, 20, 22, 25, 45], [30, 65, 76, 78, 80, 98], [86, 128, 20, 128, 20, 98], [20, 76, 66, 62, 75, 45], [82, 30, 73, 23, 65, 30])],
  [stroke([75, 45], [72, 18, 23, 18, 23, 51], [23, 88, 77, 87, 77, 52], [77, 45], [77, 91], [76, 118, 51, 130, 28, 114])],
]
