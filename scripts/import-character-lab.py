#!/usr/bin/env python3
"""Rebuild Character Lab's local composition data from the pinned dictionary.

Usage: python3 scripts/import-character-lab.py /path/to/dictionary.txt [--check]
No network access, image assets, third-party modules, or build-time downloads.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
COMMIT = 'bddc96d41bef78427ed0e034e9f7e31d71fd1b92'
SOURCE_SHA = '744bb05d5b0742e9ee35c37791f94d56a173349b3367569e7ca11e510364d203'
OPERATORS = {'⿰': 2, '⿱': 2, '⿴': 2, '⿵': 2, '⿶': 2, '⿷': 2,
             '⿸': 2, '⿹': 2, '⿺': 2, '⿻': 2, '⿲': 3, '⿳': 3}

# Preserve the original game's useful stopping points and collision priorities.
# A source's stroke-level description does not make a base radical non-atomic.
ATOMIC = ('一丨丶丿十人亻儿女子口囗日月木火灬水氵土士心忄手扌言讠艹宀冖门马石田力目立寸又也大小白王玉山足耳车虫贝钅雨辶禾米衣鸟牛羊犬犭礻厂纟欠⺈刂豕饣弓戈刀匕丷龶夂几殳斤爫冂工羽矢皿方鱼彐'
          '金示糸食爪艸辵竹肉老聿糹釒飠⺮⺗⺌⺍氺衤⺼耂肀')
LEGACY_ORDER = ('明林休好从朋二早旦百本如李字安宝男尖尘果妈吗码他她们地问间闪雷针闷池柏村闯加劝和秋咪时旺双对汉叹孙季思怕拍伙伯仙付什计认讨权灶烛眯相蚂干丈天支曰仅卉古夯灭且生仔汁奴圣寺扣夺吐吕汝守驮驰玛芯杜杏呈里佃闰闲灿汪沐沁宋灾拓苗枉奋岩委卑炎泪泊茧泵冒虽钥香皇泉闽类籽娄浊森众三音章吉家看采想青清情晴请尔你树草化花国困雪霜务雾鸡鸣猫中钟红江主住枝闻坐体伏咖架驾功助利则知种少秒央秧称程羔糕粒粗咕昌唱暗星欢取姐姓妇妙姑夷姨怒兄兑悦原愿忠意愁拉找捉按旨指军挥担抄投扫斥拆折件半伴位仿但伐信仁依仑论午许说诗课千舌话谈设访诉平评反饭饮狸独孟猛猜翅翔鲜美养丑羞样洋详祥楼板棵凡同桐比昆棍柱炒因烟兰烂元玩见现理睛竟镜铜连链虹')
LEGACY_RANK = {character: index for index, character in enumerate(LEGACY_ORDER)}
# Independently written structural fact absent from the pinned dictionary,
# checked against Unicode's U+5405 glyph and CJKVI's U+5405 IDS record.
SUPPLEMENTAL_RECIPES = [['吅', '⿰口口', ['口', '口']]]
SUPPLEMENTAL_SOURCES = [['吅', 'https://www.unicode.org/charts/PDF/Unicode-16.0/U160-4E00.pdf',
                         'https://github.com/cjkvi/cjkvi-ids/blob/master/ids.txt']]


def parse(ids):
    characters = iter(ids)

    def consume():
        character = next(characters)
        arity = OPERATORS.get(character)
        return (character, tuple(consume() for _ in range(arity))) if arity else character

    result = consume()
    if next(characters, None) is not None:
        raise ValueError('Trailing IDS text')
    return result


def serialize(node):
    return node if isinstance(node, str) else node[0] + ''.join(map(serialize, node[1]))


def is_han(character):
    return len(character) == 1 and unicodedata.name(character, '').startswith(
        ('CJK UNIFIED IDEOGRAPH', 'CJK COMPATIBILITY IDEOGRAPH', 'CJK RADICAL', 'KANGXI RADICAL'))


def build(source):
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA:
        raise ValueError('Unexpected dictionary source; use the pinned commit in SOURCES.md')
    rows = {entry['character']: entry for entry in map(json.loads, source.decode('utf-8').splitlines())}
    parsed = {}
    for character, row in rows.items():
        ids = row.get('decomposition', '')
        if not is_han(character) or not ids or '？' in ids:
            continue
        try:
            parsed[character] = parse(ids)
        except (StopIteration, ValueError):
            continue

    by_ids = {}
    for character, tree in parsed.items():
        by_ids.setdefault(serialize(tree), []).append(character)
    for matches in by_ids.values():
        matches.sort(key=lambda character: (LEGACY_RANK.get(character, 100000), ord(character)))

    def components(node, parent):
        if isinstance(node, str):
            if not is_han(node):
                raise ValueError(f'Unsupported component {node!r}')
            return [node]
        matches = [character for character in by_ids.get(serialize(node), []) if character != parent]
        if matches:
            return [matches[0]]
        # Anonymous structures are never invented as characters. Descend to
        # the nearest genuine character/components, retaining their IDS order.
        return [part for child in node[1] for part in components(child, parent)]

    forced_bases = set(ATOMIC)
    binary = {}
    additional = {}
    for character, tree in parsed.items():
        if character in forced_bases or isinstance(tree, str):
            continue
        child_parts = [components(child, character) for child in tree[1]]
        parts = [part for children in child_parts for part in children]
        if character in parts or len(parts) < 2:
            raise ValueError(f'Self-referencing or incomplete decomposition for {character}')
        record = [character, rows[character]['decomposition'], parts]
        if len(child_parts) == 2 and all(len(children) == 1 for children in child_parts):
            binary[character] = record
        else:
            additional[character] = record

    order = lambda character: (LEGACY_RANK.get(character, 100000), ord(character))
    recipes = [binary[character] for character in sorted(binary, key=order)] + SUPPLEMENTAL_RECIPES
    decompositions = [additional[character] for character in sorted(additional, key=ord)]
    compounds = {record[0]: record[2] for record in recipes + decompositions}
    bases = forced_bases | ({part for parts in compounds.values() for part in parts} - compounds.keys())
    # Source unary descriptions denote a changed glyph, not a substitution
    # operation (e.g. 由 has description 田); keep its actual character intact.
    bases.update(character for character, tree in parsed.items() if isinstance(tree, str))
    if bases & compounds.keys():
        raise ValueError('A character cannot be both atomic and composite')
    base_order = {character: index for index, character in enumerate(ATOMIC)}
    ordered_bases = sorted(bases, key=lambda character: (base_order.get(character, 100000), ord(character)))
    nodes = bases | compounds.keys()
    if not all(is_han(character) for character in nodes):
        raise ValueError('Non-Han output in catalogue')
    if parsed.keys() - nodes:
        raise ValueError('A fully specified source character was omitted')
    legacy = json.dumps(recipes[:len(LEGACY_ORDER)], ensure_ascii=False, separators=(',', ':')).encode()
    if hashlib.sha256(legacy).hexdigest() != '40468f52657baf8ec920790ce84cc743fff7844c1d7b03222dde07f4383f0d81':
        raise ValueError('Original collision priorities or component choices changed')

    cache = {}

    def leaves(character, trail=()):
        if character in bases:
            return [character]
        if character in trail:
            raise ValueError(f'Composition cycle at {character}')
        if character not in cache:
            cache[character] = [leaf for part in compounds[character]
                                for leaf in leaves(part, trail + (character,))]
        return cache[character]

    maximum_parts = max(len(leaves(character)) for character in nodes)
    if maximum_parts > 60:
        raise ValueError(f'Composition exceeds the physics material capacity: {maximum_parts}')
    pair_counts = Counter(''.join(sorted(parts)) for _, _, parts in recipes)
    return {
        'sourceCommit': COMMIT,
        'sourceSha256': SOURCE_SHA,
        'license': 'LGPL-3.0-or-later',
        'bases': ordered_bases,
        'recipes': recipes,
        'decompositions': decompositions,
        'supplementalRecipes': SUPPLEMENTAL_RECIPES,
        'supplementalSources': SUPPLEMENTAL_SOURCES,
        'baseDecompositions': [[character, rows[character]['decomposition']]
                               for character in ordered_bases if character in rows],
        'coverage': {
            'sourceCharacters': len(rows),
            'completeSourceDecompositions': len(parsed),
            'supplementalCharacters': len(SUPPLEMENTAL_RECIPES),
            'binaryRecipes': len(recipes),
            'additionalDecompositions': len(decompositions),
            'atomicComponents': len(bases),
            'playableCharacters': len(nodes),
            'ambiguousBinaryPairs': sum(count > 1 for count in pair_counts.values()),
            'alternateBinaryOutputs': sum(count - 1 for count in pair_counts.values()),
            'maximumBaseComponents': maximum_parts,
        },
        'notice': 'Chinese IDS data from Make Me a Hanzi dictionary.txt, LGPL-3.0-or-later, '
                  'plus independently authored source-checked structural supplements. '
                  'FoldKid selection and exact-subtree component resolution, 2026-11-18. '
                  'Original IDS strings are retained. See public/character-lab/SOURCES.md.',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dictionary', type=Path)
    parser.add_argument('--check', action='store_true', help='Verify the bundled catalogue without writing')
    arguments = parser.parse_args()
    catalogue = build(arguments.dictionary.read_bytes())
    encoded = json.dumps(catalogue, ensure_ascii=False, separators=(',', ':')) + '\n'
    destination = ROOT / 'src/games/characterLabCatalogue.json'
    if arguments.check:
        if destination.read_text(encoding='utf-8') != encoded:
            raise ValueError('Bundled Character Lab data differs from the reproducible import')
    else:
        destination.write_text(encoded, encoding='utf-8')
    print(json.dumps(catalogue['coverage'], ensure_ascii=False))
    fingerprint = lambda value: hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    print(f'Recipe SHA-256: {fingerprint(catalogue["recipes"])}')
    print(f'Additional decomposition SHA-256: {fingerprint(catalogue["decompositions"])}')


if __name__ == '__main__':
    main()
