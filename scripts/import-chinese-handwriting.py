#!/usr/bin/env python3
"""Rebuild the local handwriting catalogue from pinned, unmodified upstream files.

Usage: python3 scripts/import-chinese-handwriting.py <hanzi-writer-data-2.0.1.tgz> <Unihan-17.0.0.zip> [CJKRadicals-17.0.0.txt]
Downloads and npm dependencies are deliberately not part of the app's build.
"""
import base64
import hashlib
import json
from pathlib import Path
import struct
import sys
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
EXPECTED = {
    'hanzi': '72baf3d82b114e60d6e40ea05f24d2262a05cd39d544e2f322ba2fceb7beff15',
    'unihan': 'f7a48b2b545acfaa77b2d607ae28747404ce02baefee16396c5d2d7a8ef34b5e',
    'radicals': '826f83be25cd18fb8a5015a514704504e1982e840ea14d058bf583e1cc620c83',
}


def checked_file(path, kind):
    contents = Path(path).read_bytes()
    if hashlib.sha256(contents).hexdigest() != EXPECTED[kind]:
        raise ValueError(f'Unexpected {kind} source: download the pinned version documented in SOURCES.md')
    return contents


def pack_medians(medians):
    """Lossless directed points: positive varint = zigzag(delta)+1; zero = absolute float64."""
    packed = bytearray()

    def varint(value):
        while value > 127:
            packed.append((value & 127) | 128)
            value >>= 7
        packed.append(value)

    for stroke in medians:
        varint(len(stroke))
        previous = [0, 0]
        for point in stroke:
            for axis, coordinate in enumerate(point):
                difference = coordinate - previous[axis]
                if float(difference).is_integer():
                    delta = int(difference)
                    varint((delta * 2 if delta >= 0 else -delta * 2 - 1) + 1)
                else:
                    varint(0)
                    packed.extend(struct.pack('<d', coordinate))
                previous[axis] = coordinate
    return base64.b64encode(packed).decode('ascii')


def median_fingerprint(characters):
    digest = hashlib.sha256()
    for _, _, _, medians in characters:
        digest.update(struct.pack('<I', len(medians)))
        for stroke in medians:
            digest.update(struct.pack('<I', len(stroke)))
            for x, y in stroke:
                digest.update(struct.pack('<dd', x, y))
    return digest.hexdigest()


def write_radicals(characters, properties, path):
    checked_file(path, 'radicals')
    glyph_by_key = {}
    for raw_line in Path(path).read_text(encoding='utf-8').splitlines():
        line = raw_line.split('#', 1)[0].strip()
        if line:
            key, _, ideograph = [part.strip() for part in line.split(';')]
            glyph_by_key[key] = chr(int(ideograph, 16))
    glyphs_by_number = {}
    memberships = []
    for character, *_ in characters:
        keys = [value.split('.')[0] for value in properties[character]['kRSUnicode'].split()]
        numbers = list(dict.fromkeys(int(key.rstrip("'")) for key in keys))
        memberships.append([character, numbers])
        for key in keys:
            number = int(key.rstrip("'"))
            glyphs_by_number.setdefault(number, {})[key] = glyph_by_key[key]
    radicals = [[number, ' / '.join(glyph for _, glyph in sorted(forms.items(), key=lambda item: len(item[0])))]
                for number, forms in sorted(glyphs_by_number.items())]
    fingerprint = hashlib.sha256(json.dumps(memberships, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    output = {
        'notice': 'Unicode 17.0.0 kRSUnicode and CJKRadicals metadata. Copyright 2025 Unicode, Inc.; Unicode License V3. FoldKid selection 2026-11-18: all listed dictionary-radical memberships for the bundled single-character catalogue. Not an exhaustive visual-component decomposition.',
        'unihanSha256': EXPECTED['unihan'],
        'radicalsSha256': EXPECTED['radicals'],
        'classificationSha256': fingerprint,
        'radicals': radicals,
        'characters': memberships,
    }
    (ROOT / 'src/games/chineseHandwritingRadicals.json').write_text(
        json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Generated {len(radicals)} dictionary-radical families for all {len(characters)} characters.')


def main():
    if len(sys.argv) not in (3, 4):
        raise SystemExit(__doc__)
    checked_file(sys.argv[1], 'hanzi')
    checked_file(sys.argv[2], 'unihan')
    properties = {}
    with zipfile.ZipFile(sys.argv[2]) as archive:
        for name in archive.namelist():
            for line in archive.read(name).decode('utf-8').splitlines():
                if line.startswith('U+'):
                    codepoint, key, value = line.split('\t')
                    properties.setdefault(chr(int(codepoint[2:], 16)), {})[key] = value
    characters = []
    missing = []
    with tarfile.open(sys.argv[1], 'r:gz') as archive:
        files = {member.name: member for member in archive.getmembers() if member.isfile()}
        for character, fields in properties.items():
            if 'kTGH' not in fields:
                continue
            table_index = int(fields['kTGH'].split(':')[1])
            strokes = int(fields.get('kTotalStrokes', '100').split()[0])
            if table_index > 3500 and strokes > 6:
                continue
            name = f'package/{character}.json'
            if name not in files:
                missing.append(character)
                continue
            data = json.load(archive.extractfile(files[name]))
            medians = data['medians']
            if not medians or any(len(stroke) < 2 for stroke in medians):
                raise ValueError(f'Invalid stroke medians for {character}')
            characters.append([character, fields.get('kMandarin', ''), table_index, medians])
        license_data = archive.extractfile(files['package/ARPHICPL.TXT']).read()
    characters.sort(key=lambda row: row[2])
    first_level = {row[2] for row in characters if row[2] <= 3500}
    if first_level != set(range(1, 3501)):
        raise ValueError('The first-level common-character catalogue must be complete')
    output = {
        'notice': 'Copyright 1999 Arphic Technology Co., Ltd. Stroke data from Hanzi Writer Data 2.0.1 / Make Me a Hanzi. FoldKid modification 2026-11-18: selected single characters; omitted stroke outlines and radical metadata; combined original, unchanged ordered medians using lossless delta-varint/base64 encoding. Licensed under the Arphic Public License; see public/chinese-handwriting/ARPHICPL.TXT. Unicode metadata: Unicode 17.0.0, Unicode License V3.',
        'medianSha256': median_fingerprint(characters),
        'characters': [[character, pinyin, index, len(medians), pack_medians(medians)] for character, pinyin, index, medians in characters],
    }
    (ROOT / 'src/games/chineseHandwritingCatalogue.json').write_text(
        json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    (ROOT / 'public/chinese-handwriting/ARPHICPL.TXT').write_bytes(license_data)
    if len(sys.argv) == 4:
        write_radicals(characters, properties, sys.argv[3])
    print(f'Generated {len(characters)} characters, including all 3500 first-level common characters.')
    print('Unavailable rare simple characters:', ''.join(sorted(missing)))


if __name__ == '__main__':
    main()
