import { Match as M, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { boing } from '../audio'
import { speak } from '../speech'
import { t, tf } from '../i18n'

const EMOJIS = [
  ['🎈', 'Balloon'], ['🎉', 'Party Popper'], ['🎊', 'Confetti'], ['🎁', 'Gift'],
  ['🧸', 'Teddy Bear'], ['🍭', 'Lollipop'], ['🍬', 'Candy'], ['🎂', 'Birthday Cake'],
  ['🌈', 'Rainbow'], ['🌸', 'Cherry Blossom'], ['⭐', 'Star'], ['🍕', 'Pizza'],
  ['🍔', 'Burger'], ['🌮', 'Taco'], ['🍩', 'Donut'], ['🧁', 'Cupcake'],
  ['0️⃣', 'Zero'], ['1️⃣', 'One'], ['2️⃣', 'Two'], ['3️⃣', 'Three'], ['4️⃣', 'Four'],
  ['5️⃣', 'Five'], ['6️⃣', 'Six'], ['7️⃣', 'Seven'], ['8️⃣', 'Eight'], ['9️⃣', 'Nine'],
  ['🐱', 'Cat'], ['🐶', 'Dog'], ['🐰', 'Rabbit'], ['🦋', 'Butterfly'], ['🦄', 'Unicorn'],
  ['🐻', 'Bear'], ['🐼', 'Panda'], ['🐨', 'Koala'], ['🦁', 'Lion'], ['🐯', 'Tiger'],
  ['🐸', 'Frog'], ['🐵', 'Monkey'], ['🦊', 'Fox'], ['🐴', 'Horse'], ['🦝', 'Raccoon'],
  ['🐮', 'Cow'], ['🐷', 'Pig'], ['🐙', 'Octopus'], ['🐧', 'Penguin'], ['🐦', 'Bird'],
  ['🦅', 'Eagle'], ['🦉', 'Owl'], ['🐥', 'Chick'], ['🦆', 'Duck'],
  ['🐢', 'Turtle'], ['🐍', 'Snake'], ['🦎', 'Lizard'], ['🐊', 'Crocodile'],
  ['🐳', 'Whale'], ['🐬', 'Dolphin'], ['🦈', 'Shark'], ['🐠', 'Fish'], ['🐡', 'Blowfish'],
  ['🐝', 'Bee'], ['🐞', 'Ladybug'], ['🦗', 'Cricket'], ['🐜', 'Ant'],
] as const

const EMOJI_POOL: string[] = EMOJIS.map(([emoji]) => emoji)

const EMOJI_NAMES: Record<string, string> = Object.fromEntries(EMOJIS)

const EMOJI_NAMES_BY_LANG: Record<string, string[]> = {
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

export const Model = S.Struct({ grid: S.Array(EmojiCell), target: S.String, count: S.Number, shaking: S.Number, shakeTick: S.Number, won: S.Boolean, found: S.Array(S.String), anyWins: S.Boolean, voiceMode: S.Boolean, pairsMode: S.Boolean, tooltipEmoji: S.Union([S.String, S.Null]), wrongCount: S.Number, hintId: S.Union([S.Number, S.Null]), dragIndex: S.Union([S.Number, S.Null]) })
export type Model = typeof Model.Type

export const ClickedCell = m('PeekabooClickedCell', { id: S.Number })
export const ClickedNext = m('PeekabooClickedNext')
export const SetAnyWins = m('PeekabooSetAnyWins', { value: S.Boolean })
export const SetVoiceMode = m('PeekabooSetVoiceMode', { value: S.Boolean })
export const SetPairsMode = m('PeekabooSetPairsMode', { value: S.Boolean })
export const ReplayQuestion = m('PeekabooReplayQuestion')
export const ClickedCollectionEmoji = m('PeekabooClickedCollectionEmoji', { emoji: S.String })
export const ClickedReset = m('PeekabooClickedReset')
export const DismissTooltip = m('PeekabooDismissTooltip')
export const SoundPlayed = m('PeekabooSoundPlayed')
export const SetDragIndex = m('PeekabooSetDragIndex', { index: S.Number })
export const DroppedOn = m('PeekabooDroppedOn', { index: S.Number })
export const DragEnded = m('PeekabooDragEnded')

export const Message = S.Union([ClickedCell, ClickedNext, SetAnyWins, SetVoiceMode, SetPairsMode, ReplayQuestion, ClickedCollectionEmoji, ClickedReset, DismissTooltip, SoundPlayed, SetDragIndex, DroppedOn, DragEnded])
export type Message = typeof Message.Type

const shuffle = <T>(arr: readonly T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

const generatePairsGame = (found?: string[], anyWins: boolean = false, voiceMode: boolean = false): Model => {
  const pool = shuffle(EMOJI_POOL)
  const emojiA = pool[0]!
  const emojiB = pool[1]!
  const target = emojiA + emojiB

  const cellPairs: string[] = [target]
  if (emojiA !== emojiB) {
    cellPairs.push(emojiB + emojiA)
  }

  while (cellPairs.length < 9) {
    const a = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)]!
    const b = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)]!
    const p = a + b
    if (!cellPairs.includes(p)) {
      cellPairs.push(p)
    }
  }

  const grid = shuffle(cellPairs).map((emoji, i) => ({ id: i, emoji }))
  return { grid, target, count: 0, shaking: -1, shakeTick: 0, won: false, found: found ?? [], anyWins, voiceMode, pairsMode: true, tooltipEmoji: null, wrongCount: 0, hintId: null, dragIndex: null }
}

