"""Build web assets for zeitvex.github.io from RC_WheelLeg.

Pipeline:
1. Decimate MuJoCo STL meshes (vertex clustering) -> MuJoCo STL + Three.js binary.
2. Generate browser MJCF: wheelleg_web.xml (actuators per ROS2 v3 deployment
   contract: legs position Kp=50 Kv=1.5, wheels velocity Kv=1.0; collisions per
   mjlab robot_cfg) + scene variants (flat/stairs/rough/wall).
3. Copy competition ONNX policies.

Ground truth sources (read-only):
  rc_mjlab/mjcf/{wheelleg,scene}.xml            training MJCF
  rc_mjlab/src/robot/robot_cfg.py               actuator/collision/init config
  sim2real_ros2_v3/.../deployment_contract.hpp  kLegKp/kLegKd/kWheelKd/kActionScale/kDefaultDofPos
"""
import json
import struct
import sys
from pathlib import Path

import numpy as np
from lxml import etree

SRC_MJCF = Path(r"C:\Users\31560\Documents\00_open\rc_old\RC_WheelLeg\05_software\train\rc_mjlab\mjcf")
SRC_POLICIES = Path(r"C:\Users\31560\Documents\00_open\rc_old\RC_WheelLeg\05_software\train\rc_mjlab")
DST = Path(r"C:\Users\31560\Documents\00_open\zeitvex.github.io\assets\models")
DST_MESH = DST / "meshes"

# ROS2 v3 deployment contract (deployment_contract.hpp)
LEG_KP, LEG_KV, EFFORT = 50.0, 1.5, 17.0
WHEEL_KV = 1.0
LEG_JOINTS = [f"{p}_{t}_joint" for p in ("fl", "fr", "rl", "rr") for t in ("hip_abduction", "hip_pitch", "knee")]
WHEEL_JOINTS = [f"{p}_wheel_joint" for p in ("fl", "fr", "rl", "rr")]


def read_stl(path: Path):
    data = path.read_bytes()
    if data[:5] == b"solid" and b"facet" in data[:2048]:
        raise SystemExit(f"ASCII STL not supported: {path}")
    n = struct.unpack("<I", data[80:84])[0]
    dt = np.dtype([("n", "<f4", (3,)), ("v", "<f4", (3, 3)), ("a", "<u2")])
    arr = np.frombuffer(data, dtype=dt, count=n, offset=84)
    if 84 + n * 50 != len(data):
        print(f"  [warn] {path.name}: size mismatch, using header count {n}")
    return arr["v"].copy(), arr["n"].copy()


def decimate(V: np.ndarray, target_tris: int):
    """Vertex-cluster decimation. V: (n,3,3) triangles. Returns (verts (m,3), faces (k,3))."""
    n = V.shape[0]
    if n <= target_tris:
        idx = np.arange(n * 3, dtype=np.int64).reshape(n, 3)
        return V.reshape(-1, 3), idx
    flat = V.reshape(-1, 3)
    mins, maxs = flat.min(0), flat.max(0)
    extent = np.maximum(maxs - mins, 1e-9)
    k = max(2, int(round(target_tris ** (1.0 / 3.0))))
    scale = (k - 1) / extent
    cell = np.floor((flat - mins) * scale).astype(np.int64)
    keys = (cell[:, 0] * (k + 1) + cell[:, 1]) * (k + 1) + cell[:, 2]
    uniq, inv = np.unique(keys, return_inverse=True)
    sums = np.zeros((len(uniq), 3), dtype=np.float64)
    counts = np.zeros(len(uniq), dtype=np.float64)
    np.add.at(sums, inv, flat)
    np.add.at(counts, inv, 1.0)
    reps = (sums / counts[:, None]).astype(np.float32)
    faces = inv.reshape(n, 3)
    keep = (faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])
    return reps, faces[keep]


