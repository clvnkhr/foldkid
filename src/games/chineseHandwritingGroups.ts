import { normalizeLanguage, t, tf, type StringKey } from '../i18n'
import { BIANG_TARGET_INDEX, CHINESE_HANDWRITING_TARGETS } from './chineseHandwritingTargets'
import radicalData from './chineseHandwritingRadicals.json'

export const MAX_CHINESE_HANDWRITING_GROUP_SIZE = 20

export interface ChineseHandwritingGroup {
  readonly indices: ReadonlyArray<number>
}
export type ChineseHandwritingCategory = {
  readonly id: string
  readonly groups: ReadonlyArray<ChineseHandwritingGroup>
} & ({ readonly kind: 'theme'; readonly titleKey: StringKey; readonly strokeCount?: undefined; readonly component?: undefined } |
  { readonly kind: 'special'; readonly titleKey: StringKey; readonly strokeCount?: undefined; readonly component?: undefined } |
  { readonly kind: 'component'; readonly titleKey?: undefined; readonly strokeCount?: undefined; readonly component: string; readonly radicalNumber: number } |
  { readonly kind: 'strokes'; readonly titleKey?: undefined; readonly strokeCount: number; readonly component?: undefined })

// Themes, dictionary-radical families, and stroke counts are independent ways
// to find a character. Membership intentionally overlaps between categories.
const themes = [
  { id: 'numbers', titleKey: 'chineseHandwritingCategoryNumbers', characters: '一二三四五六七八九十零百千万' },
  { id: 'family', titleKey: 'chineseHandwritingCategoryFamily', characters: '人男女儿子父母爸妈爷奶哥姐弟妹家亲' },
  { id: 'body', titleKey: 'chineseHandwritingCategoryBody', characters: '口手足头目耳牙心面鼻舌眼嘴脚身脸毛发血' },
  { id: 'pronouns', titleKey: 'chineseHandwritingCategoryPronouns', characters: '我你他她它们谁己自您咱' },
  { id: 'nature', titleKey: 'chineseHandwritingCategoryNature', characters: '天地日月山水火木土石田河海湖江沙岛泉' },
  { id: 'weather', titleKey: 'chineseHandwritingCategoryWeather', characters: '风云雨雪冰雷电雾晴阴冷热凉暖霜露虹' },
  { id: 'animals', titleKey: 'chineseHandwritingCategoryAnimals', characters: '猫狗牛羊马鸟鱼虫兔鸡鸭鹅猪虎龙蛇鼠猴熊象' },
  { id: 'plants', titleKey: 'chineseHandwritingCategoryPlants', characters: '花草树叶竹林森枝根苗果瓜豆禾松桃李柳梅兰' },
  { id: 'food', titleKey: 'chineseHandwritingCategoryFood', characters: '米饭菜肉蛋茶汤粥饼糖盐油酱醋酒包饮食餐乳' },
  { id: 'home', titleKey: 'chineseHandwritingCategoryHome', characters: '门窗床桌椅灯房屋厅墙楼院园室台阶厨厕盆桶' },
  { id: 'clothes', titleKey: 'chineseHandwritingCategoryClothes', characters: '衣裤鞋袜帽裙衫被巾带布棉丝穿脱洗' },
  { id: 'colors', titleKey: 'chineseHandwritingCategoryColors', characters: '红黄蓝绿黑白紫灰粉橙金银色' },
  { id: 'positions', titleKey: 'chineseHandwritingCategoryPositions', characters: '上下中左右前后里外东西南北远近高低' },
  { id: 'sizes', titleKey: 'chineseHandwritingCategorySizes', characters: '大小多少长短宽窄厚薄轻重快慢深浅粗细满空' },
  { id: 'movement', titleKey: 'chineseHandwritingCategoryMovement', characters: '来去开关走跑跳坐立飞游爬进出回过起落升降' },
  { id: 'actions', titleKey: 'chineseHandwritingCategoryActions', characters: '睡醒看听说读写画唱笑哭吃喝玩拿放做给找帮' },
  { id: 'time', titleKey: 'chineseHandwritingCategoryTime', characters: '年季春夏秋冬星期早晚今明昨午时分秒岁周夜' },
  { id: 'school', titleKey: 'chineseHandwritingCategorySchool', characters: '书笔纸字文数课校班师生名音图题答问学语词' },
  { id: 'transport', titleKey: 'chineseHandwritingCategoryTransport', characters: '车船机路桥站街道轮汽骑乘停转运客票港轨航' },
  { id: 'feelings', titleKey: 'chineseHandwritingCategoryFeelings', characters: '爱好喜乐怒怕急忙安宁累困饿饱疼痛病康勇' },
  { id: 'social', titleKey: 'chineseHandwritingCategorySocial', characters: '请谢再见对错是否不有无和友礼让等要能会懂' },
] as const satisfies ReadonlyArray<{ readonly id: string; readonly titleKey: StringKey; readonly characters: string }>

