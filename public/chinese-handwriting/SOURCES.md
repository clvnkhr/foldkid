# FoldKid Chinese handwriting data

Stroke geometry copyright (C) 1999 Arphic Technology Co., Ltd. Extracted by Make Me a Hanzi and distributed by Hanzi Writer Data. The original Arphic Public License is included, unchanged, in [ARPHICPL.TXT](ARPHICPL.TXT). These adapted data remain freely available under that license; no warranty is provided. The app code is a separate work.

## Sources

- [Hanzi Writer Data](https://github.com/chanind/hanzi-writer-data), npm **2.0.1**, git commit `ad1a9905cada18d07630acc27d438b070d753ec0`. The directed `medians` arrays are stored in stroke-writing order. Upstream derives these from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi), based on the Arphic PL KaitiM GB and Big5 fonts.
- Exact download: https://registry.npmjs.org/hanzi-writer-data/-/hanzi-writer-data-2.0.1.tgz
- SHA-256: `72baf3d82b114e60d6e40ea05f24d2262a05cd39d544e2f322ba2fceb7beff15`.
- [Unicode Unihan 17.0.0](https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip), SHA-256 `f7a48b2b545acfaa77b2d607ae28747404ce02baefee16396c5d2d7a8ef34b5e`. `kTGH` identifies the 2013 mainland standard common-character table, `kTotalStrokes` selects additional simple entries, and `kMandarin` supplies pinyin. Unicode metadata is distributed under [Unicode License V3](UNICODE-LICENSE.txt).
- [Unicode property documentation](https://www.unicode.org/reports/tr38/): first-level `kTGH` indices 1–3500 contain the more frequently used common characters. This is a coverage list ordered by stroke count, **not** a frequency ranking or a toddler curriculum.
- [Unicode 17.0.0 CJKRadicals.txt](https://www.unicode.org/Public/17.0.0/ucd/CJKRadicals.txt), SHA-256 `826f83be25cd18fb8a5015a514704504e1982e840ea14d058bf583e1cc620c83`. This maps the radical numbers and simplified-form markers in Unihan's `kRSUnicode` property to their unified ideographs. These metadata use the same included Unicode License V3.

## Selection and changes — 2026-11-18

`src/games/chineseHandwritingCatalogue.json` contains **3,673 single characters**: all **3,500 first-level common simplified Chinese characters**, plus every additional standard-table character of at most six strokes for which Hanzi Writer 2.0.1 supplies data. There are **771 characters with at most six strokes** in the resulting catalogue. Shared simplified/traditional forms are retained; traditional-only alternatives are not added as a second deck.

Each tuple is `[character, pinyin, tableIndex, strokeCount, encodedMedians]`. The medians use lossless base64-encoded delta varints, decoded only for a visited character. This reduces the entire catalogue from 2.15 MB to 880 KB (about 620 KB gzip) without changing any coordinates; it also avoids parsing thousands of nested point arrays at startup. All original median points, stroke order and point direction are unchanged. Stroke outlines and radical metadata are omitted, and per-character files are combined. Familiar everyday characters are placed first by `chineseHandwritingData.ts`; the remainder keep table order. Its renderer maps the original 1024-unit coordinates to a 160-unit board with padding and samples straight median segments at gaps of at most 2.5 units. It never sorts/reverses/merges strokes. The JSON `medianSha256` field fingerprints every original stroke count, point count and IEEE-754 coordinate in table order; tests independently compare the decoded geometry against this pinned source fingerprint, including original fractional coordinates. Geometry is resolved locally, with no runtime CDN requests.

Twenty-seven rare simple characters in table levels two/three are absent from upstream and therefore omitted rather than supplied with invented strokes: **伈 伋 伣 冮 匜 厾 圢 圫 圲 孖 屼 扞 朳 朸 汈 汋 癿 芃 讱 讻 辿 𠙶 𨙸 𬇕 𬘓 𬣙 𬣞**. None of the first-level 3,500 are missing. “All simple characters” here means this documented available standard-table coverage; it does not include every rare historical Chinese graph.

## Rebuild

Download the two exact source archives above, then run:

```sh
python3 scripts/import-chinese-handwriting.py /path/hanzi-writer-data-2.0.1.tgz /path/Unihan-17.0.0.zip /path/CJKRadicals-17.0.0.txt
```

The importer verifies all three source checksums and first-level completeness before writing the catalogue, dictionary-radical metadata, and original Arphic license. The generated JSON files include their modification/copyright notices. The optional third input can be omitted when rebuilding only the stroke catalogue. No dependency installation is needed.

## Categories and overlapping membership

The 21 everyday themes, 208 dictionary-radical families, and 24 stroke-count categories are independent ways to find a character. Each category is split into groups of at most 20 characters. All stroke-count categories include **every** bundled character with that actual guide stroke count, including characters that also appear in everyday themes. All dictionary-radical families likewise include all matching characters, including themed characters. No character is available only through a stroke-count category.

`src/games/chineseHandwritingRadicals.json` is a 52 KB selection of the official Unicode metadata (about 16 KB gzip), with a `[character, radicalNumbers]` list for all 3,673 characters and the corresponding radical glyph labels. All `kRSUnicode`-listed radical classifications are retained, with simplified/traditional forms of the same numbered radical merged into one family. A family label can therefore contain both forms, such as **糸 / 纟**. Multiple listed radical classifications deliberately give a character more than one family.

These are dictionary radical classifications, as defined in [UAX #38 for Unicode 17](https://www.unicode.org/reports/tr38/tr38-39.html#kRSUnicode), rather than an exhaustive search for every visible component in a character. For example, 休 is indexed under 人; the visible 木 does not make it a 木 dictionary-radical entry. Context-free selection prefers an everyday theme, then the first-listed Unicode radical. Selecting a character within a chosen stroke-count or radical category keeps that category selected.

The metadata's `classificationSha256` fingerprints its complete ordered `[character, radicalNumbers]` list as compact UTF-8 JSON. Tests independently pin that source fingerprint, check every category membership against the metadata, and verify complete stroke-count coverage. The source archives and all original stroke medians remain unchanged.

## Lossless median encoding

Base64 decodes to a byte stream. For each stroke, an unsigned base-128 little-endian varint gives its point count. Coordinates follow in `[x, y]` order; previous x and y both start at zero for each stroke. A positive varint stores `zigzag(coordinate - previous) + 1`. A zero varint is followed by the absolute coordinate as little-endian float64, preserving the few fractional source coordinates exactly. The previous value is updated after each coordinate. Source stroke count is in the tuple; no quantization, smoothing or stroke reordering is applied by this encoding. The independent `medianSha256` uses, per character, uint32le stroke count; then per stroke, uint32le point count and float64le x/y coordinates in original sequence.
