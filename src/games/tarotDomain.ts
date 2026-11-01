import type { StringKey } from '../i18n'

// Major Arcana, using the Rider–Waite–Smith numbering (Strength VIII, Justice XI).
const MAJOR_CARDS = [
  ['Fool', '0', '#85d7c6', 'M35 104l15-29 18 10-5 31m-13-41 4-24 17-9m-17 9-16-9m33 9 8 18m-28 41-16 17m29-12 18 12'],
  ['Magician', 'I', '#e7a5ba', 'M32 109h56M42 109V92h37v17M55 92V67m0 0L36 51m19 16 25-27M76 36l9 9M44 54h23'],
  ['Priestess', 'II', '#aeb8ed', 'M32 47v67m56-67v67M45 77q15-9 30 0v28q-15-8-30 0zm15 0v25M53 48q8 15 15 0'],
  ['Empress', 'III', '#e3bea0', 'M34 60l6-19 19 14 19-14 8 19zM44 79q16-17 32 0v31H44zM60 85v34M48 118h25'],
  ['Emperor', 'IV', '#e1a093', 'M33 110V66h54v44M42 110V79h36v31M39 51l8-13 13 12 13-12 8 13zM30 119h60'],
  ['Hierophant', 'V', '#d7bb81', 'M51 43h18v18H51zM60 43V32m-13 8h26M36 96l41 25m-40 0 40-25M31 91l9-6 8 13-9 6zm42 25 9-6 7 12-9 6z'],
  ['Lovers', 'VI', '#eba9bd', 'M60 108C9 74 38 49 60 75c22-26 51-1 0 33zM29 43l8 7m54-7-8 7M60 33v12'],
  ['Chariot', 'VII', '#a6c9d9', 'M34 73h52v29H34zm9 0V50h34v23M34 61h52M41 102v11m38-11v11M31 47l29-12 29 12M51 53l9 13 9-13'],
  ['Strength', 'VIII', '#e6bd70', 'M39 83q-11-20 4-34 16-15 35 0 16 14 4 34l-11 19H50zm11-18 4 4m14-4-4 4m-7 11 3 4 4-4M49 91q11 11 22 0M45 40q9-18 15 0 9-18 15 0'],
  ['Hermit', 'IX', '#a9b8cb', 'M40 113l18-59 23 59zm19-64v-9M81 77h21v30H81zm10-8v8M87 91h9m-4-5v11M38 113l-8 13'],
  ['Wheel', 'X', '#cbb184', 'M60 49a30 30 0 1 0 0 60 30 30 0 0 0 0-60zm0 0v60M30 79h60M39 58l42 42m-42 0 42-42M60 70a9 9 0 1 0 0 18 9 9 0 0 0 0-18'],
  ['Justice', 'XI', '#b7caba', 'M60 40v78m-28-59h56M41 59 31 82h20zm38 0L69 82h20zM46 118h28M55 38h10'],
  ['Hanged', 'XII', '#a4bace', 'M30 40h60M60 40v25l16 15-16 15-16-15m16 15v17m0-17-20 10m20-10 20 10M45 80l15-15'],
  ['Death', 'XIII', '#bea9c9', 'M60 117V80C20 49 23 113 60 98c37 15 40-49 0-18zm0-37V61M45 47l15-12 15 12-15 13z'],
  ['Temperance', 'XIV', '#97cfc5', 'M29 53h27l-5 20H34zm7 20v13m-8 0h24M69 93h25l-5 20H75zm13 20v10m-11 0h23M49 64q34-6 34 29M62 70l-4 5m12 2-4 5'],
  ['Devil', 'XV', '#c1a2bd', 'M40 63l-5-22 19 12h15l18-12-6 22M40 63l6 32h28l7-32M51 70l4 3m14-3-4 3M50 106l-10 10m30-10 10 10M36 112a7 7 0 1 0 0 14 7 7 0 0 0 0-14m48 0a7 7 0 1 0 0 14 7 7 0 0 0 0-14'],
  ['Tower', 'XVI', '#b6a4c7', 'M40 120l7-62h31l7 62M43 58V43h10v9h8v-9h10v9h8v-9h9v15M56 77h10v16H56zM87 27 72 53h13L68 80'],
  ['Star', 'XVII', '#9bc8d5', 'M60 39l9 24 26 2-20 17 6 25-21-14-21 14 6-25-20-17 26-2zM29 116q31-9 62 0'],
  ['Moon', 'XVIII', '#adaee2', 'M73 42a30 30 0 1 0 6 56 27 27 0 0 1-6-56zM26 123q18-20 34 0 18-20 34 0M29 72v32m64-32v32'],
  ['Sun', 'XIX', '#efc97a', 'M60 55a23 23 0 1 0 0 46 23 23 0 0 0 0-46zM60 35v11m0 64v11M17 78h11m64 0h11M29 47l8 8m46 46 8 8m-62 0 8-8m46-46 8-8M50 76h1m18 0h1M51 86q9 9 18 0'],
  ['Judgement', 'XX', '#cbb5da', 'M34 75l44-24v47L34 83zm44-24 13-10v67L78 98M36 83l11 26h15L49 82M60 32v9m-22-6 7 8m40-8-7 8'],
  ['World', 'XXI', '#9dd0b8', 'M42 47q-27 31 0 63m36-63q27 31 0 63M43 52l-16-3m13 15-17-2m13 16H20m20 14-16 5m19 6-12 11m46-62 16-3M80 64l17-2m-13 16h16M80 92l16 5m-19 6 12 11M60 61v32m-13-20 13 12 13-12m-13 20-12 17m12-17 12 17'],
] as const
export const TAROT_SUITS = ['Wands', 'Cups', 'Swords', 'Pentacles'] as const
export const TAROT_RANKS = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'] as const
const SUIT_COLORS = ['#e5b07e', '#9acbdb', '#c3b9da', '#a3c7a4'] as const
export const TAROT_CARDS: readonly (readonly [string, string, string, string])[] = [
  ...MAJOR_CARDS,
  ...TAROT_SUITS.flatMap((suit, suitIndex) => TAROT_RANKS.map((rank, rankIndex) =>
    [`${suit}${rank}`, rankIndex < 10 ? String(rankIndex + 1) : ['P', 'N', 'Q', 'K'][rankIndex - 10]!, SUIT_COLORS[suitIndex]!, ''] as const)),
]
export const TAROT_SUIT_PATHS = [
  'M0-11V12M-5-8l5-5 5 5M-5 0h10M-4 10h8',
  'M-9-10H9L6 2Q0 9-6 2zM0 6v8M-5 14H5',
  'M0-15l4 7-4 16-4-16zM-7 8H7M0 8v8',
  'M0-13a13 13 0 1 0 0 26 13 13 0 0 0 0-26zM0-9l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
] as const
export const minorSuit = (index: number): number => Math.floor((index - 22) / 14)
export const minorRank = (index: number): number => (index - 22) % 14
export type TarotCard = typeof TAROT_CARDS[number]
export const cardKey = (index: number): StringKey => `tarotCard${TAROT_CARDS[index]?.[0] ?? 'Fool'}` as StringKey
export const meaningKey = (index: number): StringKey => `tarotMeaning${TAROT_CARDS[index]?.[0] ?? 'Fool'}` as StringKey
export const fullDeck = (): number[] => TAROT_CARDS.map((_, index) => index)
export const randomIndex = (seed: number, length: number): readonly [number, number] => {
  const next = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0
  return [Math.floor(next / 0x100000000 * length), next]
}
export const drawCard = (remaining: readonly number[], seed: number) => {
  const deck = remaining.length ? [...remaining] : fullDeck()
  const [pick, nextSeed] = randomIndex(seed, deck.length)
  const card = deck.splice(pick, 1)[0]!
  return { card, remaining: deck, seed: nextSeed }
}

/** Store each drop's sampled tilt, so later cards cannot rearrange an existing pile. */
export const sampleDropAngle = (seed: number): { readonly angle: number; readonly seed: number } => {
  const [sample, next] = randomIndex(seed, 1601)
  return { angle: (sample - 800) / 100, seed: next }
}
