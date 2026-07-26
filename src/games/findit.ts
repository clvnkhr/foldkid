import { Match as M, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { boing } from '../audio'
import { speak, type SpeechOptions } from '../speech'
import { t, tf } from '../i18n'

export const EmojiPackKey = S.Union([S.Literal('fun'), S.Literal('numbers'), S.Literal('animals')])
export type EmojiPackKey = typeof EmojiPackKey.Type

export const EMOJI_PACKS: ReadonlyArray<{ key: EmojiPackKey; labelKey: 'findItPackFun' | 'findItPackNumbers' | 'findItPackAnimals'; sample: string }> = [
  { key: 'fun', labelKey: 'findItPackFun', sample: '🎈🍕🌈' },
  { key: 'numbers', labelKey: 'findItPackNumbers', sample: '1️⃣2️⃣3️⃣' },
  { key: 'animals', labelKey: 'findItPackAnimals', sample: '🐱🦁🐬' },
]

export const DEFAULT_EMOJI_PACK_KEYS: EmojiPackKey[] = ['fun', 'numbers', 'animals']

const EMOJIS = [
  ['🎈', 'Balloon', 'fun'], ['🎉', 'Party Popper', 'fun'], ['🎊', 'Confetti', 'fun'], ['🎁', 'Gift', 'fun'],
  ['🧸', 'Teddy Bear', 'fun'], ['🍭', 'Lollipop', 'fun'], ['🍬', 'Candy', 'fun'], ['🎂', 'Birthday Cake', 'fun'],
  ['🌈', 'Rainbow', 'fun'], ['🌸', 'Cherry Blossom', 'fun'], ['⭐', 'Star', 'fun'], ['🍕', 'Pizza', 'fun'],
  ['🍔', 'Burger', 'fun'], ['🌮', 'Taco', 'fun'], ['🍩', 'Donut', 'fun'], ['🧁', 'Cupcake', 'fun'],
  ['0️⃣', 'Zero', 'numbers'], ['1️⃣', 'One', 'numbers'], ['2️⃣', 'Two', 'numbers'], ['3️⃣', 'Three', 'numbers'], ['4️⃣', 'Four', 'numbers'],
  ['5️⃣', 'Five', 'numbers'], ['6️⃣', 'Six', 'numbers'], ['7️⃣', 'Seven', 'numbers'], ['8️⃣', 'Eight', 'numbers'], ['9️⃣', 'Nine', 'numbers'],
  ['🐱', 'Cat', 'animals'], ['🐶', 'Dog', 'animals'], ['🐰', 'Rabbit', 'animals'], ['🦋', 'Butterfly', 'animals'], ['🦄', 'Unicorn', 'animals'],
  ['🐻', 'Bear', 'animals'], ['🐼', 'Panda', 'animals'], ['🐨', 'Koala', 'animals'], ['🦁', 'Lion', 'animals'], ['🐯', 'Tiger', 'animals'],
  ['🐸', 'Frog', 'animals'], ['🐵', 'Monkey', 'animals'], ['🦊', 'Fox', 'animals'], ['🐴', 'Horse', 'animals'], ['🦝', 'Raccoon', 'animals'],
  ['🐮', 'Cow', 'animals'], ['🐷', 'Pig', 'animals'], ['🐙', 'Octopus', 'animals'], ['🐧', 'Penguin', 'animals'], ['🐦', 'Bird', 'animals'],
  ['🦅', 'Eagle', 'animals'], ['🦉', 'Owl', 'animals'], ['🐥', 'Chick', 'animals'], ['🦆', 'Duck', 'animals'],
  ['🐢', 'Turtle', 'animals'], ['🐍', 'Snake', 'animals'], ['🦎', 'Lizard', 'animals'], ['🐊', 'Crocodile', 'animals'],
  ['🐳', 'Whale', 'animals'], ['🐬', 'Dolphin', 'animals'], ['🦈', 'Shark', 'animals'], ['🐠', 'Fish', 'animals'], ['🐡', 'Blowfish', 'animals'],
  ['🐝', 'Bee', 'animals'], ['🐞', 'Ladybug', 'animals'], ['🦗', 'Cricket', 'animals'], ['🐜', 'Ant', 'animals'],
] as const

const EMOJI_POOL: string[] = EMOJIS.map(([emoji]) => emoji)
export const EMOJI_COUNT = EMOJIS.length

const EMOJI_NAMES: Record<string, string> = Object.fromEntries(EMOJIS.map(([emoji, name]) => [emoji, name]))

const EMOJI_PACK_KEYS = new Set<EmojiPackKey>(DEFAULT_EMOJI_PACK_KEYS)

export const normalizeEmojiPackKeys = (keys: readonly string[] | undefined): EmojiPackKey[] => {
  const normalized: EmojiPackKey[] = []
  for (const key of keys ?? DEFAULT_EMOJI_PACK_KEYS) {
    if (EMOJI_PACK_KEYS.has(key as EmojiPackKey) && !normalized.includes(key as EmojiPackKey)) {
      normalized.push(key as EmojiPackKey)
    }
  }
  return normalized.length > 0 ? normalized : [...DEFAULT_EMOJI_PACK_KEYS]
}

export const emojiPoolForPacks = (keys: readonly string[] | undefined): string[] => {
  const enabled = new Set(normalizeEmojiPackKeys(keys))
  return EMOJIS
    .filter(([, , pack]) => enabled.has(pack))
    .map(([emoji]) => emoji)
}

export const EMOJI_NAMES_BY_LANG: Record<string, string[]> = {
  zh: ['气球', '派对炮', '五彩纸屑', '礼物', '泰迪熊', '棒棒糖', '糖果', '生日蛋糕', '彩虹', '樱花', '星星', '披萨', '汉堡', '玉米饼', '甜甜圈', '杯子蛋糕', '零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '猫', '狗', '兔子', '蝴蝶', '独角兽', '熊', '熊猫', '考拉', '狮子', '老虎', '青蛙', '猴子', '狐狸', '马', '浣熊', '牛', '猪', '章鱼', '企鹅', '鸟', '鹰', '猫头鹰', '小鸡', '鸭子', '乌龟', '蛇', '蜥蜴', '鳄鱼', '鲸鱼', '海豚', '鲨鱼', '鱼', '河豚', '蜜蜂', '瓢虫', '蟋蟀', '蚂蚁'],
  fr: ['Ballon', 'Coton', 'Confetti', 'Cadeau', 'Ours en peluche', 'Sucette', 'Bonbon', 'Gâteau d\'anniversaire', 'Arc-en-ciel', 'Fleur de cerisier', 'Étoile', 'Pizza', 'Burger', 'Taco', 'Donut', 'Petit gâteau', 'Zéro', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf', 'Chat', 'Chien', 'Lapin', 'Papillon', 'Licorne', 'Ours', 'Panda', 'Koala', 'Lion', 'Tigre', 'Grenouille', 'Singe', 'Renard', 'Cheval', 'Raton laveur', 'Vache', 'Cochon', 'Pieuvre', 'Manchot', 'Oiseau', 'Aigle', 'Hibou', 'Poussin', 'Canard', 'Tortue', 'Serpent', 'Lézard', 'Crocodile', 'Baleine', 'Dauphin', 'Requin', 'Poisson', 'Poisson-globe', 'Abeille', 'Coccinelle', 'Grillon', 'Fourmi'],
  de: ['Ballon', 'Partyknaller', 'Konfetti', 'Geschenk', 'Teddybär', 'Lutscher', 'Bonbon', 'Geburtstagskuchen', 'Regenbogen', 'Kirschblüte', 'Stern', 'Pizza', 'Burger', 'Taco', 'Donut', 'Törtchen', 'Null', 'Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Katze', 'Hund', 'Hase', 'Schmetterling', 'Einhorn', 'Bär', 'Panda', 'Koala', 'Löwe', 'Tiger', 'Frosch', 'Affe', 'Fuchs', 'Pferd', 'Waschbär', 'Kuh', 'Schwein', 'Krake', 'Pinguin', 'Vogel', 'Adler', 'Eule', 'Küken', 'Ente', 'Schildkröte', 'Schlange', 'Eidechse', 'Krokodil', 'Wal', 'Delfin', 'Hai', 'Fisch', 'Kugelfisch', 'Biene', 'Marienkäfer', 'Grille', 'Ameise'],
  fa: ['بادکنک', 'ترقه', 'کاغذ رنگی', 'هدیه', 'خرس عروسکی', 'آبنبات چوبی', 'آبنبات', 'کیک تولد', 'رنگین‌کمان', 'شکوفه گیلاس', 'ستاره', 'پیتزا', 'برگر', 'تاکو', 'دونات', 'کاپ‌کیک', 'صفر', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه', 'گربه', 'سگ', 'خرگوش', 'پروانه', 'تک‌شاخ', 'خرس', 'پاندا', 'کوآلا', 'شیر', 'ببر', 'قورباغه', 'میمون', 'روباه', 'اسب', 'راکون', 'گاو', 'خوک', 'هشت‌پا', 'پنگوئن', 'پرنده', 'عقاب', 'جغد', 'جوجه', 'اردک', 'لاک‌پشت', 'مار', 'مارمولک', 'تمساح', 'نهنگ', 'دلفین', 'کوسه', 'ماهی', 'ماهی بادکنکی', 'زنبور', 'کفشدوزک', 'جیرجیرک', 'مورچه'],
  ms: ['Belon', 'Perapi', 'Konfeti', 'Hadiah', 'Beruang Teddy', 'Lolipop', 'Gula-gula', 'Kek Hari Jadi', 'Pelangi', 'Bunga Sakura', 'Bintang', 'Piza', 'Burger', 'Tako', 'Donut', 'Kek Cawan', 'Sifar', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Lapan', 'Sembilan', 'Kucing', 'Anjing', 'Arnab', 'Rama-rama', 'Unikorn', 'Beruang', 'Panda', 'Koala', 'Singa', 'Harimau', 'Katak', 'Monyet', 'Rubah', 'Kuda', 'Rakon', 'Lembu', 'Babi', 'Gurita', 'Penguin', 'Burung', 'Helang', 'Burung Hantu', 'Anak Ayam', 'Itik', 'Kura-kura', 'Ular', 'Cicak', 'Buaya', 'Ikan Paus', 'Ikan Lumba-lumba', 'Jerung', 'Ikan', 'Ikan Buntal', 'Lebah', 'Kumbang Kura-kura', 'Cengkerik', 'Semut'],
  'zh-HK': ['氣球', '派對炮', '五彩紙屑', '禮物', '啤啤熊', '棒棒糖', '糖果', '生日蛋糕', '彩虹', '櫻花', '星星', '薄餅', '漢堡', '墨西哥卷', '冬甩', '紙杯蛋糕', '零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '貓', '狗', '兔仔', '蝴蝶', '獨角獸', '熊', '熊貓', '樹熊', '獅子', '老虎', '青蛙', '馬騮', '狐狸', '馬', '浣熊', '牛', '豬', '八爪魚', '企鵝', '雀仔', '鷹', '貓頭鷹', '雞仔', '鴨', '龜', '蛇', '蜥蜴', '鱷魚', '鯨魚', '海豚', '鯊魚', '魚', '雞泡魚', '蜜蜂', '瓢蟲', '蟋蟀', '蟻'],
  ja: ['ふうせん', 'クラッカー', 'かみふぶき', 'プレゼント', 'くまのぬいぐるみ', 'ペロペロキャンディ', 'キャンディ', 'バースデーケーキ', 'にじ', 'さくら', 'ほし', 'ピザ', 'ハンバーガー', 'タコス', 'ドーナツ', 'カップケーキ', 'ゼロ', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう', 'ねこ', 'いぬ', 'うさぎ', 'ちょうちょ', 'ユニコーン', 'くま', 'パンダ', 'コアラ', 'ライオン', 'とら', 'かえる', 'さる', 'きつね', 'うま', 'アライグマ', 'うし', 'ぶた', 'たこ', 'ペンギン', 'とり', 'わし', 'ふくろう', 'ひよこ', 'あひる', 'かめ', 'へび', 'とかげ', 'わに', 'くじら', 'いるか', 'さめ', 'さかな', 'ふぐ', 'はち', 'てんとうむし', 'こおろぎ', 'あり'],
}

export const emojiName = (emoji: string, language: string = 'en'): string => {
  const graphemes = [...new Intl.Segmenter().segment(emoji)].map(s => s.segment)
  if (graphemes.length === 1) {
    const idx = EMOJI_POOL.indexOf(emoji)
    if (idx === -1) return emoji
    const names = EMOJI_NAMES_BY_LANG[language]
    if (names && idx < names.length) return names[idx]!
    return EMOJI_NAMES[emoji] ?? emoji
  }
  return graphemes.map(g => emojiName(g, language)).join(' ')
}

const ICON_REPLAY = '🔊'

const EmojiCell = S.Struct({ id: S.Number, emoji: S.String })
type EmojiCell = typeof EmojiCell.Type

export const Model = S.Struct({ grid: S.Array(EmojiCell), target: S.String, count: S.Number, shaking: S.Number, shakeTick: S.Number, won: S.Boolean, found: S.Array(S.String), anyWins: S.Boolean, voiceMode: S.Boolean, pairsMode: S.Boolean, enabledPacks: S.Array(EmojiPackKey), tooltipEmoji: S.Union([S.String, S.Null]), wrongCount: S.Number, hintId: S.Union([S.Number, S.Null]), dragIndex: S.Union([S.Number, S.Null]), gridDragIndex: S.Union([S.Number, S.Null]) })
export type Model = typeof Model.Type

export const ClickedCell = m('FindItClickedCell', { id: S.Number })
export const ClickedNext = m('FindItClickedNext')
export const SetAnyWins = m('FindItSetAnyWins', { value: S.Boolean })
export const SetVoiceMode = m('FindItSetVoiceMode', { value: S.Boolean })
export const SetPairsMode = m('FindItSetPairsMode', { value: S.Boolean })
export const SetEmojiPackEnabled = m('FindItSetEmojiPackEnabled', { key: EmojiPackKey, value: S.Boolean })
export const ReplayQuestion = m('FindItReplayQuestion')
export const ClickedCollectionEmoji = m('FindItClickedCollectionEmoji', { emoji: S.String })
export const ClickedReset = m('FindItClickedReset')
export const DismissTooltip = m('FindItDismissTooltip')
export const SoundPlayed = m('FindItSoundPlayed')
export const SetDragIndex = m('FindItSetDragIndex', { index: S.Number })
export const DroppedOn = m('FindItDroppedOn', { index: S.Number })
export const DragEnded = m('FindItDragEnded')
export const GridDragStarted = m('FindItGridDragStarted', { index: S.Number })
export const GridDroppedOn = m('FindItGridDroppedOn', { index: S.Number })
export const GridDragEnded = m('FindItGridDragEnded')

export const Message = S.Union([ClickedCell, ClickedNext, SetAnyWins, SetVoiceMode, SetPairsMode, SetEmojiPackEnabled, ReplayQuestion, ClickedCollectionEmoji, ClickedReset, DismissTooltip, SoundPlayed, SetDragIndex, DroppedOn, DragEnded, GridDragStarted, GridDroppedOn, GridDragEnded])
export type Message = typeof Message.Type

const shuffle = <T>(arr: readonly T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

const generatePairsGame = (found?: string[], anyWins: boolean = false, voiceMode: boolean = false, enabledPacks: readonly string[] = DEFAULT_EMOJI_PACK_KEYS): Model => {
  const activePacks = normalizeEmojiPackKeys(enabledPacks)
  const sourcePool = emojiPoolForPacks(activePacks)
  const pool = shuffle(sourcePool)
  const emojiA = pool[0]!
  const emojiB = pool[1] ?? pool[0]!
  const target = emojiA + emojiB

  const cellPairs: string[] = [target]
  if (emojiA !== emojiB) {
    cellPairs.push(emojiB + emojiA)
  }

  const candidates = shuffle(sourcePool.flatMap(a => sourcePool.map(b => a + b)))
  for (const candidate of candidates) {
    if (cellPairs.length >= 9) break
    if (!cellPairs.includes(candidate)) cellPairs.push(candidate)
  }
  while (cellPairs.length < 9) cellPairs.push(target)

  const grid = shuffle(cellPairs).map((emoji, i) => ({ id: i, emoji }))
  return { grid, target, count: 0, shaking: -1, shakeTick: 0, won: false, found: found ?? [], anyWins, voiceMode, pairsMode: true, enabledPacks: activePacks, tooltipEmoji: null, wrongCount: 0, hintId: null, dragIndex: null, gridDragIndex: null }
}

const generateGame = (found?: string[], anyWins: boolean = false, voiceMode: boolean = false, pairsMode: boolean = false, enabledPacks: readonly string[] = DEFAULT_EMOJI_PACK_KEYS): Model => {
  const activePacks = normalizeEmojiPackKeys(enabledPacks)
  if (pairsMode) return generatePairsGame(found, anyWins, voiceMode, activePacks)
  const sourcePool = emojiPoolForPacks(activePacks)
  const shuffled = sourcePool.length >= 9
    ? shuffle(sourcePool).slice(0, 9)
    : Array.from({ length: 9 }, (_, i) => sourcePool[i % sourcePool.length]!)
  const grid = shuffled.map((emoji, i) => ({ id: i, emoji }))
  const target = grid[Math.floor(Math.random() * grid.length)]!.emoji
  return { grid, target, count: 0, shaking: -1, shakeTick: 0, won: false, found: found ?? [], anyWins, voiceMode, pairsMode: false, enabledPacks: activePacks, tooltipEmoji: null, wrongCount: 0, hintId: null, dragIndex: null, gridDragIndex: null }
}

export const init = (pairsMode: boolean = false, enabledPacks: readonly string[] = DEFAULT_EMOJI_PACK_KEYS): Model => generateGame([], false, false, pairsMode, enabledPacks)

export const update = (
  model: Model,
  message: Message,
  muted: boolean = false,
  language: string = 'en',
  speech: SpeechOptions = {},
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      FindItClickedCell: (msg) => {
        if (model.won) return [model, []]
        const cell = model.grid.find(c => c.id === msg.id)
        if (cell && (cell.emoji === model.target || model.anyWins)) {
          return [
            { ...model, won: true, found: [...model.found, cell!.emoji], tooltipEmoji: null, wrongCount: 0, hintId: null },
            muted ? [] : [boing(SoundPlayed()), speak(emojiName(cell!.emoji, language), SoundPlayed(), { ...speech, lang: language })],
          ]
        }
        const wrongCount = model.wrongCount + 1
        const hintId = model.hintId !== null ? model.hintId : wrongCount >= 3 ? (model.grid.find(c => c.emoji === model.target)?.id ?? null) : null
        return [
          { ...model, shaking: msg.id, shakeTick: model.shakeTick + 1, wrongCount, hintId },
          [],
        ]
      },
      FindItClickedNext: () => {
        const next = generateGame([...model.found], model.anyWins, model.voiceMode, model.pairsMode, model.enabledPacks)
        const cmds: Command.Command<Message>[] = []
        if (model.voiceMode && !model.anyWins && !muted) {
          cmds.push(speak(tf('whereIs', language, emojiName(next.target, language)), SoundPlayed(), { ...speech, lang: language }))
        }
        return [{ ...next, count: model.count + 1 }, cmds]
      },
      FindItSoundPlayed: () => [model, []],
      FindItSetAnyWins: (msg) => [
        { ...model, anyWins: msg.value },
        [],
      ],
      FindItSetVoiceMode: (msg) => [
        { ...model, voiceMode: msg.value },
        [],
      ],
      FindItSetPairsMode: (msg) => [
        { ...generateGame([...model.found], model.anyWins, model.voiceMode, msg.value, model.enabledPacks), count: model.count },
        [],
      ],
      FindItSetEmojiPackEnabled: (msg) => {
        const current = normalizeEmojiPackKeys(model.enabledPacks)
        if (!msg.value && current.length === 1 && current[0] === msg.key) return [model, []]
        const nextPacks = normalizeEmojiPackKeys(msg.value
          ? [...current, msg.key]
          : current.filter(key => key !== msg.key))
        if (nextPacks.length === current.length && nextPacks.every((key, i) => key === current[i])) return [model, []]
        const next = generateGame([...model.found], model.anyWins, model.voiceMode, model.pairsMode, nextPacks)
        return [{ ...next, count: model.count }, []]
      },
      FindItReplayQuestion: () => [
        model,
        model.voiceMode && !model.anyWins && !muted
          ? [speak(tf('whereIs', language, emojiName(model.target, language)), SoundPlayed(), { ...speech, lang: language })]
          : [],
      ],
      FindItSetDragIndex: (msg) => [
        { ...model, dragIndex: msg.index },
        [],
      ],
      FindItDroppedOn: (msg) => {
        if (model.dragIndex === null || model.dragIndex === msg.index) return [model, []]
        const found = [...model.found]
        const removed = found.splice(model.dragIndex, 1)
        if (removed.length === 0) return [model, []]
        found.splice(msg.index, 0, removed[0]!)
        return [{ ...model, found, dragIndex: null }, []]
      },
      FindItDragEnded: () => [
        { ...model, dragIndex: null },
        [],
      ],
      FindItGridDragStarted: (msg) => [
        { ...model, gridDragIndex: msg.index },
        [],
      ],
      FindItGridDroppedOn: (msg) => {
        if (model.gridDragIndex === null || model.gridDragIndex === msg.index) return [model, []]
        const grid = [...model.grid]
        if (model.gridDragIndex >= grid.length || msg.index >= grid.length) return [model, []]
        const tmp = grid[model.gridDragIndex]!
        grid[model.gridDragIndex] = grid[msg.index]!
        grid[msg.index] = tmp
        return [{ ...model, grid, gridDragIndex: null }, []]
      },
      FindItGridDragEnded: () => [
        { ...model, gridDragIndex: null },
        [],
      ],
      FindItClickedCollectionEmoji: (msg) => [
        { ...model, tooltipEmoji: msg.emoji },
        muted ? [] : [speak(emojiName(msg.emoji, language), SoundPlayed(), { ...speech, lang: language })],
      ],
      FindItClickedReset: () => {
        const next = generateGame([], model.anyWins, model.voiceMode, model.pairsMode, model.enabledPacks)
        const cmds: Command.Command<Message>[] = []
        if (model.voiceMode && !model.anyWins && !muted) {
          cmds.push(speak(tf('whereIs', language, emojiName(next.target, language)), SoundPlayed(), { ...speech, lang: language }))
        }
        return [next, cmds]
      },
      FindItDismissTooltip: () => [
        { ...model, tooltipEmoji: null },
        [],
      ],
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()
  const winEmoji = model.found.length > 0 ? model.found[model.found.length - 1]! : model.target

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.div([h.Class('findit-main')], [
          model.anyWins
            ? model.voiceMode ? null : h.p([h.Class('findit-prompt')], [t('pickYourFavourite', language)])
            : model.voiceMode
              ? h.button([h.Class('replay-btn'), h.OnClick(ReplayQuestion())], [ICON_REPLAY])
              : h.p([h.Class('findit-prompt')], [tf('whereIs', language, model.target)]),
          h.div([h.Class('findit-game-area')], [
            h.div([h.Class('emoji-grid')], [
              ...model.grid.map((cell, i) => {
                const baseClass = model.pairsMode ? 'emoji-cell emoji-cell--pairs' : 'emoji-cell'
                let stateClass = ''
                if (model.shaking === cell.id) stateClass = 'shaking'
                else if (model.hintId === cell.id) stateClass = 'hint'
                const cellClass = stateClass ? `${baseClass} ${stateClass}` : baseClass
                return h.div(
                  [
                    h.Class(cellClass),
                    h.Attribute('draggable', 'true'),
                    h.OnDragStart(GridDragStarted({ index: i })),
                    h.AllowDrop(),
                    h.OnDrop(GridDroppedOn({ index: i })),
                    h.OnDragEnd(GridDragEnded()),
                    h.OnTouchStart(ClickedCell({ id: cell.id })),
                    h.Key(cell.id.toString() + (model.shaking === cell.id ? 's' + model.shakeTick : '')),
                  ],
                  [cell.emoji],
                )
              }),
            ]),
            h.p([h.Class('findit-count')], [tf('found', language, model.count)]),
          ]),
          model.won
            ? h.div([h.Class('findit-overlay'), h.Key('win-' + model.count)], [
              h.div([h.Class('findit-win')], [
                h.div([h.Class('win-emoji')], [winEmoji]),
                h.h2([h.Class('win-title')], [`${emojiName(winEmoji, language)}!`]),
                h.p([h.Class('findit-count')], [tf('found', language, model.count)]),
                h.button(
                  [h.OnClick(ClickedNext()), h.Class('btn btn-primary')],
                  [t('next', language)],
                ),
              ]),
            ])
            : null,
          h.div([h.Class('collection-box')], [
            h.p([h.Class('collection-label')], [t('collection', language)]),
            h.div([h.Class('collection-grid')], [
              ...model.found.map((e, i) =>
                h.span([h.Class('collection-emoji'), h.Key(e), h.Attribute('draggable', 'true'), h.OnDragStart(SetDragIndex({ index: i })), h.AllowDrop(), h.OnDrop(DroppedOn({ index: i })), h.OnDragEnd(DragEnded()), h.OnTouchStart(ClickedCollectionEmoji({ emoji: e }))], [e]),
              ),
            ]),
          ]),
          model.found.length > 0
            ? h.button([h.Class('btn btn-secondary'), h.OnClick(ClickedReset())], [t('reset', language)])
            : null,
          model.tooltipEmoji
            ? h.div([h.Class('tooltip-backdrop'), h.Key('backdrop'), h.OnClick(DismissTooltip())], [
              h.div([h.Class('emoji-tooltip')], [`${model.tooltipEmoji} ${emojiName(model.tooltipEmoji, language)}`]),
            ])
            : null,
        ]),
      ]),
    ],
  )
}
