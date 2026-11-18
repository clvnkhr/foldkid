# Font-independent Biáng practice

FoldKid draws **𰻝 (U+30EDD)**, the simplified character in *biángbiáng miàn*, with inline vectors. Its tracing board uses ordered component centerlines; its small choice-button and header glyph use a separately licensed filled outline for clarity. Neither requires a font, image-file download, canvas bitmap, or external character service. See [BiangGlyph.SOURCES.md](BiangGlyph.SOURCES.md) for the display outline's attribution and CC BY-SA 4.0 license.

## Chosen form and stroke order

There are several regional forms and stroke counts. This guide uses the **common 42-stroke simplified form**, retaining the seven-stroke **言**, simplifying **長 → 长** and **馬 → 马**, and finishing with the mainland three-stroke **辶**. The simplified Unicode identity is confirmed by [Wikipedia's Biangbiang noodles article](https://en.wikipedia.org/wiki/Biangbiang_noodles). The [Chinese-language article's character table](https://zh.wikipedia.org/wiki/Biangbiang%E9%9D%A2#%E5%AD%97%E5%9E%8B%E4%B8%8E%E6%AD%8C%E8%B0%A3) describes the 42-stroke form and explicitly notes that **言 does not become 讠** here.

The common mnemonic order documented by the article and the [Commons stroke-order discussion](https://commons.wikimedia.org/wiki/File_talk:Bi%C3%A1ng-order.gif) is used:

| Component | Strokes | Guide stroke numbers |
| --- | ---: | --- |
| 穴 (宀 and 八) | 5 | 1–5 |
| 言 | 7 | 6–12 |
| 幺, left | 3 | 13–15 |
| 幺, right | 3 | 16–18 |
| 长, left | 4 | 19–22 |
| 长, right | 4 | 23–26 |
| 马 | 3 | 27–29 |
| 心 | 4 | 30–33 |
| 月 | 4 | 34–37 |
| 刂 | 2 | 38–39 |
| 辶 | 3 | 40–42 |

Unicode 17 Unihan lists a 43-stroke count for U+30EDD (`kRSUnicode 162.39`), corresponding to counting the surrounding 辶 with four strokes. FoldKid intentionally teaches the documented 42-stroke variant, so its stroke-count category follows the **actual 42-stroke guide**, rather than substituting the different count. This guide is not a claim that all regional forms share one standardized order.

## Vector construction and license

The nine component median datasets are copied without reordering or coordinate changes from **Hanzi Writer Data 2.0.1**, the same pinned package as the main catalogue. Their direction and internal stroke order are retained. The original source medians, serialized in the component order `穴言幺长马心月刂辶` as compact UTF-8 JSON, have SHA-256:

`c240022c63ef755281a3e46b2c01c89d69713e5c00d3da29306b27b33b6a5fa3`

The component geometry is copyright (C) 1999 Arphic Technology Co., Ltd., distributed under the included [Arphic Public License](ARPHICPL.TXT). See [SOURCES.md](SOURCES.md) for the exact package URL, version, commit and archive checksum.

FoldKid's 2026-11-18 adaptation independently positions and scales those component centerlines into a 160-unit compound character, preserving the original writing direction and internal component order. Each surrounding 辶 stroke is fitted separately so its dot/turn occupy the left margin and its final sweep sits under the full character. Segments are sampled at gaps of at most 1.5 board units. The complete local result is in `src/games/chineseHandwritingBiang.ts` and remains available under the Arphic Public License. Display smoothing is applied afterward; it does not change recognition points or their order.

The top 穴 preserves its first three roof strokes, then fits its two 八 strokes into a narrower central region. This keeps the right 八 leg inside the separate 刂 column, rather than extending a standalone 穴's wide leg across that outside component. The bottom 心 and the final 辶 sweep also have separate vertical bands with clear stroke-edge spacing.

The layout was visually checked against [Commons' simplified Biang vector](https://commons.wikimedia.org/wiki/File:Biang_(%E7%AE%80%E4%BD%93).svg), by LiliCharlie and Cangjie6, and the [traditional stroke-order reference](https://commons.wikimedia.org/wiki/File:Bi%C3%A1ng-order.gif). They inform the common character's structure and mnemonic order. The simplified filled outline is embedded only in the choice button and header, with its separate [attribution and license](BiangGlyph.SOURCES.md). No outline coordinates, raster frames or font glyphs are copied into the tracing guide, which retains its independently composed Arphic-licensed centerlines.