def vertex_normals(verts: np.ndarray, faces: np.ndarray):
    nrm = np.zeros_like(verts)
    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    for sl in (slice(0, 3),):
        pass
    for col in range(3):
        np.add.at(nrm, faces[:, col], fn)
    ln = np.linalg.norm(nrm, axis=1)
    ln[ln < 1e-12] = 1.0
    return (nrm / ln[:, None]).astype(np.float32)


def write_stl(path: Path, verts: np.ndarray, faces: np.ndarray):
    out = np.zeros((faces.shape[0], 3, 3), dtype="<f4")
    out[:, 0, :] = verts[faces[:, 0]]
    out[:, 1, :] = verts[faces[:, 1]]
    out[:, 2, :] = verts[faces[:, 2]]
    with open(path, "wb") as f:
        f.write(b"\0" * 80)
        f.write(struct.pack("<I", faces.shape[0]))
        rec = np.zeros(faces.shape[0], dtype=[("n", "<f4", (3,)), ("v", "<f4", (3, 3)), ("a", "<u2")])
        rec["v"] = out
        f.write(rec.tobytes())


def build_meshes():
    DST_MESH.mkdir(parents=True, exist_ok=True)
    manifest = {"vertFloats": 6, "meshes": {}}
    vert_blocks, idx_blocks = [], []
    voff = ioff = 0
    for stl in sorted(SRC_MJCF.glob("meshes/*.STL")):
        V, _ = read_stl(stl)
        target = max(500, min(6000, int(V.shape[0] * 0.035)))
        verts, faces = decimate(V, target)
        nrm = vertex_normals(verts, faces)
        write_stl(DST_MESH / stl.name, verts, faces)
        vn = np.hstack([verts, nrm]).astype(np.float32)
        vert_blocks.append(vn.tobytes())
        idx_blocks.append(faces.astype(np.uint32).tobytes())
        manifest["meshes"][stl.stem] = {
            "vstart": voff, "vcount": int(verts.shape[0]),
            "istart": ioff, "icount": int(faces.shape[0]),
        }
        voff += verts.shape[0]
        ioff += faces.shape[0]
        print(f"  {stl.name:28s} {V.shape[0]:7d} -> {faces.shape[0]:6d} tris")
    (DST / "verts.bin").write_bytes(b"".join(vert_blocks))
    (DST / "idx.bin").write_bytes(b"".join(idx_blocks))
    (DST / "meshes.json").write_text(json.dumps(manifest), encoding="utf-8")
    print(f"  total verts {voff}, tris {ioff}, verts.bin {(DST / 'verts.bin').stat().st_size / 1e6:.2f} MB")


def patch_robot_xml():
    tree = etree.parse(str(SRC_MJCF / "wheelleg.xml"))
    root = tree.getroot()
    # name every unnamed primitive collider so collision rules can target it
    for body in root.iter("body"):
        bname = body.get("name")
        gi = 0
        for geom in body.findall("geom"):
            if geom.get("name"):
                continue
            if geom.get("type") in ("box", "cylinder", "sphere", "capsule"):
                gi += 1
                geom.set("name", f"{bname}_col{gi}")
    for act in root.find("actuator"):
        root.find("actuator").remove(act)
    # collision config per mjlab robot_cfg COLLISION_CFG.
    # Only patch geoms under worldbody: the <default> class must keep MuJoCo
    # stock contype/conaffinity so the scene floor (included later) still
    # collides with conaffinity=1 robot geoms.
    for geom in root.find("worldbody").iter("geom"):
        geom.set("contype", "0")
        geom.set("conaffinity", "1")
        if "_wheel_Link" in geom.get("name", ""):
            geom.set("condim", "6")
            geom.set("friction", "0.8 0.05 0.01")
            geom.set("priority", "1")
        else:
            geom.set("condim", "1")
    actuator = etree.SubElement(root, "actuator")
    for j in LEG_JOINTS:
        etree.SubElement(actuator, "position", name=j, joint=j,
                         kp=str(LEG_KP), kv=str(LEG_KV), forcerange=f"{-EFFORT} {EFFORT}")
    for j in WHEEL_JOINTS:
        etree.SubElement(actuator, "velocity", name=j, joint=j,
                         kv=str(WHEEL_KV), forcerange=f"{-EFFORT} {EFFORT}")
    tree.write(str(DST / "wheelleg_web.xml"), pretty_print=True, xml_declaration=True, encoding="utf-8")
    print("  wheelleg_web.xml written")


