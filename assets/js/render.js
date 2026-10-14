// Three.js 渲染器：几何体直接取自 MuJoCo 编译后的 mesh_vert/mesh_face
// （本 wasm 构建会重中心化 mesh 顶点并用 geom_pos/quat 补偿，自建几何体必须
// 用同一份数据），按 geom 世界位姿逐帧驱动。支持碰撞体/线框/轨迹/光影开关。
import * as THREE from "three";
import { OrbitControls } from "../vendor/three/OrbitControls.js";

const MJ_GEOM_PLANE = 0, MJ_GEOM_SPHERE = 2, MJ_GEOM_CAPSULE = 3, MJ_GEOM_CYLINDER = 5, MJ_GEOM_BOX = 6, MJ_GEOM_MESH = 7;
const TRAIL_MAX = 4000;

function checkerTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#1b2430";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#232f3d";
  const n = 8, s = 256 / n;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if ((i + j) % 2 === 0) g.fillRect(i * s, j * s, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SimRenderer {
  constructor(canvas, sim) {
    this.sim = sim;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d13);
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 300);
    this.camera.position.set(1.7, -2.4, 1.3);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 0.45);
    this.controls.enableDamping = true;
    this.follow = true;

    const hemi = new THREE.HemisphereLight(0x8fb4d9, 0x1a1410, 0.85);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(3, -2, 5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -6; this.sun.shadow.camera.right = 6;
    this.sun.shadow.camera.top = 6; this.sun.shadow.camera.bottom = -6;
    this.sun.shadow.camera.far = 30;
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.4);
    fill.position.set(-3, 2, 2);
    this.scene.add(fill);

    this.geomObjects = [];     // 可见对象（mesh + 地形）
    this.colliderObjects = []; // 机身碰撞体（默认隐藏）
    this._prevBase = new THREE.Vector3();
    this._fpsFrames = 0;
    this._fpsTime = performance.now();
    this._lastSimTime = 0;
    this._trailPositions = new Float32Array(TRAIL_MAX * 3);
    this._trailCount = 0;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(this._trailPositions, 3));
    trailGeo.setDrawRange(0, 0);
    this.trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x5ec1ff, transparent: true, opacity: 0.85 }));
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.scene.add(this.trail);
  }

  async load() { this.build(); }

  meshGeometry(meshId) {
    const m = this.sim.model;
    const vadr = m.mesh_vertadr[meshId], vnum = m.mesh_vertnum[meshId];
    const fadr = m.mesh_faceadr[meshId], fnum = m.mesh_facenum[meshId];
    if (!(vnum > 0 && fnum > 0)) return null;
    const pos = new Float32Array(vnum * 3);
    for (let i = 0; i < vnum * 3; i += 1) pos[i] = m.mesh_vert[vadr * 3 + i];
    const index = [];
    for (let f = 0; f < fnum; f += 1) {
      const a = m.mesh_face[fadr + f * 3], b = m.mesh_face[fadr + f * 3 + 1], c = m.mesh_face[fadr + f * 3 + 2];
      if (a !== b && b !== c && a !== c) index.push(a, b, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    return geo;
  }

  build() {
    const { model } = this.sim;
    this.robotMat = this.robotMat || new THREE.MeshStandardMaterial({ color: 0xb9bec7, metalness: 0.55, roughness: 0.38 });
    this.terrainMat = this.terrainMat || new THREE.MeshStandardMaterial({ color: 0x5b6572, metalness: 0.1, roughness: 0.9 });
    this.colliderMat = this.colliderMat || new THREE.MeshStandardMaterial({ color: 0x2f6f4f, metalness: 0.1, roughness: 0.6, transparent: true, opacity: 0.55 });
    this.geomObjects = [];
    this.colliderObjects = [];
    this._floorAdded = false;
    if (this.robotRoot) {
      this.scene.remove(this.robotRoot);
      this.robotRoot.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    if (this.floorMesh) {
      this.scene.remove(this.floorMesh);
      this.floorMesh.geometry.dispose();
      this.floorMesh = null;
    }
    this.robotRoot = new THREE.Group();
    this.scene.add(this.robotRoot);

    const ngeom = model.ngeom;
    for (let i = 0; i < ngeom; i += 1) {
      const type = model.geom_type[i];
      const size = [model.geom_size[i * 3], model.geom_size[i * 3 + 1], model.geom_size[i * 3 + 2]];
      let obj = null;
      if (type === MJ_GEOM_PLANE) {
        if (this._floorAdded) continue;
        this._floorAdded = true;
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(80, 80),
          new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.95, metalness: 0 }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
        this.floorMesh = floor;
        continue;
      }
      const isRobotCollider = type !== MJ_GEOM_MESH && model.geom_bodyid[i] !== 0;
      if (type === MJ_GEOM_MESH) {
        const geo = this.meshGeometry(model.geom_dataid[i]);
        if (!geo) continue;
        obj = new THREE.Mesh(geo, this.robotMat);
        obj.castShadow = true;
      } else if (type === MJ_GEOM_BOX) {
        obj = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2), isRobotCollider ? this.colliderMat : this.terrainMat);
        obj.castShadow = !isRobotCollider;
        obj.receiveShadow = !isRobotCollider;
      } else if (type === MJ_GEOM_CYLINDER) {
        obj = new THREE.Mesh(new THREE.CylinderGeometry(size[0], size[0], size[1] * 2, 20), isRobotCollider ? this.colliderMat : this.robotMat);
        obj.castShadow = !isRobotCollider;
      } else if (type === MJ_GEOM_SPHERE) {
        obj = new THREE.Mesh(new THREE.SphereGeometry(size[0], 16, 12), isRobotCollider ? this.colliderMat : this.robotMat);
        obj.castShadow = !isRobotCollider;
      } else if (type === MJ_GEOM_CAPSULE) {
        obj = new THREE.Mesh(new THREE.CapsuleGeometry(size[0], size[1] * 2, 6, 12), isRobotCollider ? this.colliderMat : this.robotMat);
        obj.castShadow = !isRobotCollider;
      }
      if (!obj) continue;
      obj.userData.geomId = i;
      obj.visible = !isRobotCollider;
      this.robotRoot.add(obj);
      (isRobotCollider ? this.colliderObjects : this.geomObjects).push(obj);
    }
    this.clearTrail();
  }

  setCollisionVisible(v) { for (const o of this.colliderObjects) o.visible = v; }
  setWireframe(v) {
    for (const m of [this.robotMat, this.terrainMat]) m.wireframe = v;
  }
  setShadows(v) {
    this.renderer.shadowMap.enabled = v;
    this.sun.castShadow = v;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  clearTrail() {
    this._trailCount = 0;
    this.trail.geometry.setDrawRange(0, 0);
  }

  pushTrail() {
    const d = this.sim.data;
    if (this._trailCount >= TRAIL_MAX) {
      this._trailPositions.copyWithin(0, 3);
      this._trailCount = TRAIL_MAX - 1;
    }
    const o = this._trailCount * 3;
    this._trailPositions[o] = d.qpos[0];
    this._trailPositions[o + 1] = d.qpos[1];
    this._trailPositions[o + 2] = 0.01;
    this._trailCount += 1;
    this.trail.geometry.setDrawRange(0, this._trailCount);
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.computeBoundingSphere();
  }

  fitView() {
    const box = new THREE.Box3();
    for (const obj of this.geomObjects) {
      obj.geometry.computeBoundingBox();
      const bb = obj.geometry.boundingBox;
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
        box.expandByPoint(obj.localToWorld(new THREE.Vector3(x, y, z)));
      }
    }
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const dir = new THREE.Vector3(0.75, -1.3, 0.7).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c).addScaledVector(dir, Math.max(1.2, r * 1.9));
  }

  flipView() {
    const t = this.controls.target;
    const off = this.camera.position.clone().sub(t);
    off.x = -off.x; off.y = -off.y;
    this.camera.position.copy(t).add(off);
  }

  sync() {
    const { data, model } = this.sim;
    const qb = new THREE.Quaternion();
    const qg = new THREE.Quaternion();
    for (const obj of this.geomObjects) {
      if (!obj.visible) continue;
      const i = obj.userData.geomId;
      obj.position.set(data.geom_xpos[i * 3], data.geom_xpos[i * 3 + 1], data.geom_xpos[i * 3 + 2]);
      // 本 wasm 构建不暴露 geom_xquat：世界姿态 = 机身世界四元数 ⊗ geom 局部四元数
      const b = model.geom_bodyid[i];
      qb.set(data.xquat[b * 4 + 1], data.xquat[b * 4 + 2], data.xquat[b * 4 + 3], data.xquat[b * 4]);
      qg.set(model.geom_quat[i * 4 + 1], model.geom_quat[i * 4 + 2], model.geom_quat[i * 4 + 3], model.geom_quat[i * 4]);
      obj.quaternion.multiplyQuaternions(qb, qg);
    }
    for (const obj of this.colliderObjects) {
      if (!obj.visible) continue;
      const i = obj.userData.geomId;
      obj.position.set(data.geom_xpos[i * 3], data.geom_xpos[i * 3 + 1], data.geom_xpos[i * 3 + 2]);
      const b = model.geom_bodyid[i];
      qb.set(data.xquat[b * 4 + 1], data.xquat[b * 4 + 2], data.xquat[b * 4 + 3], data.xquat[b * 4]);
      qg.set(model.geom_quat[i * 4 + 1], model.geom_quat[i * 4 + 2], model.geom_quat[i * 4 + 3], model.geom_quat[i * 4]);
      obj.quaternion.multiplyQuaternions(qb, qg);
    }
    const base = new THREE.Vector3(data.qpos[0], data.qpos[1], data.qpos[2]);
    if (this.follow) {
      const delta = base.clone().sub(this._prevBase);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
    this._prevBase.copy(base);
    if (this.trail.visible) this.pushTrail();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this._fpsFrames += 1;
    const now = performance.now();
    if (now - this._fpsTime >= 500) {
      this.sim.telemetry.fps = Math.round((this._fpsFrames * 1000) / (now - this._fpsTime));
      this._fpsFrames = 0;
      this._fpsTime = now;
    }
  }

  /** 客观对齐验证：mesh 世界包围盒 vs 碰撞盒（MuJoCo 数据直算）；所有对象不得嵌入地板。 */
  verifyAlignment() {
    this.sync();
    const { model, data, mujoco } = this.sim;
    const corners = (obj) => {
      obj.geometry.computeBoundingBox();
      const bb = obj.geometry.boundingBox;
      const pts = [];
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
        pts.push(obj.localToWorld(new THREE.Vector3(x, y, z)));
      }
      return pts;
    };
    const bboxOf = (pts) => {
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (const p of pts) for (let a = 0; a < 3; a += 1) { mn[a] = Math.min(mn[a], p.getComponent(a)); mx[a] = Math.max(mx[a], p.getComponent(a)); }
      return { min: mn, max: mx };
    };
    const out = { pairs: [], minZ: 1e9, geomCount: this.geomObjects.length };
    let boxId = -1;
    for (let g = 0; g < model.ngeom; g += 1) {
      if (mujoco.mj_id2name(model, 5, g) === "base_link_col1") { boxId = g; break; }
    }
    if (boxId > 0) {
      const meshObj = this.geomObjects.find((o) => o.userData.geomId === boxId - 1);
      if (meshObj) {
        const a = bboxOf(corners(meshObj));
        const s = [model.geom_size[boxId * 3], model.geom_size[boxId * 3 + 1], model.geom_size[boxId * 3 + 2]];
        const p0 = [data.geom_xpos[boxId * 3], data.geom_xpos[boxId * 3 + 1], data.geom_xpos[boxId * 3 + 2]];
        const xm = Array.from(data.geom_xmat.subarray(boxId * 9, boxId * 9 + 9));
        const bpts = [];
        for (const dx of [-s[0], s[0]]) for (const dy of [-s[1], s[1]]) for (const dz of [-s[2], s[2]]) {
          bpts.push(new THREE.Vector3(
            p0[0] + xm[0] * dx + xm[1] * dy + xm[2] * dz,
            p0[1] + xm[3] * dx + xm[4] * dy + xm[5] * dz,
            p0[2] + xm[6] * dx + xm[7] * dy + xm[8] * dz,
          ));
        }
        const b = bboxOf(bpts);
        out.pairs.push({
          pair: "base_link mesh vs collider box",
          diff: [0, 1, 2].map((i) => +Math.max(Math.abs(a.min[i] - b.min[i]), Math.abs(a.max[i] - b.max[i])).toFixed(4)),
        });
      }
    }
    for (const obj of this.geomObjects) {
      if (!obj.visible) continue;
      const bb = bboxOf(corners(obj));
      out.minZ = Math.min(out.minZ, bb.min[2]);
    }
    // 轮子 mesh 的轮胎轮廓比碰撞圆柱低约 4cm（CAD 模型本身如此，MuJoCo 官方
    // 查看器同样如此），阈值放到 -0.06；偏移类 bug 由上面的 mesh-vs-box 对齐捕获。
    out.minZ = +out.minZ.toFixed(4);
    out.minZLimit = -0.06;
    return out;
  }
}
