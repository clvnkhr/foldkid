import { Schema as S } from 'effect'
import type { StringKey } from '../i18n'

export const Food = S.Literals([
  'apple', 'banana', 'strawberry', 'grapes', 'watermelon', 'pear', 'peach', 'orange',
  'carrot', 'corn', 'broccoli', 'bread', 'cheese', 'egg', 'cookie', 'milk',
])
export type Food = typeof Food.Type
export type OrderLength = 2 | 3
export const FOODS = [
  { id: 'apple', emoji: '🍎', labelKey: 'picnicBasketApple' },
  { id: 'banana', emoji: '🍌', labelKey: 'picnicBasketBanana' },
  { id: 'strawberry', emoji: '🍓', labelKey: 'picnicBasketStrawberry' },
  { id: 'grapes', emoji: '🍇', labelKey: 'picnicBasketGrapes' },
  { id: 'watermelon', emoji: '🍉', labelKey: 'picnicBasketWatermelon' },
  { id: 'pear', emoji: '🍐', labelKey: 'picnicBasketPear' },
  { id: 'peach', emoji: '🍑', labelKey: 'picnicBasketPeach' },
  { id: 'orange', emoji: '🍊', labelKey: 'picnicBasketOrange' },
  { id: 'carrot', emoji: '🥕', labelKey: 'picnicBasketCarrot' },
  { id: 'corn', emoji: '🌽', labelKey: 'picnicBasketCorn' },
  { id: 'broccoli', emoji: '🥦', labelKey: 'picnicBasketBroccoli' },
  { id: 'bread', emoji: '🍞', labelKey: 'picnicBasketBread' },
  { id: 'cheese', emoji: '🧀', labelKey: 'picnicBasketCheese' },
  { id: 'egg', emoji: '🥚', labelKey: 'picnicBasketEgg' },
  { id: 'cookie', emoji: '🍪', labelKey: 'picnicBasketCookie' },
  { id: 'milk', emoji: '🥛', labelKey: 'picnicBasketMilk' },
] as const satisfies readonly { readonly id: Food; readonly emoji: string; readonly labelKey: StringKey }[]

export const foodInfo = (food: Food) => FOODS.find(item => item.id === food) ?? FOODS[0]
export interface Order {
  readonly choices: readonly Food[]
  readonly order: readonly Food[]
  readonly rngSeed: number
}
export const DEFAULT_SEED = 0x71c71c42
const random = (seed: number, count: number): readonly [number, number] => {
  const normalized = Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : DEFAULT_SEED
  const next = (Math.imul(normalized, 1664525) + 1013904223) >>> 0
  return [Math.floor(next / 0x100000000 * count), next]
}
const shuffle = (foods: readonly Food[], seed: number): readonly [readonly Food[], number] => {
  const shuffled = [...foods]
  let currentSeed = seed
  for (let index = shuffled.length - 1; index > 0; index--) {
    const [other, nextSeed] = random(currentSeed, index + 1)
    currentSeed = nextSeed
    const item = shuffled[index]!
    shuffled[index] = shuffled[other]!
    shuffled[other] = item
  }
  return [shuffled, currentSeed]
}

/** Both menus and requested orders come from the model's deterministic seed. */
export const generateOrder = (rngSeed: number, length: OrderLength): Order => {
  const [menu, menuSeed] = shuffle(FOODS.map(food => food.id), rngSeed)
  const choices = menu.slice(0, 6)
  const [requested, nextSeed] = shuffle(choices, menuSeed)
  return { choices, order: requested.slice(0, length === 2 ? 2 : 3), rngSeed: nextSeed }
}
