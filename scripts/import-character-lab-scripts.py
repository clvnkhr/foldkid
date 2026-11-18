#!/usr/bin/env python3
"""Rebuild Character Lab's simplified/shared-script policy from pinned Unihan data.

Usage: python3 scripts/import-character-lab-scripts.py /path/Unihan-17.0.0.zip --opencc-dir /path/OpenCC-tables [--check]
The raw composition catalogue and its original IDS records are never changed.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parent.parent
UNIHAN_SHA256 = 'f7a48b2b545acfaa77b2d607ae28747404ce02baefee16396c5d2d7a8ef34b5e'
OPENCC_COMMIT = 'fae2a0a911c30764e669a7d8b0591cd8e852934a'
OPENCC_SHA256 = {
    'TSCharacters': '9ff46a7d30e5765375eb13d33f2b03a34d298913caf2b120380679f33ae1642d',
    'HKVariants': 'e5cd4345303224587102f2c9e4d2b67d2b7e349c6ce9152e4a118f4656cf7302',
    'TWVariants': '245b94eb5842957e735dd44b7e7d4ff469a3643126cc8fa511adda5281e9cb86',
    'JPShinjitaiCharacters': '12cec7250b873ef52b36d8f92218d4f92c0aaf5d8cd7c58fe42d9785bdcdc43a',
}
# These explicit positional forms are accepted by the game in addition to the
# source catalogue. Include them in script classification, including hints.
RADICAL_FORMS = '亻忄扌氵灬讠钅犭礻纟饣刂⺈爫艹辶糹釒飠⺮⺗㣺⺌⺍氺衤⺼⺧牜⺶⺷耂肀𧾷囗'
# The user explicitly requested these full radical originals before combining.
PRESERVED_RADICALS = {'艸', '糸', '辵'}


def variants(value):
    return [chr(int(codepoint, 16)) for codepoint in re.findall(r'U\+([0-9A-F]+)', value)]


def build(source, catalogue_bytes, opencc_sources):
    if hashlib.sha256(source).hexdigest() != UNIHAN_SHA256:
        raise ValueError('Unexpected Unihan archive; use Unicode 17.0.0 documented in SOURCES.md')
    properties = {}
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        for name in ['Unihan_Variants.txt', 'Unihan_OtherMappings.txt', 'Unihan_Readings.txt', 'Unihan_IRGSources.txt']:
            for line in archive.read(name).decode('utf-8').splitlines():
                if not line.startswith('U+'):
                    continue
                codepoint, key, value = line.split('\t')
                if key in ['kSimplifiedVariant', 'kTGH', 'kDefinition', 'kRSUnicode']:
                    properties.setdefault(chr(int(codepoint[2:], 16)), {})[key] = value

    catalogue = json.loads(catalogue_bytes)
    nodes = set(catalogue['bases']) | set(RADICAL_FORMS)
    nodes.update(row[0] for row in catalogue['recipes'] + catalogue['decompositions'])
    tables = {}
    for name, expected in OPENCC_SHA256.items():
        contents = opencc_sources[name]
        if hashlib.sha256(contents).hexdigest() != expected:
            raise ValueError(f'Unexpected OpenCC {name} source; use pinned revision {OPENCC_COMMIT}')
        entries = {}
        for line in contents.decode('utf-8').splitlines():
            if not line or line.startswith('#'):
                continue
            character, values = line.split('\t')
            if len(character) == 1:
                entries[character] = [value for value in values.split() if len(value) == 1]
        tables[name] = entries
    # OpenCC regional tables describe traditional -> regional variants; reverse
    # those edges. Its Japanese table is already modern-Japanese -> traditional.
    alternates = {}
    for name in ['HKVariants', 'TWVariants']:
        for original, regional in tables[name].items():
            for form in regional:
                if form != original:
                    alternates.setdefault(form, set()).add(original)
    for form, originals in tables['JPShinjitaiCharacters'].items():
        alternates.setdefault(form, set()).update(original for original in originals if original != form)

    def direct_targets(character):
        return (set(variants(properties.get(character, {}).get('kSimplifiedVariant', ''))) | set(tables['TSCharacters'].get(character, []))) - {character}

    def resolve(character, trail=(), explicit_target=False):
        if character in PRESERVED_RADICALS or 'kTGH' in properties.get(character, {}):
            return {character}
        if character in trail:
            return set()
        direct = direct_targets(character) - {character}
        if direct:
            return set().union(*(resolve(target, trail + (character,), True) for target in direct))
        regional = alternates.get(character, set())
        resolved = set().union(*(resolve(target, trail + (character,)) for target in regional)) if regional else set()
        return resolved or ({character} if explicit_target else set())

    traditional_only = []
    retained_shared = []
    ingredient_aliases = []
    for character in sorted(nodes, key=ord):
        record = properties.get(character, {})
        direct = direct_targets(character) - {character}
        if character in PRESERVED_RADICALS or 'kTGH' in record:
            if direct:
                retained_shared.append(character)
            continue
        counterparts = resolve(character) - {character}
        if not counterparts:
            continue
        # Prefer a mainland-standard target when one of several spellings is
        # listed. Keep every source counterpart so consumers need not guess.
        counterparts = sorted(counterparts, key=lambda target: ('kTGH' not in properties.get(target, {}), ord(target)))
        traditional_only.append([character, counterparts])
        standard_targets = [target for target in counterparts if 'kTGH' in properties.get(target, {})]
        if len(standard_targets) == 1:
            ingredient_aliases.append([character, standard_targets[0]])
        elif len(counterparts) == 1:
            ingredient_aliases.append([character, counterparts[0]])

    # Unihan does not mark 靑 as a simplified/traditional pair. This explicit
    # modern-glyph game policy uses its same definition and radical number;
    # it must not be presented as Unicode normalization or a variant property.
    if properties['靑']['kDefinition'] != properties['青']['kDefinition']:
        raise ValueError('Changed blue/green glyph policy evidence')
    if properties['靑']['kRSUnicode'] != properties['青']['kRSUnicode'] or 'kTGH' not in properties['青']:
        raise ValueError('Changed mainland-standard glyph policy evidence')
    modern_glyph_aliases = [['靑', '青']]
    standard_modern_targets = sorted({target for _, target in ingredient_aliases
                                      if 'kTGH' in properties.get(target, {})}, key=ord)
    classified = {
        'traditionalOnly': traditional_only,
        'ingredientAliases': ingredient_aliases,
        'retainedShared': retained_shared,
        'modernGlyphAliases': modern_glyph_aliases,
        'standardModernTargets': standard_modern_targets,
    }
    fingerprint = hashlib.sha256(json.dumps(classified, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    return {
        'notice': 'Unicode 17.0.0 Unihan script metadata. Copyright 2025 Unicode, Inc.; Unicode License V3. '
                  'OpenCC mapping selection, Apache-2.0. '
                  'FoldKid selection 2026-11-18: traditional-only exclusions preserve mainland-standard/shared '
                  'characters and original radical forms; modern glyph aliases are an explicit game policy, '
                  'not Unicode normalization. The source composition catalogue is unchanged.',
        'unicodeVersion': '17.0.0',
        'unihanSha256': UNIHAN_SHA256,
        'openccCommit': OPENCC_COMMIT,
        'openccSha256': OPENCC_SHA256,
        'catalogueSha256': hashlib.sha256(catalogue_bytes).hexdigest(),
        'classificationSha256': fingerprint,
        **classified,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('unihan', type=Path)
    parser.add_argument('--opencc-dir', type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    arguments = parser.parse_args()
    metadata = build(arguments.unihan.read_bytes(), (ROOT / 'src/games/characterLabCatalogue.json').read_bytes(),
                     {name: (arguments.opencc_dir / f'{name}.txt').read_bytes() for name in OPENCC_SHA256})
    encoded = json.dumps(metadata, ensure_ascii=False, separators=(',', ':')) + '\n'
    destination = ROOT / 'src/games/characterLabScripts.json'
    if arguments.check:
        if destination.read_text(encoding='utf-8') != encoded:
            raise ValueError('Bundled Character Lab script metadata differs from the reproducible import')
    else:
        destination.write_text(encoded, encoding='utf-8')
    print(f'Classified {len(metadata["traditionalOnly"])} traditional-only forms; '
          f'preserved {len(metadata["retainedShared"])} explicitly shared variant entries.')
    print(f'Identified {len(metadata["ingredientAliases"])} unambiguous simplified ingredient aliases.')
    print(f'Classification SHA-256: {metadata["classificationSha256"]}')


if __name__ == '__main__':
    main()
