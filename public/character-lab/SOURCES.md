# Character Lab composition data

The local `src/games/characterLabCatalogue.json` is a comprehensive, editable composition catalogue generated from [Make Me a Hanzi's dictionary](https://github.com/skishore/makemeahanzi/blob/bddc96d41bef78427ed0e034e9f7e31d71fd1b92/dictionary.txt), commit `bddc96d41bef78427ed0e034e9f7e31d71fd1b92`. It includes simplified and traditional characters, their genuine components, and every fully specified source decomposition.

The exact upstream `dictionary.txt` SHA-256 is `744bb05d5b0742e9ee35c37791f94d56a173349b3367569e7ca11e510364d203`. The binary recipe-row SHA-256 is `d9a240c48725860c9dcbb1af7c175227561eed6d098f51a2f60627657cb4c2f8`; the additional decomposition-row SHA-256 is `3fe9edfb20169a3030108a3c17281ff2836727592e5c8203d7f247f9add9b1a2` (compact UTF-8 JSON, without a trailing newline). The original first 300 recipe rows retain their previous SHA-256, `40468f52657baf8ec920790ce84cc743fff7844c1d7b03222dde07f4383f0d81`.

Upstream derives the dictionary from Unihan and CJKlib and licenses it under LGPL version 3 or later. Its unmodified [COPYING notice](COPYING.txt), [LGPL text](LGPL-3.0.txt), and the referenced [GPL text](GPL-3.0.txt) are included. The data subset keeps the original decomposition strings. The application logic is a separate work.

## Selection and modifications — 2026-11-18

The pinned source contains 9,574 character records, of which 9,125 have completely specified IDS descriptions. The generated catalogue contains 8,517 two-piece recipes, 556 additional decompositions, and 376 atomic components: 9,449 distinct characters/components before the application's explicit radical-form aliases. Every completely specified source character is represented. Source stroke data and fonts are not part of this catalogue.

An exact binary IDS root supplies two merge ingredients. When an immediate subtree is itself a real source character, that character is used as the part: for example, the original `森 ⿱木⿰木木` becomes 木 + 林, because 林's original IDS is exactly `⿰木木`. The original 300 recipes stay first for stable catalogue ordering. Every other reliable binary recipe is included. There are 112 alternate results across 106 unordered raw-component pairs, before combining-form equivalences are applied.

One independently authored structural supplement, 吅 = `⿰口口`, fills a useful omission in Make Me a Hanzi. Its glyph is checked against Unicode's [version 16.0 CJK code chart, U+5405](https://www.unicode.org/charts/PDF/Unicode-16.0/U160-4E00.pdf), and its structure against the [CJKVI IDS U+5405 record](https://github.com/cjkvi/cjkvi-ids/blob/master/ids.txt). No CJKVI dataset, font, or chart image is bundled. The exact short supplement and its reference URLs are recorded separately in `supplementalRecipes` and `supplementalSources`, so source verification does not pretend it was in the original dictionary.

Ternary structures and anonymous subtrees are retained as additional decompositions. Each anonymous subtree is expanded only until a genuine character/component in the pinned dictionary is reached; it is never given a made-up glyph. For example, 学 has ⺍ + 冖 + 子, 爱 has 爫 + 冖 + 友, 画 has 一 + 凵 + 田, and 哭 has 口 + 口 + 犬. Their original IDS strings preserve the complete positional structure. These characters can be dropped, split, and constructed from a simultaneous group of matching pieces, without requiring a fictional intermediate character. 品, 晶, 淼, 焱, and 鑫 have three direct matching components.

No `？` unknown subtree is guessed. Real leaf characters whose own source description is incomplete remain usable components, without invented inner parts. Original base radicals deliberately remain atomic even if the source describes their strokes. Four unary glyph descriptions (丁→一, 乡→幺, 孓→子, 由→田) are kept as their actual characters, not treated as character substitutions. `baseDecompositions` retains original source IDS records for inspecting atomic stopping points and verifying named-subtree resolution.

Every recipe is a graphical structure, **not an etymological claim** about how a character's meaning originated. The original IDS strings remain unchanged in the catalogue. Collision order is immaterial. The game collects every distinct valid result for the actual ingredients after radical-form equivalence and chooses uniformly among them. Thus two 口 pieces can become 吕, 回, or 吅, while 木 + 一 can become 本, 未, 末, or 朱. Duplicate source descriptions or raw/canonical spellings do not give a result extra weight. This also applies to groups of three or more pieces when several characters share their component multiset. If no literal recipe matches a group of already-joined pieces, the game may regroup their verified atomic components against an existing source decomposition. This lets 吕/回/吅 + 口 become 品 after an earlier mouth pair joined, without inventing a new character or replacing a literal candidate pool.

The explicit atomic set stops decompositions at useful base radicals/components. All 347 canonical atomic pieces and the supported dictionary radicals are available in the top combiner palette, for 413 unique tiles. The dictionary-radical membership comes from the existing bundled Unicode metadata in `src/games/chineseHandwritingRadicals.json`; this also includes useful decomposable combiners such as 疒, 广, 巾, 亠, 穴, and 酉. The original 16 familiar buttons stay first; the remaining buttons are ordered by actual source ingredient frequency, then Unicode codepoint. The lower paginated catalogue excludes every top-list tile, so no loose character is duplicated across the two palettes. The standalone atomic character 孓 remains available even though no current recipe consumes it. Being on either list does not make a compound atomic. The generated graph is acyclic and has at most 16 atomic leaves per character; the game's material limit remains 60 pieces. A tap recursively separates a compound into its atomic ingredients, and merged pieces retain the actual ingredients used by the player so a pop conserves material.

## Standalone radical forms — 2026-11-18

Loose pieces use the full form of positional or simplified radicals. The original mapping is 亻→人, 忄→心, 扌→手, 氵→水, 灬→火, 讠→言, 钅→金, 犭→犬, 礻→示, 纟→糸, 饣→食, 刂/⺈→刀, 爫→爪, 艹→艸, and 辶→辵. Expanded source forms include 糹→糸, 釒→金, 飠→食, ⺮→竹, ⺗/㣺→心, ⺌/⺍→小, 氺→水, 衤→衣, ⺼→肉, ⺧/牜→牛, ⺶/⺷→羊, 耂→老, 肀→聿, and 𧾷→足. The relationships are recorded by radical number in Unicode's [CJK Radicals Supplement](https://unicode.org/Public/18.0.0/charts/nameslist/2e80/) and [Kangxi Radicals](https://unicode.org/Public/18.0.0/charts/nameslist/2f00/) annotations; the [IRG H-source IDS proposal](https://unicode.org/irg/docs/n2438-HSourceIDS.pdf), [Unicode character review](https://www.unicode.org/L2/L2020/20239-pubrev.html), and [Academia Sinica character database](https://chardb.iis.sinica.edu.tw/char/U%2B7CF9) provide supporting records for specific positional forms. This is a display/game equivalence, not Unicode normalization. 艹 is paired with 艸 rather than the separate compound 草; 纟 is paired with 糸 rather than 丝. Ordinary 月/肉, 王/玉, and 阝 are not globally substituted.

For this game, 囗 is also displayed and matched as 口 so the two visually similar mouth/enclosure tiles do not unexpectedly refuse to join. This is an explicit gameplay equivalence; it does not claim that the enclosure radical 囗 and mouth radical 口 are linguistically identical.

Full-form ingredients allow 人+木→休, 水+青→清, 心+白→怕, and 手+白→拍, among other valid alternatives. Expanded forms intentionally expose further ambiguity: 人+门 can form 们 or 闪, 人+言 can form 信 or 认, and 水+白 can form 泊 or 泉. These alternatives participate equally in game selection rather than guessing which positional arrangement a collision intended.

All compositions are bundled locally. There are no runtime dictionary/CDN requests, image assets, fonts, or tracking in these data. Every emitted character/component belongs to the declared catalogue.

To regenerate the entire catalogue reproducibly from a downloaded copy of the exact upstream file, run:

```sh
python3 scripts/import-character-lab.py /path/to/dictionary.txt
```

To verify the source checksum, all original IDS entries, component resolution, complete coverage, counts, and ordering without changing any file, run either:

```sh
python3 public/character-lab/verify-source.py /path/to/dictionary.txt
python3 scripts/import-character-lab.py /path/to/dictionary.txt --check
```

## Piece colors

FNV-1a over Unicode codepoints determines each character's hue and small saturation/lightness variations. Combining forms first resolve to their standalone radical, so 忄 and 心 share colors. The same character has the same colors across sessions and separate pieces. The light and dark variants use hex colors with tested WCAG contrast ratios of at least 7:1 for the character text and 3:1 for the border against the piece background.
