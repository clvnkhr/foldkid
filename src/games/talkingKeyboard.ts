import { Effect, Match as M, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { t, type StringKey } from '../i18n'
import { getContext, warmAudio } from '../audio'
import { speak, type SpeechOptions } from '../speech'

export type LetterWord = Readonly<{
  word: string
  emoji?: string
  illustration?: 'map-with-x' | 'emoji-trio' | 'emoji-pair' | 'igloo' | 'ink' | 'jam' | 'king' | 'quarter' | 'queen' | 'ukulele' | 'xylophone' | 'yak' | 'yogurt' | 'zipper' | 'zigzag'
}>

export const WordPackKey = S.Union([
  S.Literal('animals'), S.Literal('food'), S.Literal('nature'), S.Literal('people'),
  S.Literal('places'), S.Literal('things'), S.Literal('ideas'),
])
export type WordPackKey = typeof WordPackKey.Type

export const WORD_PACKS: ReadonlyArray<{ key: WordPackKey; labelKey: StringKey; sample: string }> = [
  { key: 'animals', labelKey: 'talkingKeyboardPackAnimals', sample: '🐘🦊🐙' },
  { key: 'food', labelKey: 'talkingKeyboardPackFood', sample: '🍎🥕🍕' },
  { key: 'nature', labelKey: 'talkingKeyboardPackNature', sample: '🌈🌳🌊' },
  { key: 'people', labelKey: 'talkingKeyboardPackPeople', sample: '🧑‍🚀👸🥷' },
  { key: 'places', labelKey: 'talkingKeyboardPackPlaces', sample: '🏠🚲🚀' },
  { key: 'things', labelKey: 'talkingKeyboardPackThings', sample: '🔑🧸🎺' },
  { key: 'ideas', labelKey: 'talkingKeyboardPackIdeas', sample: '❓⬆️✅' },
]

export const DEFAULT_WORD_PACK_KEYS: WordPackKey[] = WORD_PACKS.map(({ key }) => key)

export const KEYBOARD_ROWS = [
  'QWERTYUIOP',
  'ASDFGHJKL',
  'ZXCVBNM',
] as const

export const LETTER_WORDS: Readonly<Record<string, readonly LetterWord[]>> = {
  A: [
    { word: 'apple', emoji: '🍎' }, { word: 'astronaut', emoji: '🧑‍🚀' }, { word: 'ant', emoji: '🐜' },
    { word: 'avocado', emoji: '🥑' }, { word: 'airplane', emoji: '✈️' }, { word: 'anchor', emoji: '⚓' },
    { word: 'ambulance', emoji: '🚑' }, { word: 'angel', emoji: '😇' }, { word: 'artist', emoji: '🧑‍🎨' },
    { word: 'axe', emoji: '🪓' }, { word: 'accordion', emoji: '🪗' }, { word: 'alarm clock', emoji: '⏰' },
    { word: 'alien', emoji: '👽' },
  ],
  B: [
    { word: 'balloon', emoji: '🎈' }, { word: 'bear', emoji: '🐻' }, { word: 'banana', emoji: '🍌' },
    { word: 'book', emoji: '📘' }, { word: 'butterfly', emoji: '🦋' }, { word: 'baby', emoji: '👶' },
    { word: 'bat', emoji: '🦇' }, { word: 'bee', emoji: '🐝' }, { word: 'bell', emoji: '🔔' },
    { word: 'bicycle', emoji: '🚲' }, { word: 'bird', emoji: '🐦' }, { word: 'bread', emoji: '🍞' },
    { word: 'broccoli', emoji: '🥦' }, { word: 'broom', emoji: '🧹' }, { word: 'bucket', emoji: '🪣' },
    { word: 'bus', emoji: '🚌' }, { word: 'burger', emoji: '🍔' }, { word: 'beetle', emoji: '🪲' },
    { word: 'blueberries', emoji: '🫐' },
  ],
  C: [
    { word: 'cat', emoji: '🐈' }, { word: 'cake', emoji: '🍰' }, { word: 'car', emoji: '🚗' },
    { word: 'cookie', emoji: '🍪' }, { word: 'crown', emoji: '👑' }, { word: 'camel', emoji: '🐫' },
    { word: 'camera', emoji: '📷' }, { word: 'candle', emoji: '🕯️' }, { word: 'carrot', emoji: '🥕' },
    { word: 'cheese', emoji: '🧀' }, { word: 'cherries', emoji: '🍒' }, { word: 'chicken', emoji: '🐔' },
    { word: 'cloud', emoji: '☁️' }, { word: 'compass', emoji: '🧭' }, { word: 'cow', emoji: '🐄' },
    { word: 'crab', emoji: '🦀' }, { word: 'crocodile', emoji: '🐊' }, { word: 'cucumber', emoji: '🥒' },
    { word: 'cupcake', emoji: '🧁' },
  ],
  D: [
    { word: 'dinosaur', emoji: '🦕' }, { word: 'dog', emoji: '🐕' }, { word: 'drum', emoji: '🥁' },
    { word: 'duck', emoji: '🦆' }, { word: 'donut', emoji: '🍩' }, { word: 'deer', emoji: '🦌' },
    { word: 'diamond', emoji: '💎' }, { word: 'dice', emoji: '🎲' }, { word: 'disco ball', emoji: '🪩' },
    { word: 'dolphin', emoji: '🐬' }, { word: 'door', emoji: '🚪' }, { word: 'dove', emoji: '🕊️' },
    { word: 'dragon', emoji: '🐉' }, { word: 'dress', emoji: '👗' }, { word: 'dumpling', emoji: '🥟' },
  ],
  E: [
    { word: 'elephant', emoji: '🐘' }, { word: 'egg', emoji: '🥚' }, { word: 'eagle', emoji: '🦅' },
    { word: 'engine', emoji: '🚂' }, { word: 'envelope', emoji: '✉️' }, { word: 'ear', emoji: '👂' },
    { word: 'earth', emoji: '🌍' }, { word: 'elf', emoji: '🧝' }, { word: 'eye', emoji: '👁️' },
    { word: 'eyeglasses', emoji: '👓' },
  ],
  F: [
    { word: 'fish', emoji: '🐟' }, { word: 'frog', emoji: '🐸' }, { word: 'flower', emoji: '🌼' },
    { word: 'feather', emoji: '🪶' }, { word: 'fire', emoji: '🔥' }, { word: 'factory', emoji: '🏭' },
    { word: 'flag', emoji: '🚩' }, { word: 'flamingo', emoji: '🦩' }, { word: 'flashlight', emoji: '🔦' },
    { word: 'fly', emoji: '🪰' }, { word: 'flute', emoji: '🪈' }, { word: 'fork', emoji: '🍴' },
    { word: 'fox', emoji: '🦊' }, { word: 'french fries', emoji: '🍟' }, { word: 'football', emoji: '⚽' },
  ],
  G: [
    { word: 'giraffe', emoji: '🦒' }, { word: 'guitar', emoji: '🎸' }, { word: 'grapes', emoji: '🍇' },
    { word: 'ghost', emoji: '👻' }, { word: 'globe', emoji: '🌍' }, { word: 'garlic', emoji: '🧄' },
    { word: 'gem', emoji: '💎' }, { word: 'gift', emoji: '🎁' }, { word: 'goat', emoji: '🐐' },
    { word: 'goggles', emoji: '🥽' }, { word: 'goose', emoji: '🪿' }, { word: 'gorilla', emoji: '🦍' },
    { word: 'green apple', emoji: '🍏' }, { word: 'gloves', emoji: '🧤' },
  ],
  H: [
    { word: 'helicopter', emoji: '🚁' }, { word: 'hippo', emoji: '🦛' }, { word: 'hat', emoji: '🎩' },
    { word: 'hamburger', emoji: '🍔' }, { word: 'honey', emoji: '🍯' }, { word: 'hammer', emoji: '🔨' },
    { word: 'hamster', emoji: '🐹' }, { word: 'heart', emoji: '❤️' }, { word: 'hedgehog', emoji: '🦔' },
    { word: 'headphones', emoji: '🎧' }, { word: 'horse', emoji: '🐎' }, { word: 'hot dog', emoji: '🌭' },
    { word: 'hourglass', emoji: '⌛' }, { word: 'house', emoji: '🏠' }, { word: 'hook', emoji: '🪝' },
  ],
  I: [
    { word: 'igloo', illustration: 'igloo' }, { word: 'ice cream', emoji: '🍦' }, { word: 'insect', emoji: '🐞' },
    { word: 'island', emoji: '🏝️' }, { word: 'ink', illustration: 'ink' }, { word: 'ice', emoji: '🧊' },
    { word: 'ice skate', emoji: '⛸️' }, { word: 'identification card', emoji: '🪪' },
    { word: 'index finger', emoji: '☝️' }, { word: 'infant', emoji: '👶' }, { word: 'information', emoji: 'ℹ️' },
    { word: 'infinity', emoji: '♾️' },
  ],
  J: [
    { word: 'jellyfish', emoji: '🪼' }, { word: 'juice', emoji: '🧃' }, { word: 'jigsaw', emoji: '🧩' },
    { word: 'jam', illustration: 'jam' }, { word: 'jacket', emoji: '🧥' }, { word: 'jack-o-lantern', emoji: '🎃' },
    { word: 'jar', emoji: '🫙' }, { word: 'jeans', emoji: '👖' }, { word: 'jet', emoji: '✈️' },
    { word: 'jewel', emoji: '💎' }, { word: 'joystick', emoji: '🕹️' }, { word: 'judge', emoji: '🧑‍⚖️' },
    { word: 'juggling', emoji: '🤹' },
  ],
  K: [
    { word: 'kite', emoji: '🪁' }, { word: 'kangaroo', emoji: '🦘' }, { word: 'key', emoji: '🔑' },
    { word: 'koala', emoji: '🐨' }, { word: 'king', illustration: 'king' }, { word: 'karate', emoji: '🥋' },
    { word: 'kayak', emoji: '🛶' }, { word: 'keyboard', emoji: '⌨️' }, { word: 'kiwi fruit', emoji: '🥝' },
    { word: 'knife', emoji: '🔪' }, { word: 'knot', emoji: '🪢' },
  ],
  L: [
    { word: 'lion', emoji: '🦁' }, { word: 'lemon', emoji: '🍋' }, { word: 'leaf', emoji: '🍃' },
    { word: 'ladder', emoji: '🪜' }, { word: 'ladybug', emoji: '🐞' },
    { word: 'laptop', emoji: '💻' }, { word: 'light bulb', emoji: '💡' }, { word: 'llama', emoji: '🦙' },
    { word: 'lobster', emoji: '🦞' }, { word: 'lock', emoji: '🔒' }, { word: 'lollipop', emoji: '🍭' },
    { word: 'lungs', emoji: '🫁' }, { word: 'luggage', emoji: '🧳' },
  ],
  M: [
    { word: 'moon', emoji: '🌙' }, { word: 'monkey', emoji: '🐒' }, { word: 'music', emoji: '🎵' },
    { word: 'map', emoji: '🗺️' }, { word: 'mushroom', emoji: '🍄' }, { word: 'magnet', emoji: '🧲' },
    { word: 'mango', emoji: '🥭' }, { word: 'medal', emoji: '🏅' }, { word: 'mermaid', emoji: '🧜‍♀️' },
    { word: 'microphone', emoji: '🎤' }, { word: 'milk', emoji: '🥛' }, { word: 'mirror', emoji: '🪞' },
    { word: 'motorbike', emoji: '🏍️' }, { word: 'mountain', emoji: '⛰️' }, { word: 'mouse', emoji: '🐁' },
  ],
  N: [
    { word: 'nest', emoji: '🪺' }, { word: 'noodles', emoji: '🍜' }, { word: 'night', emoji: '🌃' },
    { word: 'nurse', emoji: '🧑‍⚕️' }, { word: 'nose', emoji: '👃' }, { word: 'necktie', emoji: '👔' },
    { word: 'needle', emoji: '🪡' }, { word: 'newspaper', emoji: '📰' }, { word: 'ninja', emoji: '🥷' },
    { word: 'notebook', emoji: '📓' }, { word: 'nut', emoji: '🥜' }, { word: 'nine', emoji: '9️⃣' },
  ],
  O: [
    { word: 'octopus', emoji: '🐙' }, { word: 'orange', emoji: '🍊' }, { word: 'owl', emoji: '🦉' },
    { word: 'ocean', emoji: '🌊' }, { word: 'onion', emoji: '🧅' }, { word: 'office', emoji: '🏢' },
    { word: 'oil drum', emoji: '🛢️' }, { word: 'olive', emoji: '🫒' }, { word: 'old man', emoji: '👴' },
    { word: 'otter', emoji: '🦦' }, { word: 'ox', emoji: '🐂' }, { word: 'oyster', emoji: '🦪' },
  ],
  P: [
    { word: 'penguin', emoji: '🐧' }, { word: 'pizza', emoji: '🍕' }, { word: 'paint', emoji: '🎨' },
    { word: 'parrot', emoji: '🦜' }, { word: 'pencil', emoji: '✏️' }, { word: 'panda', emoji: '🐼' },
    { word: 'pea pod', emoji: '🫛' }, { word: 'peach', emoji: '🍑' }, { word: 'peacock', emoji: '🦚' },
    { word: 'pear', emoji: '🍐' }, { word: 'piano', emoji: '🎹' }, { word: 'pig', emoji: '🐖' },
    { word: 'pineapple', emoji: '🍍' }, { word: 'plug', emoji: '🔌' }, { word: 'popcorn', emoji: '🍿' }, { word: 'potato', emoji: '🥔' },
    { word: 'present', emoji: '🎁' }, { word: 'pumpkin', emoji: '🎃' }, { word: 'purse', emoji: '👛' },
  ],
  Q: [
    { word: 'queen', illustration: 'queen' }, { word: 'quiet', emoji: '🤫' },
    { word: 'question', emoji: '❓' }, { word: 'quarter', illustration: 'quarter' },
  ],
  R: [
    { word: 'rainbow', emoji: '🌈' }, { word: 'robot', emoji: '🤖' }, { word: 'rocket', emoji: '🚀' },
    { word: 'rabbit', emoji: '🐇' }, { word: 'ring', emoji: '💍' }, { word: 'raccoon', emoji: '🦝' },
    { word: 'radio', emoji: '📻' }, { word: 'rain', emoji: '🌧️' }, { word: 'ram', emoji: '🐏' },
    { word: 'rat', emoji: '🐀' }, { word: 'red apple', emoji: '🍎' }, { word: 'rhinoceros', emoji: '🦏' },
    { word: 'roller skate', emoji: '🛼' }, { word: 'rooster', emoji: '🐓' }, { word: 'rose', emoji: '🌹' },
    { word: 'ruler', emoji: '📏' },
  ],
  S: [
    { word: 'sun', emoji: '☀️' }, { word: 'snake', emoji: '🐍' }, { word: 'star', emoji: '⭐' },
    { word: 'sandwich', emoji: '🥪' }, { word: 'socks', emoji: '🧦' },
    { word: 'satellite', emoji: '🛰️' }, { word: 'scissors', emoji: '✂️' }, { word: 'scooter', emoji: '🛴' },
    { word: 'seal', emoji: '🦭' }, { word: 'shark', emoji: '🦈' }, { word: 'sheep', emoji: '🐑' },
    { word: 'shell', emoji: '🐚' }, { word: 'shrimp', emoji: '🦐' }, { word: 'skateboard', emoji: '🛹' },
    { word: 'snail', emoji: '🐌' }, { word: 'snowman', emoji: '⛄' }, { word: 'spoon', emoji: '🥄' },
    { word: 'strawberry', emoji: '🍓' }, { word: 'suitcase', emoji: '🧳' },
  ],
  T: [
    { word: 'tiger', emoji: '🐯' }, { word: 'train', emoji: '🚂' }, { word: 'turtle', emoji: '🐢' },
    { word: 'tomato', emoji: '🍅' }, { word: 'telephone', emoji: '☎️' }, { word: 'taco', emoji: '🌮' },
    { word: 'teddy bear', emoji: '🧸' }, { word: 'telescope', emoji: '🔭' }, { word: 'tent', emoji: '⛺' },
    { word: 'thermometer', emoji: '🌡️' }, { word: 'toilet', emoji: '🚽' }, { word: 'toolbox', emoji: '🧰' },
    { word: 'toothbrush', emoji: '🪥' }, { word: 'tractor', emoji: '🚜' }, { word: 'tree', emoji: '🌳' },
    { word: 'trophy', emoji: '🏆' }, { word: 'trumpet', emoji: '🎺' }, { word: 'tulip', emoji: '🌷' },
    { word: 'teapot', emoji: '🫖' },
  ],
  U: [
    { word: 'umbrella', emoji: '☂️' }, { word: 'unicorn', emoji: '🦄' }, { word: 'up', emoji: '⬆️' },
    { word: 'uniform', emoji: '🥋' }, { word: 'ukulele', illustration: 'ukulele' }, { word: 'ufo', emoji: '🛸' },
    { word: 'underpants', emoji: '🩲' }, { word: 'universe', emoji: '🌌' }, { word: 'urn', emoji: '⚱️' },
    { word: 'upside-down face', emoji: '🙃' },
  ],
  V: [
    { word: 'violin', emoji: '🎻' }, { word: 'volcano', emoji: '🌋' }, { word: 'van', emoji: '🚐' },
    { word: 'vegetables', emoji: '🥕🥦🫛', illustration: 'emoji-trio' }, { word: 'vase', emoji: '🏺' }, { word: 'vampire', emoji: '🧛' },
    { word: 'vest', emoji: '🦺' }, { word: 'video camera', emoji: '📹' }, { word: 'video game', emoji: '🎮' },
    { word: 'victory', emoji: '✌️' }, { word: 'volleyball', emoji: '🏐' },
  ],
  W: [
    { word: 'whale', emoji: '🐋' }, { word: 'watermelon', emoji: '🍉' }, { word: 'window', emoji: '🪟' },
    { word: 'watch', emoji: '⌚' }, { word: 'worm', emoji: '🪱' }, { word: 'waffle', emoji: '🧇' },
    { word: 'web', emoji: '🕸️' }, { word: 'wedding', emoji: '💒' }, { word: 'wheel', emoji: '🛞' },
    { word: 'wheelchair', emoji: '🦽' }, { word: 'wind', emoji: '🌬️' }, { word: 'wolf', emoji: '🐺' },
    { word: 'wood', emoji: '🪵' }, { word: 'wool', emoji: '🧶' }, { word: 'wrench', emoji: '🔧' },
    { word: 'wings', emoji: '🪽' },
  ],
  X: [
    { word: 'xylophone', illustration: 'xylophone' }, { word: 'x-ray', emoji: '🩻' },
    { word: 'xmas tree', emoji: '🎄' }, { word: 'x marks the spot', emoji: '🗺️', illustration: 'map-with-x' },
  ],
  Y: [
    { word: 'yak', illustration: 'yak' }, { word: 'yacht', emoji: '⛵' }, { word: 'yoyo', emoji: '🪀' },
    { word: 'yogurt', illustration: 'yogurt' }, { word: 'yellow', emoji: '💛' }, { word: 'yarn', emoji: '🧶' },
    { word: 'yawn', emoji: '🥱' }, { word: 'yen', emoji: '💴' }, { word: 'yes', emoji: '✅' },
    { word: 'yin-yang', emoji: '☯️' },
  ],
  Z: [
    { word: 'zebra', emoji: '🦓' }, { word: 'zoo', emoji: '🦒🐘🦁', illustration: 'emoji-trio' },
    { word: 'zero', emoji: '0️⃣' }, { word: 'zipper', illustration: 'zipper' }, { word: 'zigzag', illustration: 'zigzag' },
    { word: 'zombie', emoji: '🧟' },
  ],
}

const PACK_MEMBERS: Readonly<Record<Exclude<WordPackKey, 'things'>, ReadonlySet<string>>> = {
  animals: new Set([
    'ant', 'bat', 'bear', 'bee', 'beetle', 'bird', 'butterfly', 'camel', 'cat', 'chicken', 'cow', 'crab',
    'crocodile', 'deer', 'dinosaur', 'dog', 'dolphin', 'dove', 'dragon', 'duck', 'eagle', 'elephant',
    'fish', 'flamingo', 'fly', 'fox', 'frog', 'giraffe', 'goat', 'goose', 'gorilla', 'hamster', 'hedgehog',
    'hippo', 'horse', 'insect', 'jellyfish', 'kangaroo', 'koala', 'ladybug', 'lion', 'llama', 'lobster',
    'monkey', 'mouse', 'octopus', 'otter', 'owl', 'ox', 'oyster', 'panda', 'parrot', 'peacock', 'penguin',
    'pig', 'rabbit', 'raccoon', 'ram', 'rat', 'rhinoceros', 'rooster', 'seal', 'shark', 'sheep', 'shrimp',
    'snail', 'snake', 'tiger', 'turtle', 'unicorn', 'whale', 'wolf', 'worm', 'yak', 'zebra',
  ]),
  food: new Set([
    'apple', 'avocado', 'banana', 'blueberries', 'bread', 'broccoli', 'burger', 'cake', 'carrot', 'cheese',
    'cherries', 'cookie', 'cucumber', 'cupcake', 'donut', 'dumpling', 'egg', 'french fries', 'garlic', 'grapes',
    'green apple', 'hamburger', 'honey', 'hot dog', 'ice cream', 'jam', 'juice', 'kiwi fruit', 'lemon',
    'lollipop', 'mango', 'milk', 'noodles', 'nut', 'olive', 'onion', 'orange', 'pea pod', 'peach', 'pear',
    'pineapple', 'pizza', 'popcorn', 'potato', 'pumpkin', 'sandwich', 'strawberry', 'taco', 'tomato',
    'vegetables', 'waffle', 'watermelon', 'yogurt',
  ]),
  nature: new Set([
    'cloud', 'earth', 'feather', 'fire', 'flower', 'island', 'leaf', 'moon', 'mountain',
    'mushroom', 'ocean', 'rain', 'rainbow', 'rose', 'shell', 'star', 'sun', 'tree', 'tulip',
    'universe', 'volcano', 'web', 'wind', 'wood',
  ]),
  people: new Set([
    'alien', 'angel', 'artist', 'astronaut', 'baby', 'ear', 'elf', 'eye', 'infant', 'index finger', 'judge',
    'king', 'lungs', 'mermaid', 'ninja', 'nose', 'nurse', 'old man', 'queen', 'upside-down face', 'vampire',
    'zombie',
  ]),
  places: new Set([
    'airplane', 'ambulance', 'bicycle', 'bus', 'car', 'factory', 'helicopter', 'house', 'jet', 'kayak',
    'motorbike', 'office', 'rocket', 'satellite', 'scooter', 'skateboard', 'tractor', 'train',
    'ufo', 'van', 'yacht',
  ]),
  ideas: new Set([
    'heart', 'identification card', 'infinity', 'information', 'juggling', 'karate', 'music', 'night', 'nine',
    'paint', 'question', 'quiet', 'up', 'victory', 'wedding', 'x marks the spot', 'yawn', 'yellow', 'yes',
    'yin-yang', 'zero', 'zigzag',
  ]),
}

const WORD_PACK_KEY_SET = new Set<WordPackKey>(DEFAULT_WORD_PACK_KEYS)

export const normalizeWordPackKeys = (keys: readonly string[] | undefined): WordPackKey[] => {
  const normalized: WordPackKey[] = []
  for (const key of keys ?? DEFAULT_WORD_PACK_KEYS) {
    if (WORD_PACK_KEY_SET.has(key as WordPackKey) && !normalized.includes(key as WordPackKey)) {
      normalized.push(key as WordPackKey)
    }
  }
  return normalized.length > 0 ? normalized : [...DEFAULT_WORD_PACK_KEYS]
}

export const wordPackFor = (word: string): WordPackKey => {
  for (const pack of WORD_PACKS) {
    if (pack.key !== 'things' && PACK_MEMBERS[pack.key].has(word)) return pack.key
  }
  return 'things'
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const QuestionState = S.Union([S.Literal('idle'), S.Literal('asking'), S.Literal('correct'), S.Literal('failed')])

export type LetterQuestion = Readonly<{
  letter: string
  wordIndex: number
  word: LetterWord
}>

export const Model = S.Struct({
  selectedLetter: S.String,
  selectedWordIndex: S.Number,
  nextWordIndices: S.Array(S.Number),
  pressCount: S.Number,
  questionState: QuestionState,
  questionLetter: S.String,
  questionWordIndex: S.Number,
  lastGuess: S.String,
  enabledPacks: S.Array(WordPackKey),
})
export type Model = typeof Model.Type

export const PressedLetter = m('TalkingKeyboardPressedLetter', { letter: S.String })
export const AskQuestion = m('TalkingKeyboardAskQuestion')
export const SetWordPackEnabled = m('TalkingKeyboardSetWordPackEnabled', { key: WordPackKey, value: S.Boolean })
export const SoundPlayed = m('TalkingKeyboardSoundPlayed')
export const Message = S.Union([PressedLetter, AskQuestion, SetWordPackEnabled, SoundPlayed])
export type Message = typeof Message.Type

export const init = (enabledPacks: readonly string[] = DEFAULT_WORD_PACK_KEYS): Model => ({
  selectedLetter: 'A',
  selectedWordIndex: 0,
  nextWordIndices: ALPHABET.map(() => 0),
  pressCount: 0,
  questionState: 'idle',
  questionLetter: '',
  questionWordIndex: 0,
  lastGuess: '',
  enabledPacks: normalizeWordPackKeys(enabledPacks),
})

const letterIndex = (letter: string): number => ALPHABET.indexOf(letter)

export const wordsFor = (letter: string, enabledPacks: readonly string[] = DEFAULT_WORD_PACK_KEYS): readonly LetterWord[] => {
  const enabled = new Set(normalizeWordPackKeys(enabledPacks))
  return (LETTER_WORDS[letter] ?? []).filter(({ word }) => enabled.has(wordPackFor(word)))
}

export const questionsForPacks = (enabledPacks: readonly string[] = DEFAULT_WORD_PACK_KEYS): readonly LetterQuestion[] =>
  ALPHABET.flatMap(letter => wordsFor(letter, enabledPacks).map((word, wordIndex) => ({ letter, wordIndex, word })))

export const QUESTIONS: readonly LetterQuestion[] = questionsForPacks()

export const selectedWordFor = (letter: string, index: number, enabledPacks: readonly string[] = DEFAULT_WORD_PACK_KEYS): LetterWord | undefined => {
  const words = wordsFor(letter, enabledPacks)
  if (words.length === 0) return undefined
  return words[((index % words.length) + words.length) % words.length]
}

export const promptFor = (letter: string, word: LetterWord): string =>
  `${letter} is for ${word.word}.`

export const questionPromptFor = (word: LetterWord): string =>
  `Which letter is for ${word.word}?`

export const questionFor = (enabledPacks: readonly string[] = DEFAULT_WORD_PACK_KEYS, random: () => number = Math.random): LetterQuestion | undefined => {
  const questions = questionsForPacks(enabledPacks)
  return questions[Math.floor(random() * questions.length)]
}

const playFanfare = <Msg>(msg: Msg) => ({
  name: 'PlayFanfare' as const,
  effect: Effect.sync(() => {
    const ctx = getContext()
    if (!ctx) return
    const now = ctx.currentTime
    const note = (frequency: number, start: number, duration: number): void => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'triangle'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.connect(gain).connect(ctx.destination)
      oscillator.start(start)
      oscillator.stop(start + duration)
    }
    note(523, now, 0.15)
    note(659, now + 0.1, 0.15)
    note(784, now + 0.2, 0.18)
    note(1047, now + 0.3, 0.42)
  }).pipe(Effect.as(msg)),
})

export const update = (
  model: Model,
  message: Message,
  muted: boolean = false,
  speech: SpeechOptions = {},
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      TalkingKeyboardPressedLetter: (msg) => {
        const letter = msg.letter.toUpperCase()
        const index = letterIndex(letter)
        const words = wordsFor(letter, model.enabledPacks)
        if (index < 0 || words.length === 0) return [model, []]

        if (model.questionState === 'asking') {
          const correct = letter === model.questionLetter
          const next = {
            ...model,
            selectedLetter: letter,
            questionState: correct ? 'correct' as const : 'failed' as const,
            lastGuess: letter,
            pressCount: model.pressCount + 1,
          }
          return [next, correct && !muted ? [playFanfare(SoundPlayed())] : []]
        }

        const normalModel = model.questionState === 'idle'
          ? model
          : {
              ...model,
              questionState: 'idle' as const,
              questionLetter: '',
              questionWordIndex: 0,
              lastGuess: '',
            }
        const selectedWordIndex = (normalModel.nextWordIndices[index] ?? 0) % words.length
        const word = selectedWordFor(letter, selectedWordIndex, model.enabledPacks)
        if (!word) return [model, []]
        const nextWordIndices = [...normalModel.nextWordIndices]
        nextWordIndices[index] = (selectedWordIndex + 1) % words.length
        const next = {
          ...normalModel,
          selectedLetter: letter,
          selectedWordIndex,
          nextWordIndices,
          pressCount: model.pressCount + 1,
        }
        return [
          next,
          muted ? [] : [speak(promptFor(letter, word), SoundPlayed(), { ...speech, lang: 'en' })],
        ]
      },
      TalkingKeyboardAskQuestion: () => {
        const question = questionFor(model.enabledPacks)
        if (!question) return [model, []]
        const next = {
          ...model,
          questionState: 'asking' as const,
          questionLetter: question.letter,
          questionWordIndex: question.wordIndex,
          lastGuess: '',
          pressCount: model.pressCount + 1,
        }
        return [
          next,
          muted ? [] : [speak(questionPromptFor(question.word), SoundPlayed(), { ...speech, lang: 'en' })],
        ]
      },
      TalkingKeyboardSetWordPackEnabled: (msg) => {
        const currentlyEnabled = model.enabledPacks.includes(msg.key)
        if (msg.value === currentlyEnabled) return [model, []]
        if (!msg.value && model.enabledPacks.length === 1) return [model, []]
        const enabledPacks = DEFAULT_WORD_PACK_KEYS.filter(key =>
          key === msg.key ? msg.value : model.enabledPacks.includes(key),
        )
        const selectedLetter = wordsFor(model.selectedLetter, enabledPacks).length > 0
          ? model.selectedLetter
          : ALPHABET.find(letter => wordsFor(letter, enabledPacks).length > 0) ?? 'A'
        return [{
          ...model,
          selectedLetter,
          selectedWordIndex: 0,
          nextWordIndices: ALPHABET.map(() => 0),
          questionState: 'idle',
          questionLetter: '',
          questionWordIndex: 0,
          lastGuess: '',
          enabledPacks,
        }, []]
      },
      TalkingKeyboardSoundPlayed: () => [model, []],
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()
  const fallbackWord = ALPHABET.flatMap(letter => wordsFor(letter, model.enabledPacks))[0] ?? LETTER_WORDS.A![0]!
  const word = selectedWordFor(model.selectedLetter, model.selectedWordIndex, model.enabledPacks) ?? fallbackWord
  const firstLetter = word.word.slice(0, 1)
  const restOfWord = word.word.slice(1)
  const questionWord = selectedWordFor(model.questionLetter, model.questionWordIndex, model.enabledPacks) ?? fallbackWord
  const questionActive = model.questionState !== 'idle'
  const svgPicture = (kind: NonNullable<LetterWord['illustration']>) => {
    const attrs = [
      h.ViewBox('0 0 100 100'),
      h.Width('1em'),
      h.Height('1em'),
      h.Attribute('data-talking-keyboard-illustration', kind),
      h.Attribute('focusable', 'false'),
    ]
    switch (kind) {
      case 'igloo':
        return h.svg(attrs, [
          h.path([h.D('M10 82V56a40 40 0 0180 0v26H10z'), h.Fill('#dbeafe'), h.Stroke('#3b82f6'), h.StrokeWidth('3')], []),
          h.path([h.D('M57 82V64a16 16 0 0132 0v18H57z'), h.Fill('#60a5fa'), h.Stroke('#2563eb'), h.StrokeWidth('3')], []),
          h.path([h.D('M13 58h74M20 39h60M33 23h34M32 39v19M63 39v19'), h.Fill('none'), h.Stroke('#93c5fd'), h.StrokeWidth('2')], []),
        ])
      case 'ink':
        return h.svg(attrs, [
          h.rect([h.X('34'), h.Y('14'), h.Width('32'), h.Height('19'), h.Attribute('rx', '4'), h.Fill('#475569'), h.Stroke('#1e293b'), h.StrokeWidth('3')], []),
          h.path([h.D('M26 35h48l8 12v34a8 8 0 01-8 8H26a8 8 0 01-8-8V47l8-12z'), h.Fill('#172554'), h.Stroke('#0f172a'), h.StrokeWidth('4')], []),
          h.path([h.D('M24 48h52v31a5 5 0 01-5 5H29a5 5 0 01-5-5V48z'), h.Fill('#1e3a8a')], []),
          h.rect([h.X('29'), h.Y('54'), h.Width('42'), h.Height('23'), h.Attribute('rx', '4'), h.Fill('#f8fafc'), h.Stroke('#93c5fd'), h.StrokeWidth('2')], []),
          h.text([
            h.X('50'), h.Y('71'), h.Fill('#172554'), h.Attribute('font-size', '16'),
            h.Attribute('font-family', 'Arial, sans-serif'), h.Attribute('font-weight', '900'), h.Attribute('text-anchor', 'middle'),
          ], ['INK']),
          h.path([h.D('M84 60c8 10 8 14 0 19-8-5-8-9 0-19z'), h.Fill('#3b82f6')], []),
        ])
      case 'jam':
        return h.svg(attrs, [
          h.path([h.D('M25 29h50l5 10v44a8 8 0 01-8 8H28a8 8 0 01-8-8V39l5-10z'), h.Fill('#fee2e2'), h.Stroke('#9f1239'), h.StrokeWidth('3')], []),
          h.path([h.D('M24 47h52v35a5 5 0 01-5 5H29a5 5 0 01-5-5V47z'), h.Fill('#e11d48')], []),
          h.rect([h.X('22'), h.Y('17'), h.Width('56'), h.Height('16'), h.Attribute('rx', '5'), h.Fill('#f8fafc'), h.Stroke('#9f1239'), h.StrokeWidth('3')], []),
          h.path([h.D('M27 18v14m10-14v14m10-14v14m10-14v14m10-14v14m10-9H23m54 7H23'), h.Fill('none'), h.Stroke('#fb7185'), h.StrokeWidth('3')], []),
          h.rect([h.X('31'), h.Y('53'), h.Width('38'), h.Height('24'), h.Attribute('rx', '7'), h.Fill('#fff7ed'), h.Stroke('#fda4af'), h.StrokeWidth('2')], []),
          h.text([
            h.X('50'), h.Y('70'), h.Fill('#9f1239'), h.Attribute('font-size', '16'),
            h.Attribute('font-family', 'Arial, sans-serif'), h.Attribute('font-weight', '900'), h.Attribute('text-anchor', 'middle'),
          ], ['JAM']),
          h.path([h.D('M30 44c4-6 10-5 12 1-2 7-9 8-12-1z'), h.Fill('#fb7185')], []),
          h.path([h.D('M33 39l3-5 2 6 5-2-3 6z'), h.Fill('#16a34a')], []),
          h.path([h.D('M28 37v42'), h.Fill('none'), h.Stroke('#fff'), h.StrokeWidth('2'), h.StrokeLinecap('round'), h.Attribute('opacity', '0.55')], []),
        ])
      case 'king':
        return h.svg(attrs, [
          h.path([h.D('M13 91c2-20 16-31 37-31s35 11 37 31H13z'), h.Fill('#2563eb'), h.Stroke('#1e3a8a'), h.StrokeWidth('3')], []),
          h.path([h.D('M21 88l10-22 19 14 19-14 10 22z'), h.Fill('#dc2626')], []),
          h.path([h.D('M31 45c0-18 8-29 19-29s19 11 19 29c0 16-8 27-19 27S31 61 31 45z'), h.Fill('#f2c094'), h.Stroke('#713f12'), h.StrokeWidth('3')], []),
          h.path([h.D('M29 40c0-20 9-29 21-29s21 9 21 29c-5-7-10-10-21-10S34 33 29 40z'), h.Fill('#7c2d12')], []),
          h.path([h.D('M31 54c5 2 8 1 11-2 2 7 14 7 16 0 3 3 6 4 11 2-1 18-8 28-19 28S32 72 31 54z'), h.Fill('#92400e'), h.Stroke('#713f12'), h.StrokeWidth('2')], []),
          h.circle([h.Cx('42'), h.Cy('44'), h.R('2.5'), h.Fill('#1f2937')], []),
          h.circle([h.Cx('58'), h.Cy('44'), h.R('2.5'), h.Fill('#1f2937')], []),
          h.path([h.D('M44 59q6 5 12 0'), h.Fill('none'), h.Stroke('#7f1d1d'), h.StrokeWidth('2'), h.StrokeLinecap('round')], []),
          h.path([h.D('M28 28L22 8l17 10L50 5l11 13L78 8l-6 20H28z'), h.Fill('#facc15'), h.Stroke('#a16207'), h.StrokeWidth('3'), h.Attribute('stroke-linejoin', 'round')], []),
          h.circle([h.Cx('50'), h.Cy('17'), h.R('4'), h.Fill('#ef4444')], []),
          h.circle([h.Cx('34'), h.Cy('20'), h.R('3'), h.Fill('#3b82f6')], []),
          h.circle([h.Cx('66'), h.Cy('20'), h.R('3'), h.Fill('#3b82f6')], []),
        ])
      case 'quarter':
        return h.svg(attrs, [
          h.circle([h.Cx('50'), h.Cy('50'), h.R('41'), h.Fill('#d1d5db'), h.Stroke('#64748b'), h.StrokeWidth('4')], []),
          h.circle([h.Cx('50'), h.Cy('50'), h.R('34'), h.Fill('#f8fafc'), h.Stroke('#94a3b8'), h.StrokeWidth('2')], []),
          h.text([
            h.X('50'), h.Y('59'), h.Fill('#334155'), h.Attribute('font-size', '28'),
            h.Attribute('font-family', 'Arial, sans-serif'), h.Attribute('font-weight', '800'), h.Attribute('text-anchor', 'middle'),
          ], ['25¢']),
        ])
      case 'queen':
        return h.svg(attrs, [
          h.path([h.D('M12 91c3-19 17-30 38-30s35 11 38 30H12z'), h.Fill('#db2777'), h.Stroke('#831843'), h.StrokeWidth('3')], []),
          h.path([h.D('M27 43c0-23 10-33 23-33s23 10 23 33v31c-5 7-11 10-17 12l-6-13-6 13c-6-2-12-5-17-12V43z'), h.Fill('#6b21a8'), h.Stroke('#4c1d95'), h.StrokeWidth('3')], []),
          h.path([h.D('M32 42c0-18 7-28 18-28s18 10 18 28c0 17-8 29-18 29S32 59 32 42z'), h.Fill('#f4c7a1'), h.Stroke('#713f12'), h.StrokeWidth('2.5')], []),
          h.path([h.D('M31 39c2-18 9-27 20-27 9 0 16 6 19 20-8-5-15-8-21-8-7 7-12 11-18 15z'), h.Fill('#7e22ce')], []),
          h.path([h.D('M27 39c-8 9-7 30 2 38m44-38c8 9 7 30-2 38'), h.Fill('none'), h.Stroke('#7e22ce'), h.StrokeWidth('9'), h.StrokeLinecap('round')], []),
          h.circle([h.Cx('42'), h.Cy('43'), h.R('2.4'), h.Fill('#1f2937')], []),
          h.circle([h.Cx('58'), h.Cy('43'), h.R('2.4'), h.Fill('#1f2937')], []),
          h.path([h.D('M44 56q6 5 12 0'), h.Fill('none'), h.Stroke('#be123c'), h.StrokeWidth('2.4'), h.StrokeLinecap('round')], []),
          h.path([h.D('M27 27L22 7l17 10L50 4l11 13L78 7l-5 20H27z'), h.Fill('#fde047'), h.Stroke('#a16207'), h.StrokeWidth('3'), h.Attribute('stroke-linejoin', 'round')], []),
          h.circle([h.Cx('50'), h.Cy('16'), h.R('4'), h.Fill('#ec4899')], []),
          h.circle([h.Cx('34'), h.Cy('19'), h.R('3'), h.Fill('#22c55e')], []),
          h.circle([h.Cx('66'), h.Cy('19'), h.R('3'), h.Fill('#22c55e')], []),
          h.path([h.D('M39 76l11 8 11-8'), h.Fill('none'), h.Stroke('#fef3c7'), h.StrokeWidth('4'), h.StrokeLinecap('round')], []),
        ])
      case 'ukulele':
        return h.svg(attrs, [
          h.path([h.D('M13 64c-5-14 4-29 18-31 10-1 13 7 20 4 7-3 7-12 17-13 14-1 23 13 17 26-6 14-22 15-32 8-8-5-10 8-18 11-9 3-18-1-22-5z'), h.Fill('#f59e0b'), h.Stroke('#92400e'), h.StrokeWidth('3')], []),
          h.path([h.D('M49 40L79 15l7 8-31 25z'), h.Fill('#b45309'), h.Stroke('#78350f'), h.StrokeWidth('2')], []),
          h.circle([h.Cx('37'), h.Cy('57'), h.R('7'), h.Fill('#78350f')], []),
          h.line([h.X1('29'), h.Y1('66'), h.X2('83'), h.Y2('19'), h.Stroke('#fef3c7'), h.StrokeWidth('1')], []),
          h.line([h.X1('32'), h.Y1('69'), h.X2('86'), h.Y2('22'), h.Stroke('#fef3c7'), h.StrokeWidth('1')], []),
        ])
      case 'xylophone':
        return h.svg(attrs, [
          ...[
            ['#ef4444', 13, 18, 68], ['#f97316', 24, 22, 62], ['#eab308', 35, 26, 56],
            ['#22c55e', 46, 30, 50], ['#3b82f6', 57, 34, 44], ['#6366f1', 68, 38, 38], ['#a855f7', 79, 42, 32],
          ].map(([fill, x, y, height]) => h.rect([
            h.X(String(x)), h.Y(String(y)), h.Width('9'), h.Height(String(height)), h.Attribute('rx', '3'),
            h.Fill(String(fill)), h.Stroke('#334155'), h.StrokeWidth('1.5'),
          ], [])),
          h.line([h.X1('12'), h.Y1('15'), h.X2('66'), h.Y2('88'), h.Stroke('#92400e'), h.StrokeWidth('4'), h.StrokeLinecap('round')], []),
          h.line([h.X1('88'), h.Y1('16'), h.X2('38'), h.Y2('89'), h.Stroke('#92400e'), h.StrokeWidth('4'), h.StrokeLinecap('round')], []),
          h.circle([h.Cx('10'), h.Cy('13'), h.R('6'), h.Fill('#fbbf24'), h.Stroke('#92400e'), h.StrokeWidth('2')], []),
          h.circle([h.Cx('90'), h.Cy('13'), h.R('6'), h.Fill('#fbbf24'), h.Stroke('#92400e'), h.StrokeWidth('2')], []),
        ])
      case 'yak':
        return h.svg(attrs, [
          h.path([h.D('M5 76L25 45l13 17 19-32 31 46H5z'), h.Fill('#dbeafe')], []),
          h.path([h.D('M25 45l7 11 6 6 7-12m12-20l10 15 6 9 6-5'), h.Fill('none'), h.Stroke('#93c5fd'), h.StrokeWidth('3')], []),
          h.path([h.D('M22 50c0-15 13-24 31-24 21 0 34 10 34 27v19l-7-5-6 12-7-12-7 13-8-13-8 12-7-12-8 8-7-13V50z'), h.Fill('#78350f'), h.Stroke('#451a03'), h.StrokeWidth('3'), h.Attribute('stroke-linejoin', 'round')], []),
          h.path([h.D('M29 34C15 32 10 23 14 15c3 8 10 11 22 10m35 9c14-2 19-11 15-19-3 8-10 11-22 10'), h.Fill('#fef3c7'), h.Stroke('#92400e'), h.StrokeWidth('3'), h.StrokeLinecap('round')], []),
          h.path([h.D('M32 30c3-11 12-17 21-17s18 6 21 17v24c0 15-9 24-21 24s-21-9-21-24V30z'), h.Fill('#92400e'), h.Stroke('#451a03'), h.StrokeWidth('3')], []),
          h.path([h.D('M36 31c5-10 11-14 17-14s12 4 17 14l-5 8-4-8-4 9-5-9-5 9-5-9-4 8z'), h.Fill('#451a03')], []),
          h.circle([h.Cx('44'), h.Cy('46'), h.R('3'), h.Fill('#fef3c7')], []),
          h.circle([h.Cx('62'), h.Cy('46'), h.R('3'), h.Fill('#fef3c7')], []),
          h.circle([h.Cx('44'), h.Cy('46'), h.R('1.5'), h.Fill('#111827')], []),
          h.circle([h.Cx('62'), h.Cy('46'), h.R('1.5'), h.Fill('#111827')], []),
          h.path([h.D('M39 57q14-8 28 0v10q-14 9-28 0V57z'), h.Fill('#d6a06c'), h.Stroke('#451a03'), h.StrokeWidth('2')], []),
          h.circle([h.Cx('46'), h.Cy('62'), h.R('2'), h.Fill('#451a03')], []),
          h.circle([h.Cx('60'), h.Cy('62'), h.R('2'), h.Fill('#451a03')], []),
          h.path([h.D('M29 71v18m15-13v15m22-15v15m14-20v18'), h.Fill('none'), h.Stroke('#451a03'), h.StrokeWidth('6'), h.StrokeLinecap('round')], []),
        ])
      case 'yogurt':
        return h.svg(attrs, [
          h.path([h.D('M73 14L57 54'), h.Fill('none'), h.Stroke('#64748b'), h.StrokeWidth('5'), h.StrokeLinecap('round')], []),
          h.circle([h.Cx('76'), h.Cy('10'), h.R('8'), h.Fill('#cbd5e1'), h.Stroke('#64748b'), h.StrokeWidth('3')], []),
          h.path([h.D('M20 31h60L73 88a7 7 0 01-7 6H34a7 7 0 01-7-6L20 31z'), h.Fill('#f8fafc'), h.Stroke('#2563eb'), h.StrokeWidth('3')], []),
          h.path([h.D('M25 49h50l-5 39a4 4 0 01-4 3H34a4 4 0 01-4-3l-5-39z'), h.Fill('#dbeafe')], []),
          h.path([h.D('M17 31c0-7 15-13 33-13s33 6 33 13-15 9-51 9-66 0z'), h.Fill('#fff7ed'), h.Stroke('#2563eb'), h.StrokeWidth('3')], []),
          h.path([h.D('M27 29c5-5 11-4 14 1 4-7 13-7 17 0 4-5 10-5 15-1-9 5-37 5-46 0z'), h.Fill('#ffffff')], []),
          h.circle([h.Cx('37'), h.Cy('27'), h.R('5'), h.Fill('#ef4444')], []),
          h.circle([h.Cx('61'), h.Cy('28'), h.R('4'), h.Fill('#7c3aed')], []),
          h.rect([h.X('31'), h.Y('55'), h.Width('38'), h.Height('23'), h.Attribute('rx', '7'), h.Fill('#ffffff'), h.Stroke('#93c5fd'), h.StrokeWidth('2')], []),
          h.text([
            h.X('50'), h.Y('70'), h.Fill('#1d4ed8'), h.Attribute('font-size', '11'),
            h.Attribute('font-family', 'Arial, sans-serif'), h.Attribute('font-weight', '900'), h.Attribute('text-anchor', 'middle'),
          ], ['YOGURT']),
        ])
      case 'zipper':
        return h.svg(attrs, [
          h.path([h.D('M8 7h35v86H8zM57 7h35v86H57z'), h.Fill('#60a5fa')], []),
          ...Array.from({ length: 6 }, (_, index) => h.path([
            h.D(`M37 ${13 + index * 14}h12v7H37zM51 ${20 + index * 14}h12v7H51z`),
            h.Fill('#facc15'), h.Stroke('#a16207'), h.StrokeWidth('1'),
          ], [])),
          h.rect([h.X('39'), h.Y('34'), h.Width('22'), h.Height('28'), h.Attribute('rx', '6'), h.Fill('#f8fafc'), h.Stroke('#475569'), h.StrokeWidth('3')], []),
          h.circle([h.Cx('50'), h.Cy('45'), h.R('4'), h.Fill('#94a3b8')], []),
          h.line([h.X1('50'), h.Y1('50'), h.X2('50'), h.Y2('77'), h.Stroke('#475569'), h.StrokeWidth('5'), h.StrokeLinecap('round')], []),
        ])
      case 'zigzag':
        return h.svg(attrs, [
          h.polyline([
            h.Points('9,22 36,22 20,48 58,48 39,78 90,78'), h.Fill('none'),
            h.Stroke('#f59e0b'), h.StrokeWidth('11'), h.StrokeLinecap('round'), h.Attribute('stroke-linejoin', 'round'),
          ], []),
        ])
      default:
        return ''
    }
  }
  const pictureFor = (entry: LetterWord) => {
    if (entry.illustration === 'map-with-x') {
      return h.span([h.Class('talking-keyboard-map-with-x')], [
        h.span([h.Class('talking-keyboard-map')], [entry.emoji ?? '']),
        h.span([h.Class('talking-keyboard-map-x'), h.Attribute('aria-hidden', 'true')], ['X']),
      ])
    }
    if (entry.illustration === 'emoji-trio') {
      return h.span([h.Class('talking-keyboard-emoji-trio')], [
        ...[...new Intl.Segmenter().segment(entry.emoji ?? '')].map(({ segment }) => h.span([], [segment])),
      ])
    }
    if (entry.illustration === 'emoji-pair') {
      return h.span([h.Class('talking-keyboard-emoji-pair')], [
        ...[...new Intl.Segmenter().segment(entry.emoji ?? '')].map(({ segment }) => h.span([], [segment])),
      ])
    }
    return entry.illustration ? svgPicture(entry.illustration) : (entry.emoji ?? '')
  }

  return h.div([h.Class('page talking-keyboard-page')], [
    h.div([h.Class('card talking-keyboard-card')], [
      h.h1([h.Class('title')], [t('talkingKeyboardTitle', language)]),
      h.p([h.Class('talking-keyboard-instruction')], [
        questionActive ? t('talkingKeyboardChooseLetter', language) : t('talkingKeyboardPrompt', language),
      ]),
      questionActive
        ? h.div([
          h.Class('talking-keyboard-showcase talking-keyboard-showcase--question' + (
            model.questionState === 'correct'
              ? ' talking-keyboard-showcase--correct'
              : model.questionState === 'failed'
                ? ' talking-keyboard-showcase--failed'
                : ''
          )),
          h.Key(`question-${model.pressCount}`),
          h.Attribute('aria-live', 'polite'),
        ], [
          h.div([h.Class('talking-keyboard-emoji'), h.Attribute('aria-hidden', 'true')], [pictureFor(questionWord)]),
          h.div([h.Class('talking-keyboard-question')], [t('talkingKeyboardWhichLetter', language)]),
          model.questionState === 'correct' || model.questionState === 'failed'
            ? h.div([h.Class('talking-keyboard-answer')], [
              h.span([h.Class('talking-keyboard-letter')], [model.questionLetter]),
              h.span([h.Class('talking-keyboard-is-for')], [' is for ']),
              h.span([h.Class('talking-keyboard-word-letter')], [questionWord.word.slice(0, 1)]),
              h.span([], [questionWord.word.slice(1)]),
              '!',
            ])
            : h.div([h.Class('talking-keyboard-question-mark')], ['?']),
          model.questionState === 'correct'
            ? h.p([h.Class('talking-keyboard-correct')], [`🎉 ${t('talkingKeyboardCorrect', language)}`])
            : model.questionState === 'failed'
              ? h.p([h.Class('talking-keyboard-failed')], [t('talkingKeyboardRightAnswer', language)])
              : null,
        ])
        : h.div([h.Class('talking-keyboard-showcase'), h.Key(`word-${model.pressCount}`)], [
          h.div([h.Class('talking-keyboard-emoji'), h.Attribute('aria-hidden', 'true')], [pictureFor(word)]),
          h.div([h.Class('talking-keyboard-sentence')], [
            h.span([h.Class('talking-keyboard-letter')], [model.selectedLetter]),
            h.span([h.Class('talking-keyboard-is-for')], [' is for']),
          ]),
          h.div([h.Class('talking-keyboard-word'), h.Attribute('aria-label', word.word)], [
            h.span([h.Class('talking-keyboard-word-letter')], [firstLetter]),
            h.span([], [restOfWord]),
          ]),
          h.p([h.Class('talking-keyboard-choice-count')], [
            t('talkingKeyboardMoreWords', language),
          ]),
        ]),
      h.div([h.Class('talking-keyboard-keys'), h.Attribute('aria-label', t('talkingKeyboardTitle', language))], [
        ...KEYBOARD_ROWS.map((row, rowIndex) =>
          h.div([h.Class(`talking-keyboard-row talking-keyboard-row--${rowIndex}`)], [
            ...(rowIndex === KEYBOARD_ROWS.length - 1 ? `${row}?` : row).split('').map(letter => {
              const nextWord = letter === '?'
                ? undefined
                : selectedWordFor(letter, model.nextWordIndices[letterIndex(letter)] ?? 0, model.enabledPacks)
              return h.button(
                [
                  h.Key(letter),
                  h.Class('talking-keyboard-key' + (
                    letter === '?'
                      ? ' talking-keyboard-key--question'
                      : model.questionState === 'failed' && letter === model.questionLetter
                        ? ' talking-keyboard-key--answer'
                        : model.questionState === 'asking' && letter === model.lastGuess
                        ? ' talking-keyboard-key--wrong'
                        : letter === model.selectedLetter
                          ? ' talking-keyboard-key--selected'
                          : ''
                  )),
                  h.Disabled(letter !== '?' && nextWord === undefined),
                  h.Attribute('aria-label', letter === '?'
                    ? t('talkingKeyboardAskQuestion', language)
                    : nextWord ? promptFor(letter, nextWord) : letter),
                  h.OnPointerUp(() => {
                    warmAudio()
                    return Option.some(letter === '?' ? AskQuestion() : PressedLetter({ letter }))
                  }),
                  h.OnKeyUpPreventDefault((key) =>
                    key === 'Enter' || key === ' '
                      ? (warmAudio(), Option.some(letter === '?' ? AskQuestion() : PressedLetter({ letter })))
                      : Option.none(),
                  ),
                ],
                [letter],
              )
            }),
          ]),
        ),
      ]),
    ]),
  ])
}
