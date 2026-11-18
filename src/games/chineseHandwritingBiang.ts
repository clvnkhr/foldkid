import type { HandwritingGuide, HandwritingPoint, HandwritingStroke } from './handwritingPaths'

export const BIANG_CHARACTER = '𰻝'
export const BIANG_PINYIN = 'biáng'
export const BIANG_STROKE_COUNT = 42

// Independent composition of the common simplified glyph, not a font outline.
// Component medians: Hanzi Writer Data 2.0.1 / Make Me a Hanzi, unchanged below.
// Copyright 1999 Arphic Technology Co., Ltd.; Arphic Public License.
// Placement and resampling: FoldKid, 2026-11-18. See public/chinese-handwriting/BIANG.md.
// Source component-median SHA-256: c240022c63ef755281a3e46b2c01c89d69713e5c00d3da29306b27b33b6a5fa3
type XY = readonly [number, number]
type Median = ReadonlyArray<XY>
type Component = '穴' | '言' | '幺' | '长' | '马' | '心' | '月' | '刂' | '辶'
const COMPONENT_MEDIANS: Readonly<Record<Component, ReadonlyArray<Median>>> = {
  '穴': [[[425,789],[433,779],[529,726],[560,680]],[[229,582],[240,549],[235,529],[182,432],[172,375]],[[268,544],[288,533],[319,535],[528,577],[729,601],[771,587],[791,560],[730,473],[719,468]],[[359,345],[387,298],[336,205],[303,159],[230,84],[157,36]],[[496,410],[532,396],[675,192],[773,80],[932,38]]],
  '言': [[[439,816],[533,759],[562,724]],[[128,586],[195,577],[370,607],[790,653],[860,649],[910,632]],[[363,479],[396,471],[447,474],[612,504],[655,502]],[[371,351],[427,342],[599,373],[647,370]],[[318,220],[347,195],[359,174],[388,-14]],[[380,216],[404,204],[622,247],[658,244],[694,212],[660,106],[633,87]],[[411,18],[424,31],[442,35],[629,57],[677,55],[700,45]]],
  '幺': [[[486,764],[503,746],[517,700],[377,495],[297,394],[280,356],[338,346],[515,354],[541,367]],[[670,561],[691,510],[674,486],[554,340],[345,122],[322,90],[315,63],[343,58],[373,62],[458,82],[632,110],[705,117],[716,108]],[[652,253],[764,115],[783,79],[792,25]]],
  '长': [[[630,744],[650,716],[653,688],[594,612],[543,560],[479,504],[453,489]],[[141,368],[207,352],[427,391],[793,438],[823,434],[888,411]],[[336,754],[374,732],[389,714],[395,427],[379,117],[387,64],[404,67],[436,87],[545,191]],[[456,369],[491,357],[630,206],[727,129],[770,108],[952,82]]],
  '马': [[[289,716],[339,709],[439,733],[570,755],[609,751],[630,735],[645,717],[623,635],[605,507],[589,443]],[[331,643],[351,626],[372,595],[354,412],[360,360],[403,356],[560,388],[719,406],[782,400],[812,370],[762,134],[746,81],[723,38],[698,18],[669,28],[569,86]],[[127,185],[188,171],[385,207],[613,234],[688,212]]],
  '心': [[[185,462],[176,372],[133,236]],[[306,473],[333,435],[369,327],[400,274],[429,244],[471,215],[538,193],[634,183],[693,187],[748,205],[784,234],[773,267],[691,393]],[[425,667],[520,581],[542,534]],[[761,607],[838,558],[886,518],[915,457]]],
  '月': [[[339,773],[379,742],[387,685],[385,504],[366,342],[341,259],[296,169],[236,93],[184,43],[145,17]],[[415,764],[429,752],[503,762],[634,796],[666,780],[681,758],[687,291],[683,93],[664,56],[632,63],[538,104]],[[417,542],[430,550],[535,566],[588,564]],[[399,368],[413,375],[535,394],[588,392]]],
  '刂': [[[380,628],[410,593],[409,417],[401,326],[405,282]],[[551,781],[569,773],[602,740],[599,453],[608,95],[589,46],[558,54],[489,85],[471,95],[469,102],[458,102]]],
  '辶': [[[211,779],[296,735],[329,694]],[[93,495],[133,493],[247,531],[270,526],[286,512],[279,470],[248,413],[241,385],[249,350],[272,309],[290,254],[292,230],[287,215],[278,209]],[[97,156],[140,145],[194,170],[234,181],[298,181],[354,166],[559,87],[697,52],[795,43],[889,61],[918,72]]],
}

interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface ComponentPlacement extends Rect { readonly component: Component; readonly start: number; readonly count: number }
export const BIANG_EIGHT_REGION: Rect = Object.freeze({ x: 55, y: 23, width: 78, height: 11 })

// The mnemonic order is used in the stroke-order reference, with simplified
// 长 / 马 and the mainland three-stroke 辶. 言 remains the full seven strokes.
export const BIANG_COMPONENTS: ReadonlyArray<ComponentPlacement> = Object.freeze(([
  { component: '穴', x: 32, y: 12, width: 116, height: 22, start: 0, count: 5 },
  { component: '言', x: 80, y: 35, width: 27, height: 36, start: 5, count: 7 },
  { component: '幺', x: 54, y: 35, width: 23, height: 36, start: 12, count: 3 },
  { component: '幺', x: 111, y: 35, width: 23, height: 36, start: 15, count: 3 },
  { component: '长', x: 54, y: 74, width: 24, height: 40, start: 18, count: 4 },
  { component: '长', x: 111, y: 74, width: 24, height: 40, start: 22, count: 4 },
  { component: '马', x: 81, y: 74, width: 26, height: 40, start: 26, count: 3 },
  { component: '心', x: 43, y: 118, width: 99, height: 13, start: 29, count: 4 },
  { component: '月', x: 33, y: 37, width: 17, height: 77, start: 33, count: 4 },
  { component: '刂', x: 139, y: 35, width: 10, height: 79, start: 37, count: 2 },
  { component: '辶', x: 11, y: 26, width: 139, height: 124, start: 39, count: 3 },
] satisfies ReadonlyArray<ComponentPlacement>).map(placement => Object.freeze(placement)))

const fit = (medians: ReadonlyArray<Median>, rect: Rect): ReadonlyArray<HandwritingStroke> => {
  const points = medians.flat()
  const minX = Math.min(...points.map(point => point[0]))
  const maxX = Math.max(...points.map(point => point[0]))
  const minY = Math.min(...points.map(point => point[1]))
  const maxY = Math.max(...points.map(point => point[1]))
  return medians.map(median => {
    const fitted = median.map(([x, y]) => ({ x: rect.x + (x - minX) / (maxX - minX) * rect.width, y: rect.y + (maxY - y) / (maxY - minY) * rect.height }))
    const sampled: HandwritingPoint[] = [fitted[0]!]
    for (let index = 1; index < fitted.length; index++) {
      const from = fitted[index - 1]!
      const to = fitted[index]!
      const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 1.5))
      for (let step = 1; step <= count; step++) sampled.push({ x: from.x + (to.x - from.x) * step / count, y: from.y + (to.y - from.y) * step / count })
    }
    return Object.freeze(sampled.map(point => Object.freeze(point)))
  })
}

const strokes = BIANG_COMPONENTS.flatMap(placement => {
  const medians = COMPONENT_MEDIANS[placement.component]
  if (placement.component === '穴') {
    // Preserve the reviewed roof exactly, but tuck 八 into the center. Fitting
    // all five as a standalone 穴 lets its long right leg cover the outside 刂.
    return [...fit(medians, placement).slice(0, 3), ...fit(medians.slice(3), BIANG_EIGHT_REGION)]
  }
  if (placement.component !== '辶') return fit(medians, placement)
  // Its final sweeping stroke goes under the entire compound. Fitting each
  // original 辶 stroke separately reserves the left margin for its dot and turn.
  return [
    ...fit([medians[0]!], { x: 14, y: 26, width: 13, height: 8 }),
    ...fit([medians[1]!], { x: 11, y: 66, width: 18, height: 66 }),
    ...fit([medians[2]!], { x: 11, y: 141, width: 139, height: 9 }),
  ]
})
const guide: HandwritingGuide = Object.freeze({
  text: BIANG_CHARACTER, emoji: '', width: 160, height: 160,
  strokes: Object.freeze(strokes),
})

export const biangHandwritingGuide = (): HandwritingGuide => guide