def scene_body(terrain: str, seed: int):
    if terrain == "flat":
        return ""
    if terrain == "stairs":
        parts = []
        for i in range(8):
            h = 0.025 * (i + 1)
            parts.append(f'    <geom name="stair{i}" type="box" size="0.125 1.2 {h}" pos="{1.0 + i * 0.25} 0 {h}" friction="0.8 0.05 0.01"/>')
        return "\n".join(parts)
    if terrain == "rough":
        rng = np.random.default_rng(seed)
        parts = []
        for ix in range(10):
            for iy in range(6):
                h = round(float(rng.uniform(0.0, 0.06)), 3)
                if h < 0.004:
                    continue
                x, y = -1.0 + ix * 1.0, -2.5 + iy * 1.0
                parts.append(f'    <geom name="r{ix}_{iy}" type="box" size="0.5 0.5 {h}" pos="{x} {y} {h}"/>')
        return "\n".join(parts)
    if terrain == "wall":
        parts = []
        for i, x in enumerate((1.6, 3.1, 4.6, 6.1, 7.6)):
            parts.append(f'    <geom name="wall{i}" type="box" size="0.06 0.85 0.15" pos="{x} 0 0.15" friction="0.8 0.05 0.01"/>')
        return "\n".join(parts)
    raise ValueError(terrain)


def build_scenes():
    for terrain, seed in (("flat", 0), ("stairs", 0), ("rough", 7), ("wall", 0)):
        body = scene_body(terrain, seed)
        xml = f'''<mujoco model="wheelleg_web_{terrain}">
  <include file="wheelleg_web.xml"/>
  <option timestep="0.005" gravity="0 0 -9.81" integrator="implicitfast" impratio="100" cone="elliptic"/>
  <visual>
    <headlight diffuse="0.6 0.6 0.6" ambient="0.3 0.3 0.3"/>
    <global azimuth="120" elevation="-20"/>
  </visual>
  <asset>
    <texture type="skybox" builtin="gradient" rgb1="0.30 0.50 0.70" rgb2="0 0 0" width="512" height="3072"/>
    <texture type="2d" name="groundplane" builtin="checker" mark="edge" rgb1="0.20 0.30 0.40" rgb2="0.10 0.20 0.30" markrgb="0.80 0.80 0.80" width="300" height="300"/>
    <material name="groundplane" texture="groundplane" texuniform="true" texrepeat="5 5" reflectance="0.2"/>
  </asset>
  <worldbody>
    <light pos="0 0 3" dir="0 0 -1" directional="true"/>
    <geom name="floor" size="0 0 0.05" type="plane" material="groundplane" friction="0.8 0.05 0.01"/>
{body}
  </worldbody>
</mujoco>
'''
        (DST / f"scene_{terrain}.xml").write_text(xml, encoding="utf-8")
        print(f"  scene_{terrain}.xml written")


def copy_policies():
    for name in ("model_6800.onnx", "model_rough.pt"):
        src = SRC_POLICIES / name
        if src.exists():
            (DST / name).write_bytes(src.read_bytes())
            print(f"  {name} copied")
    wall = Path(r"C:\Users\31560\Documents\00_open\rc_old\RC_WheelLeg\05_software\real\sim2real_ros2_v3\policies\model_84.onnx")
    (DST / "model_84.onnx").write_bytes(wall.read_bytes())
    print("  model_84.onnx copied")


if __name__ == "__main__":
    print("[1/4] meshes")
    build_meshes()
    print("[2/4] robot xml")
    patch_robot_xml()
    print("[3/4] scenes")
    build_scenes()
    print("[4/4] policies")
    copy_policies()
    print("done")
