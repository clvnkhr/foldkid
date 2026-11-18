#!/usr/bin/env python3
"""Verify the selected IDS source records without network access or dependencies."""
import json
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parents[2]


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 public/character-lab/verify-source.py /path/dictionary.txt')
    catalogue = json.loads((ROOT / 'src/games/characterLabCatalogue.json').read_text(encoding='utf-8'))
    importer = runpy.run_path(str(ROOT / 'scripts/import-character-lab.py'))
    expected = importer['build'](Path(sys.argv[1]).read_bytes())
    if catalogue != expected:
        raise ValueError('Changed or incomplete catalogue; rebuild using scripts/import-character-lab.py')
    print(f'Verified {len(catalogue["recipes"])} binary recipes, '
          f'{len(catalogue["decompositions"])} additional decompositions, '
          f'and {catalogue["coverage"]["playableCharacters"]} characters/components.')


if __name__ == '__main__':
    main()
