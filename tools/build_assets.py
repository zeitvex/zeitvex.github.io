"""Build web assets for zeitvex.github.io from RC_WheelLeg.

Pipeline:
1. Decimate MuJoCo STL meshes with QEM edge collapse (tools/qem.py) at two
   LOD levels: lod0 (10%, wheels 15%) for instant boot, lod1 (35%, wheels
   40%) streamed in the background for full visual quality. STL meshes are
   purely visual (contype=0; contacts come from primitive colliders), so
   LOD never affects physics or policy behavior.
2. Generate browser MJCF: wheelleg_web.xml (lod0 meshdir) for boot,
   wheelleg_web_hi.xml (lod1 meshdir) for the visual upgrade; actuators per
   ROS2 v3 deployment contract, collisions per mjlab robot_cfg; plus scene
   variants (flat/stairs/rough/wall).
3. Copy competition ONNX policies.

Ground truth sources (read-only):
  rc_mjlab/mjcf/{wheelleg,scene}.xml            training MJCF
  rc_mjlab/src/robot/robot_cfg.py               actuator/collision/init config
  sim2real_ros2_v3/.../deployment_contract.hpp  kLegKp/kLegKd/kWheelKd/kActionScale/kDefaultDofPos
"""
import json
import sys
from pathlib import Path

from lxml import etree

sys.path.insert(0, str(Path(__file__).parent))
from qem import qem_decimate, read_stl, weld_vertices, write_stl

SRC_MJCF = Path(r"C:\Users\31560\Documents\00_open\rc_old\RC_WheelLeg\05_software\train\rc_mjlab\mjcf")
SRC_POLICIES = Path(r"C:\Users\31560\Documents\00_open\rc_old\RC_WheelLeg\05_software\train\rc_mjlab")
DST = Path(r"C:\Users\31560\Documents\00_open\zeitvex.github.io\assets\models")

# ROS2 v3 deployment contract (deployment_contract.hpp)
LEG_KP, LEG_KV, EFFORT = 50.0, 1.5, 17.0
WHEEL_KV = 1.0
LEG_JOINTS = [f"{p}_{t}_joint" for p in ("fl", "fr", "rl", "rr") for t in ("hip_abduction", "hip_pitch", "knee")]
WHEEL_JOINTS = [f"{p}_wheel_joint" for p in ("fl", "fr", "rl", "rr")]

# QEM LOD ratios (wheels are the visual focus, keep more faces there)
LODS = {
    "lod0": {"meshdir": "meshes-lod0", "default": 0.10, "wheel": 0.15},
    "lod1": {"meshdir": "meshes-lod1", "default": 0.35, "wheel": 0.40},
}


def build_meshes():
    names = []
    for stl in sorted(SRC_MJCF.glob("meshes/*.STL")):
        V, F = read_stl(stl)
        V, F = weld_vertices(V, F)
        for lod, cfg in LODS.items():
            out_dir = DST / cfg["meshdir"]
            out_dir.mkdir(parents=True, exist_ok=True)
            ratio = cfg["wheel"] if "wheel" in stl.stem else cfg["default"]
            target = max(400, int(F.shape[0] * ratio))
            Vd, Fd = qem_decimate(V, F, target)
            write_stl(out_dir / stl.name, Vd, Fd)
            if lod == "lod0":
                names.append(stl.stem)
                print(f"  {stl.name:28s} lod0 {F.shape[0]:7d} -> {Fd.shape[0]:6d} tris")
            else:
                print(f"  {stl.name:28s} lod1 {F.shape[0]:7d} -> {Fd.shape[0]:6d} tris")
    # meshes.json enumerates lod0 STL names for boot (render geometry comes
    # from MuJoCo compiled mesh data; no verts.bin/idx.bin needed).
    (DST / "meshes.json").write_text(json.dumps({"meshes": names}), encoding="utf-8")


def patch_robot_xml(lod: str):
    cfg = LODS[lod]
    tree = etree.parse(str(SRC_MJCF / "wheelleg.xml"))
    root = tree.getroot()
    root.find("compiler").set("meshdir", f'{cfg["meshdir"]}/')
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
    out_name = "wheelleg_web.xml" if lod == "lod0" else "wheelleg_web_hi.xml"
    tree.write(str(DST / out_name), pretty_print=True, xml_declaration=True, encoding="utf-8")
    print(f"  {out_name} written (meshdir={cfg['meshdir']})")


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
        import numpy as np
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
    for name in ("model_6800.onnx", "model_84.onnx"):
        src = SRC_POLICIES / name
        if not src.exists():
            src = Path(r"C:\Users\31560\Documents\00_open\rc_old\RC_WheelLeg\05_software\real\sim2real_ros2_v3\policies") / name
        (DST / name).write_bytes(src.read_bytes())
        print(f"  {name} copied")


if __name__ == "__main__":
    print("[1/5] meshes (LOD0 + LOD1)")
    build_meshes()
    print("[2/5] robot xml (lod0)")
    patch_robot_xml("lod0")
    print("[3/5] robot xml (lod1)")
    patch_robot_xml("lod1")
    print("[4/5] scenes")
    build_scenes()
    print("[5/5] policies")
    copy_policies()
    print("done")