const groupIndices = (indices: ReadonlyArray<number>): ReadonlyArray<ChineseHandwritingGroup> => Object.freeze(
  Array.from({ length: Math.ceil(indices.length / MAX_CHINESE_HANDWRITING_GROUP_SIZE) }, (_, group) => Object.freeze({
    indices: Object.freeze(indices.slice(group * MAX_CHINESE_HANDWRITING_GROUP_SIZE, (group + 1) * MAX_CHINESE_HANDWRITING_GROUP_SIZE)),
  })),
)
const byCharacter = new Map(CHINESE_HANDWRITING_TARGETS.map((entry, index) => [entry.character, index]))
const themedCategories: ReadonlyArray<ChineseHandwritingCategory> = themes.map(theme => {
  const indices = [...theme.characters].map(character => byCharacter.get(character)!)
  return Object.freeze({ kind: 'theme', id: theme.id, titleKey: theme.titleKey, groups: groupIndices(indices) })
})
const radicalGlyphs = new Map(radicalData.radicals as unknown as ReadonlyArray<readonly [number, string]>)
const characterRadicals = new Map(radicalData.characters as unknown as ReadonlyArray<readonly [string, ReadonlyArray<number>]>)
const byRadical = new Map<number, number[]>()
const byStrokes = new Map<number, number[]>()
CHINESE_HANDWRITING_TARGETS.forEach((entry, index) => {
  const indices = byStrokes.get(entry.strokeCount) ?? []
  indices.push(index)
  byStrokes.set(entry.strokeCount, indices)
  for (const radical of index === BIANG_TARGET_INDEX ? [162] : characterRadicals.get(entry.character)!) {
    const family = byRadical.get(radical) ?? []
    family.push(index)
    byRadical.set(radical, family)
  }
})

export const CHINESE_HANDWRITING_CATEGORIES: ReadonlyArray<ChineseHandwritingCategory> = Object.freeze([
  ...themedCategories,
  Object.freeze({ kind: 'special', id: 'biang', titleKey: 'chineseHandwritingBiang', groups: groupIndices([BIANG_TARGET_INDEX]) }),
  ...[...byRadical].sort(([left], [right]) => left - right).map(([radicalNumber, indices]) => Object.freeze({
    kind: 'component' as const, id: `component-${radicalNumber}`, component: radicalGlyphs.get(radicalNumber)!, radicalNumber, groups: groupIndices(indices),
  })),
  ...[...byStrokes].sort(([left], [right]) => left - right).map(([strokeCount, indices]) => Object.freeze({
    kind: 'strokes' as const, id: `stroke-${strokeCount}`, strokeCount, groups: groupIndices(indices),
  })),
])

const categoriesById = new Map(CHINESE_HANDWRITING_CATEGORIES.map(category => [category.id, category]))
type GroupLocation = { readonly categoryId: string; readonly groupIndex: number }
const groupsByCategory = new Map<string, Map<number, GroupLocation>>()
for (const category of CHINESE_HANDWRITING_CATEGORIES) {
  const locations = new Map<number, GroupLocation>()
  category.groups.forEach((group, groupIndex) => {
    const location = Object.freeze({ categoryId: category.id, groupIndex })
    for (const index of group.indices) locations.set(index, location)
  })
  groupsByCategory.set(category.id, locations)
}
// Direct selections keep their current category. A context-free lookup prefers
// a familiar theme, then the character's first-listed Unicode dictionary radical.
const canonicalGroups = new Map<number, GroupLocation>()
for (const category of themedCategories) for (const [index, location] of groupsByCategory.get(category.id)!) {
  if (!canonicalGroups.has(index)) canonicalGroups.set(index, location)
}
CHINESE_HANDWRITING_TARGETS.forEach((entry, index) => {
  if (canonicalGroups.has(index)) return
  if (index === BIANG_TARGET_INDEX) {
    canonicalGroups.set(index, groupsByCategory.get('biang')!.get(index)!)
    return
  }
  const radical = characterRadicals.get(entry.character)![0]!
  canonicalGroups.set(index, groupsByCategory.get(`component-${radical}`)!.get(index)!)
})

export const getChineseHandwritingCategory = (id: string): ChineseHandwritingCategory | undefined => categoriesById.get(id)
export const findChineseHandwritingGroup = (index: number, preferredCategoryId?: string): GroupLocation | undefined =>
  (preferredCategoryId === undefined ? undefined : groupsByCategory.get(preferredCategoryId)?.get(index)) ?? canonicalGroups.get(index)
export const chineseCategoryLabel = (category: ChineseHandwritingCategory, language: string): string => {
  if (category.kind === 'theme' || category.kind === 'special') return t(category.titleKey, language)
  if (category.kind === 'component') return tf('chineseHandwritingByComponent', language, category.component)
  return tf('chineseHandwritingByStrokes', language, new Intl.NumberFormat(normalizeLanguage(language)).format(category.strokeCount))
}
