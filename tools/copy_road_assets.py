#!/usr/bin/env python3
"""One-time local extraction script for the modular road tile kit.

Copies the road/junction tile .glb files and the environment prop .glb
files from an unzipped "[FREE] Modular Roads - Base" kit into
assets/models/roadTiles/ and assets/models/props/, and writes a
manifest.json for each -- much simpler than tools/extract_glb_from_index.py
since these are already separate binary files, not embedded base64.

Usage:
    python3 tools/copy_road_assets.py /path/to/unzipped/PLUS/gltf
"""
import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

ROAD_TILES = [
    'Road1', 'Road1_Curve1', 'Road1_Curve2', 'Road1_Curve3', 'Road1_Curve4',
    'Road2_T', 'Road2_X', 'Road6_End', 'Road10_90angle_Corner',
    'Road11_Y_Splitter', 'Road11_Y_Splitter_45',
    'Road12_Diagonal_Splitter_L', 'Road12_Diagonal_Splitter_R',
]

PROPS = {
    'trees': ['Tree3', 'Tree4', 'tree_1_a', 'bush_1'],
    'lamps': ['lamp_1', 'lamp_2'],
    'barriers': ['road_barier_2a', 'road_barier_2b', 'road_barrier_1'],
    'traffic': ['hazzard_cone_1', 'traffic_barell_1', 'traffic_light_1', 'traffic_light_2', 'traffic_light_3'],
}


def main():
    if len(sys.argv) < 2:
        print('Usage: python3 tools/copy_road_assets.py /path/to/unzipped/PLUS/gltf')
        sys.exit(1)

    src_dir = Path(sys.argv[1])

    tiles_out = REPO_ROOT / 'assets' / 'models' / 'roadTiles'
    props_out = REPO_ROOT / 'assets' / 'models' / 'props'
    tiles_out.mkdir(parents=True, exist_ok=True)
    props_out.mkdir(parents=True, exist_ok=True)

    tile_manifest = {}
    for name in ROAD_TILES:
        src = src_dir / f'{name}.glb'
        if not src.exists():
            print(f'MISSING: {src}')
            continue
        dst = tiles_out / f'{name}.glb'
        shutil.copyfile(src, dst)
        tile_manifest[name] = f'assets/models/roadTiles/{name}.glb'
        print(f'copied {name}.glb ({dst.stat().st_size / 1024:.1f} KB)')

    (tiles_out / 'manifest.json').write_text(json.dumps(tile_manifest, indent=2), encoding='utf-8')
    print(f'wrote roadTiles/manifest.json ({len(tile_manifest)} tiles)')

    prop_manifest = {}
    for category, names in PROPS.items():
        prop_manifest[category] = {}
        for name in names:
            src = src_dir / f'{name}.glb'
            if not src.exists():
                print(f'MISSING: {src}')
                continue
            dst = props_out / f'{name}.glb'
            shutil.copyfile(src, dst)
            prop_manifest[category][name] = f'assets/models/props/{name}.glb'
            print(f'copied {name}.glb ({dst.stat().st_size / 1024:.1f} KB)')

    (props_out / 'manifest.json').write_text(json.dumps(prop_manifest, indent=2), encoding='utf-8')
    print(f'wrote props/manifest.json ({sum(len(v) for v in prop_manifest.values())} props)')

    all_files = list(tiles_out.glob('*.glb')) + list(props_out.glob('*.glb'))
    total = sum(f.stat().st_size for f in all_files)
    largest = max(all_files, key=lambda f: f.stat().st_size)
    print(f'\nTotal: {total / 1024 / 1024:.2f} MB across {len(all_files)} files')
    print(f'Largest: {largest.name} ({largest.stat().st_size / 1024:.1f} KB)')


if __name__ == '__main__':
    main()
