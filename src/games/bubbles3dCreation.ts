import { Schema as S } from 'effect'
import type { StringKey } from '../i18n'
import { MAX_BUBBLE3D_SIZE, MIN_BUBBLE3D_SIZE } from './bubbles3dShapes'

export const BUBBLE3D_COLORS = [
  { value: '#FF4757', key: 'colorRed' },
  { value: '#FF7F00', key: 'colorOrange' },
  { value: '#FFD93D', key: 'colorYellow' },
  { value: '#2ED573', key: 'colorGreen' },
  { value: '#1E90FF', key: 'colorBlue' },
  { value: '#A855F7', key: 'colorPurple' },
  { value: '#FF69B4', key: 'colorPink' },
  { value: '#E0E0E0', key: 'colorWhite' },
  { value: '#666666', key: 'colorGrey' },
  { value: 'rainbow', key: 'colorRainbow' },
] as const satisfies ReadonlyArray<{ readonly value: string; readonly key: StringKey }>

export const Bubble3dColor = S.Literals(BUBBLE3D_COLORS.map(color => color.value))
export type Bubble3dColor = typeof Bubble3dColor.Type
export const isBubble3dColor = (value: unknown): value is Bubble3dColor => BUBBLE3D_COLORS.some(color => color.value === value)
export const bubble3dColorKey = (color: Bubble3dColor): StringKey => BUBBLE3D_COLORS.find(entry => entry.value === color)!.key

export const MAX_BUBBLE3D_HOLD_MS = 3000
export const bubble3dSizeForDuration = (duration: number): number =>
  Math.min(MAX_BUBBLE3D_SIZE, MIN_BUBBLE3D_SIZE + Math.min(Math.max(duration, 0), MAX_BUBBLE3D_HOLD_MS) / MAX_BUBBLE3D_HOLD_MS * (MAX_BUBBLE3D_SIZE - MIN_BUBBLE3D_SIZE))
