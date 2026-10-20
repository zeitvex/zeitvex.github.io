#!/usr/bin/env python3
"""Merge the shared legged_studio map library into this site's MuJoCo scenes.

The upstream maps are environment-only MJCF files (no robot include). For the
browser simulator we insert the RC_WheelLeg model include and point the map's
compiler meshdir at the local meshes-lod0 directory.

Usage:
    python tools/build_maps.py --maps-dir ../../00_open/legged_studio/assets/maps
"""
from __future__ import annotations

import argparse
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

MAP_IDS = [
    "stairs",
    "cross_stairs",
    "high_platforms",
    "cross_slope",
    "slope",
    "relief",
    "race_track",
    "robocon_dual_track",
]


def merge_map(src: Path, dst: Path) -> None:
    tree = ET.parse(src)
    root = tree.getroot()

    if root.find("include") is None:
        root.insert(0, ET.Element("include", {"file": "wheelleg_web.xml"}))

    compiler = root.find("compiler")
    if compiler is not None:
        compiler.set("meshdir", "meshes-lod0/")
        if not compiler.get("angle"):
            compiler.set("angle", "radian")

    ET.indent(tree, space="  ")
    out = dst / f"map_{src.stem}.xml"
    tree.write(out, encoding="utf-8", xml_declaration=True)
    print(f"map_{src.stem}.xml")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--maps-dir",
        default="../../00_open/legged_studio/assets/maps",
        help="path to legged_studio/assets/maps",
    )
    args = parser.parse_args()

    src = Path(args.maps_dir).resolve()
    dst = Path(__file__).resolve().parents[1] / "assets" / "models"
    if not src.is_dir():
        raise SystemExit(f"maps dir not found: {src}")

    for map_id in MAP_IDS:
        path = src / f"{map_id}.xml"
        if not path.is_file():
            raise SystemExit(f"missing map: {path}")
        merge_map(path, dst)

    src_imgs = src / "imgs"
    if src_imgs.is_dir():
        dst_imgs = dst / "imgs"
        dst_imgs.mkdir(parents=True, exist_ok=True)
        for image in src_imgs.glob("*.png"):
            shutil.copy2(image, dst_imgs / image.name)
            print(f"imgs/{image.name}")


if __name__ == "__main__":
    main()