const generateGame = (found?: string[], anyWins: boolean = false, voiceMode: boolean = false, pairsMode: boolean = false): Model => {
  if (pairsMode) return generatePairsGame(found, anyWins, voiceMode)
  const shuffled = shuffle(EMOJI_POOL).slice(0, 9)
  const grid = shuffled.map((emoji, i) => ({ id: i, emoji }))
  const target = grid[Math.floor(Math.random() * grid.length)]!.emoji
  return { grid, target, count: 0, shaking: -1, shakeTick: 0, won: false, found: found ?? [], anyWins, voiceMode, pairsMode: false, tooltipEmoji: null, wrongCount: 0, hintId: null, dragIndex: null }
}

export const init = (pairsMode: boolean = false): Model => generateGame([], false, false, pairsMode)

export const update = (
  model: Model,
  message: Message,
  muted: boolean = false,
  language: string = 'en',
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      PeekabooClickedCell: (msg) => {
        if (model.won) return [model, []]
        const cell = model.grid.find(c => c.id === msg.id)
        if (cell && (cell.emoji === model.target || model.anyWins)) {
          return [
            { ...model, won: true, found: [...model.found, cell!.emoji], tooltipEmoji: null, wrongCount: 0, hintId: null },
            muted ? [] : [boing(SoundPlayed()), speak(emojiName(cell!.emoji, language), SoundPlayed(), { lang: language })],
          ]
        }
        const wrongCount = model.wrongCount + 1
        const hintId = model.hintId !== null ? model.hintId : wrongCount >= 3 ? (model.grid.find(c => c.emoji === model.target)?.id ?? null) : null
        return [
          { ...model, shaking: msg.id, shakeTick: model.shakeTick + 1, wrongCount, hintId },
          [],
        ]
      },
      PeekabooClickedNext: () => {
        const next = generateGame([...model.found], model.anyWins, model.voiceMode, model.pairsMode)
        const cmds: Command.Command<Message>[] = []
        if (model.voiceMode && !model.anyWins && !muted) {
          cmds.push(speak(tf('whereIs', language, emojiName(next.target, language)), SoundPlayed(), { lang: language }))
        }
        return [{ ...next, count: model.count + 1 }, cmds]
      },
      PeekabooSoundPlayed: () => [model, []],
      PeekabooSetAnyWins: (msg) => [
        { ...model, anyWins: msg.value },
        [],
      ],
      PeekabooSetVoiceMode: (msg) => [
        { ...model, voiceMode: msg.value },
        [],
      ],
      PeekabooSetPairsMode: (msg) => [
        generateGame([...model.found], model.anyWins, model.voiceMode, msg.value),
        [],
      ],
      PeekabooReplayQuestion: () => [
        model,
        model.voiceMode && !model.anyWins && !muted
          ? [speak(tf('whereIs', language, emojiName(model.target, language)), SoundPlayed(), { lang: language })]
          : [],
      ],
      PeekabooSetDragIndex: (msg) => [
        { ...model, dragIndex: msg.index },
        [],
      ],
      PeekabooDroppedOn: (msg) => {
        if (model.dragIndex === null || model.dragIndex === msg.index) return [model, []]
        const found = [...model.found]
        const removed = found.splice(model.dragIndex, 1)
        if (removed.length === 0) return [model, []]
        found.splice(msg.index, 0, removed[0]!)
        return [{ ...model, found, dragIndex: null }, []]
      },
      PeekabooDragEnded: () => [
        { ...model, dragIndex: null },
        [],
      ],
      PeekabooClickedCollectionEmoji: (msg) => [
        { ...model, tooltipEmoji: msg.emoji },
        muted ? [] : [speak(emojiName(msg.emoji, language), SoundPlayed(), { lang: language })],
      ],
      PeekabooClickedReset: () => {
        const next = generateGame([], model.anyWins, model.voiceMode, model.pairsMode)
        const cmds: Command.Command<Message>[] = []
        if (model.voiceMode && !model.anyWins && !muted) {
          cmds.push(speak(tf('whereIs', language, emojiName(next.target, language)), SoundPlayed(), { lang: language }))
        }
        return [next, cmds]
      },
      PeekabooDismissTooltip: () => [
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
        h.div([h.Class('peekaboo-main')], [
          model.anyWins
            ? model.voiceMode ? null : h.p([h.Class('peekaboo-prompt')], [t('pickYourFavourite', language)])
            : model.voiceMode
              ? h.button([h.Class('replay-btn'), h.OnClick(ReplayQuestion())], [ICON_REPLAY])
              : h.p([h.Class('peekaboo-prompt')], [tf('whereIs', language, model.target)]),
          h.div([h.Class('peekaboo-game-area')], [
            h.div([h.Class('emoji-grid')], [
              ...model.grid.map((cell) => {
                const baseClass = model.pairsMode ? 'emoji-cell emoji-cell--pairs' : 'emoji-cell'
                let stateClass = ''
                if (model.shaking === cell.id) stateClass = 'shaking'
                else if (model.hintId === cell.id) stateClass = 'hint'
                const cellClass = stateClass ? `${baseClass} ${stateClass}` : baseClass
                return h.div(
                  [
                    h.Class(cellClass),
                    h.OnClick(ClickedCell({ id: cell.id })),
                    h.Key(cell.id.toString() + (model.shaking === cell.id ? 's' + model.shakeTick : '')),
                  ],
                  [cell.emoji],
                )
              }),
            ]),
            h.p([h.Class('peekaboo-count')], [tf('found', language, model.count)]),
          ]),
          model.won
            ? h.div([h.Class('peekaboo-overlay'), h.Key('win-' + model.count)], [
              h.div([h.Class('peekaboo-win')], [
                h.div([h.Class('win-emoji')], [winEmoji]),
                h.h2([h.Class('win-title')], [`${emojiName(winEmoji, language)}!`]),
                h.p([h.Class('peekaboo-count')], [tf('found', language, model.count)]),
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
                h.span([h.Class('collection-emoji'), h.Key(e), h.Attribute('draggable', 'true'), h.OnDragStart(SetDragIndex({ index: i })), h.AllowDrop(), h.OnDrop(DroppedOn({ index: i })), h.OnDragEnd(DragEnded()), h.OnClick(ClickedCollectionEmoji({ emoji: e }))], [e]),
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
