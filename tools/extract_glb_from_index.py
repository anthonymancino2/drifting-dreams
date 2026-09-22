#!/usr/bin/env python3
"""One-time local extraction script.

Pulls the inline `const ASSETS={cars:[...], tree:'...', rock:'...', bush:'...'}`
base64 GLTF blob out of the (pre-split) index.html and writes each model out as
a real binary .glb file under assets/models/, plus a manifest.json mapping
vehicle index -> file. This script is NOT loaded by the game at runtime and is
not imported from anywhere in js/ -- it only ever runs by hand, from a
terminal, against a saved copy of the old single-file index.html.

Usage:
    python3 tools/extract_glb_from_index.py path/to/old-index.html
"""
import base64
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

VEHICLE_NAMES = [
    'Apex GT', 'Velocity S2', 'Interceptor', 'City Cab', 'Trailblazer',
    'Commuter', 'Sedan LX', 'Nemesis GT', 'Scarlet GT', 'Super V12',
    'Onyx Supercar', 'Street Coupe', 'Muscle 6.2', 'Rally Cross', 'Armor Unit',
    'Trail Runner', 'Police Cruiser', 'City Runner', 'Cargo Van',
]


def slug(name):
    return re.sub(r'(^-|-$)', '', re.sub(r'[^a-z0-9]+', '-', name.lower()))


def find_object_literal(html, marker):
    start = html.index(marker)
    # position right after "const ASSETS=" -- i.e. at the opening '{'
    obj_start = start + len('const ASSETS=')
    depth = 0
    i = obj_start
    while i < len(html):
        ch = html[i]
        if ch in '{[':
            depth += 1
        elif ch in '}]':
            depth -= 1
            if depth == 0:
                return html[obj_start:i + 1]
        i += 1
    raise ValueError('Could not find end of ASSETS object literal')


def extract_string_array(literal, key):
    # literal looks like: {cars:['AAAA...','BBBB...', ...],tree:'....',rock:'...',bush:'...'}
    m = re.search(r"cars:\[", literal)
    if not m:
        raise ValueError('cars array not found')
    start = m.end()
    depth = 1
    i = start
    while depth > 0:
        if literal[i] == '[':
            depth += 1
        elif literal[i] == ']':
            depth -= 1
        i += 1
    cars_body = literal[start:i - 1]
    # base64 contains no quotes or commas, so each quoted element is a whole car string
    return [a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", cars_body)]


def extract_scalar_string(literal, key):
    m = re.search(rf"{key}:'([^']*)'", literal) or re.search(rf'{key}:"([^"]*)"', literal)
    if not m:
        raise ValueError(f'{key} not found')
    return m.group(1)


def main():
    if len(sys.argv) < 2:
        print('Usage: python3 tools/extract_glb_from_index.py <path-to-old-index.html>')
        sys.exit(1)

    src_path = Path(sys.argv[1])
    html = src_path.read_text(encoding='utf-8')

    marker = 'const ASSETS={cars:['
    if marker not in html:
        print('Could not find "const ASSETS={cars:[" in the given file -- is this the right index.html?')
        sys.exit(1)

    literal = find_object_literal(html, marker)
    cars_b64 = extract_string_array(literal, 'cars')
    if len(cars_b64) != 19:
        print(f'Expected 19 car entries, found {len(cars_b64)}. Aborting -- check the source file.')
        sys.exit(1)

    tree_b64 = extract_scalar_string(literal, 'tree')
    rock_b64 = extract_scalar_string(literal, 'rock')
    bush_b64 = extract_scalar_string(literal, 'bush')

    out_dir = REPO_ROOT / 'assets' / 'models'
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        'cars': [],
        'tree': 'assets/models/tree.glb',
        'rock': 'assets/models/rock.glb',
        'bush': 'assets/models/bush.glb',
    }

    for idx, b64 in enumerate(cars_b64):
        file_name = f'car-{idx:02d}-{slug(VEHICLE_NAMES[idx])}.glb'
        data = base64.b64decode(b64)
        (out_dir / file_name).write_bytes(data)
        manifest['cars'].append({'index': idx, 'name': VEHICLE_NAMES[idx], 'file': f'assets/models/{file_name}'})
        print(f'wrote {file_name} ({len(data) / 1024:.1f} KB)')

    for key, b64 in (('tree', tree_b64), ('rock', rock_b64), ('bush', bush_b64)):
        data = base64.b64decode(b64)
        (out_dir / f'{key}.glb').write_bytes(data)
        print(f'wrote {key}.glb ({len(data) / 1024:.1f} KB)')

    (out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(f"wrote manifest.json ({len(manifest['cars'])} cars)")

    glb_files = sorted(out_dir.glob('*.glb'), key=lambda p: p.stat().st_size, reverse=True)
    total = sum(p.stat().st_size for p in glb_files)
    print(f'\nTotal .glb size: {total / 1024 / 1024:.2f} MB across {len(glb_files)} files')
    print(f'Largest file: {glb_files[0].name}: {glb_files[0].stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main()
