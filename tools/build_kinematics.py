"""Generate kinematics.json (body tree + mesh attachments) from wheelleg.xml.

The renderer no longer reads MuJoCo compiled mesh data (the wasm build emits
corrupt mesh_face arrays in browsers); it does its own FK from qpos using this
tree, with STL vertices used as-is in body-local coordinates.
"""
import json
import math
from pathlib import Path

from lxml import etree

SRC = Path(r"C:\Users\31560\Documents\00_open\rc_old\RC_WheelLeg\05_software\train\rc_mjlab\mjcf\wheelleg.xml")
DST = Path(r"C:\Users\31560\Documents\00_open\zeitvex.github.io\assets\models\kinematics.json")


def parse_vec(s, n, default):
    if not s:
        return list(default)
    return [float(x) for x in s.split()]


def quat_mul(a, b):
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return [
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    ]


def quat_axis(axis, angle):
    n = math.sqrt(sum(c * c for c in axis)) or 1.0
    x, y, z = [c / n for c in axis]
    h = angle / 2.0
    s = math.sin(h)
    return [math.cos(h), x * s, y * s, z * s]


def build():
    tree = etree.parse(str(SRC))
    root = tree.getroot()
    bodies = []

    def walk_body(el, parent_idx):
        idx = len(bodies)
        bodies.append({
            "name": el.get("name"),
            "parent": parent_idx,
            "pos": parse_vec(el.get("pos"), 3, (0, 0, 0)),
            "quat": parse_vec(el.get("quat"), 4, (1, 0, 0, 0)),
            "joint": None,
            "meshes": [],
        })
        for j in el.findall("joint"):
            jt = j.get("type")
            if jt == "free":
                bodies[idx]["joint"] = {"type": "free"}
            else:
                bodies[idx]["joint"] = {
                    "type": jt,
                    "axis": parse_vec(j.get("axis"), 3, (0, 0, 1)),
                    "name": j.get("name"),
                }
            break
        for g in el.findall("geom"):
            if g.get("type") != "mesh":
                continue
            bodies[idx]["meshes"].append({
                "file": g.get("mesh"),
                "pos": parse_vec(g.get("pos"), 3, (0, 0, 0)),
                "quat": parse_vec(g.get("quat"), 4, (1, 0, 0, 0)),
            })
        for c in el.findall("body"):
            walk_body(c, idx)

    world = root.find("worldbody")
    for b in world.findall("body"):
        walk_body(b, -1)

    DST.write_text(json.dumps({"bodies": bodies}, indent=1))
    n_j = sum(1 for b in bodies if b["joint"] and b["joint"]["type"] != "free")
    n_m = sum(len(b["meshes"]) for b in bodies)
    print(f"kinematics.json: {len(bodies)} bodies, {n_j} hinge joints, {n_m} mesh attachments")


if __name__ == "__main__":
    build()
