// FK 驱动渲染器：运动学树（kinematics.json）+ STL 原始顶点。
// 不读 MuJoCo 编译的 mesh_vert/mesh_face——该 wasm 构建在浏览器里编译产出的
// mesh_face 数组中段错乱（Node 正常），FK 路线只用 data.qpos（一直被遥测验证），
// 顶点经"STL原始顶点 + FK + geom位姿"与 MuJoCo 编译顶点世界位置零误差（已验证）。
import * as THREE from "three";
import { OrbitControls } from "../vendor/three/OrbitControls.js";

const MJ_GEOM_PLANE = 0, MJ_GEOM_SPHERE = 2, MJ_GEOM_CAPSULE = 3, MJ_GEOM_CYLINDER = 5, MJ_GEOM_BOX = 6, MJ_GEOM_MESH = 7;
const TRAIL_MAX = 4000;

function checkerTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#2b3542";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#333e4c";
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

function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#31435a");
  grad.addColorStop(0.55, "#1d2a38");
  grad.addColorStop(1, "#0e141b");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function parseStl(buffer) {
  const dv = new DataView(buffer);
  const n = dv.getUint32(80, true);
  const pos = new Float32Array(n * 9);
  const index = [];
  for (let f = 0; f < n; f += 1) {
    const off = 84 + f * 50 + 12;
    for (let k = 0; k < 9; k += 1) pos[f * 9 + k] = dv.getFloat32(off + k * 4, true);
    // sliver 过滤（边长比 > 40 的细丝面，源自 SolidWorks 碎面）
    const p = f * 9;
    const e = [
      Math.hypot(pos[p + 3] - pos[p], pos[p + 4] - pos[p + 1], pos[p + 5] - pos[p + 2]),
      Math.hypot(pos[p + 6] - pos[p + 3], pos[p + 7] - pos[p + 4], pos[p + 8] - pos[p + 5]),
      Math.hypot(pos[p] - pos[p + 6], pos[p + 1] - pos[p + 7], pos[p + 2] - pos[p + 8]),
    ];
    const ratio = Math.max(...e) / Math.max(1e-9, Math.min(...e));
    if (ratio <= 40) index.push(f * 3, f * 3 + 1, f * 3 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.toNonIndexed(); // flat shading：机械件硬边
  geo.computeVertexNormals();
  return geo;
}

export class SimRenderer {
  constructor(canvas, sim) {
    this.sim = sim;
    const debug = new URLSearchParams(location.search).has("debug");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: debug });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0x243141, 14, 65);
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 300);
    this.camera.up.set(0, 0, 1); // Z-up 世界（MuJoCo 约定）
    this.camera.position.set(1.7, -2.4, 1.3);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 0.45);
    this.controls.enableDamping = true;
    this.follow = true;

    const hemi = new THREE.HemisphereLight(0xa8c8e8, 0x2a2620, 1.15);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.1);
    this.sun.position.set(3, -2, 5);
    this.sun.castShadow = false;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight(0x9db8ff, 0.55);
    fill.position.set(-3, 2, 2);
    this.scene.add(fill);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.bodyGroups = [];   // FK 每个 body 一个 Group
    this.meshFiles = {};    // mesh 名 -> ArrayBuffer（lod1 升级用）
    this._prevBase = new THREE.Vector3();
    this._fpsFrames = 0;
    this._fpsTime = performance.now();
    this._trailPositions = new Float32Array(TRAIL_MAX * 3);
    this._trailCount = 0;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(this._trailPositions, 3));
    trailGeo.setDrawRange(0, 0);
    this.trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x5ec1ff, transparent: true, opacity: 0.85 }));
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.scene.add(this.trail);
    this._q = new THREE.Quaternion();
  }

  async load() {
    const base = this.sim.baseUrl;
    this.kin = await (await fetch(`${base}kinematics.json`)).json();
    // 下载并解析 lod0 STL
    const names = this.kin.bodies.flatMap((b) => b.meshes.map((m) => m.file));
    await Promise.all(names.map(async (n) => {
      // 引擎已把同一批 STL 写入 MuJoCo FS，这里直接复用，避免二次下载
      this.meshFiles[n] = this.sim.meshBuffers?.get(n)
        || await (await fetch(`${base}meshes-lod0/${n}.STL`)).arrayBuffer();
    }));
    this.build();
  }

  /** LOD 升级：用 lod1 STL 重新解析并替换 geometry（无 MuJoCo 参与）。 */
  async upgradeMeshes() {
    const base = this.sim.baseUrl;
    const names = Object.keys(this.meshFiles);
    await Promise.all(names.map(async (n) => {
      this.meshFiles[n] = await (await fetch(`${base}meshes-lod1/${n}.STL`)).arrayBuffer();
    }));
    let n = 0;
    for (const obj of this.meshObjects) {
      const geo = parseStl(this.meshFiles[obj.userData.meshFile]);
      obj.geometry.dispose();
      obj.geometry = geo;
      n += 1;
    }
    return n;
  }

  build() {
    this.robotMat = this.robotMat || new THREE.MeshStandardMaterial({ color: 0xccd2da, metalness: 0.25, roughness: 0.5 });
    this.terrainMat = this.terrainMat || new THREE.MeshStandardMaterial({ color: 0x707d8a, metalness: 0.1, roughness: 0.85 });
    this.colliderMat = this.colliderMat || new THREE.MeshStandardMaterial({ color: 0x2f6f4f, metalness: 0.1, roughness: 0.6, transparent: true, opacity: 0.55 });

    if (this.robotRoot) {
      this.scene.remove(this.robotRoot);
      this.robotRoot.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    if (this.floorMesh) {
      this.scene.remove(this.floorMesh);
      this.floorMesh.geometry.dispose();
      this.floorMesh = null;
    }
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid = null;
    }
    for (const t of this.terrainBoxes || []) {
      this.scene.remove(t.obj);
      t.obj.geometry.dispose();
    }
    this.terrainBoxes = [];

    this.robotRoot = new THREE.Group();
    this.scene.add(this.robotRoot);
    this.bodyGroups = this.kin.bodies.map(() => {
      const g = new THREE.Group();
      this.robotRoot.add(g);
      return g;
    });
    this.meshObjects = [];
    this.kin.bodies.forEach((b, bi) => {
      for (const m of b.meshes) {
        const geo = parseStl(this.meshFiles[m.file]);
        const obj = new THREE.Mesh(geo, this.robotMat);
        obj.position.set(m.pos[0], m.pos[1], m.pos[2]);
        obj.quaternion.set(m.quat[1], m.quat[2], m.quat[3], m.quat[0]);
        obj.castShadow = true;
        obj.userData.meshFile = m.file;
        this.bodyGroups[bi].add(obj);
        this.meshObjects.push(obj);
      }
    });

    // 地形：渲染所有非机器人 body 的静态 geom（含公共地图库中的嵌套 body）
    const { model, mujoco } = this.sim;
    const data = this.sim.data;
    const robotBodyIds = new Set();
    for (const b of this.kin.bodies) {
      if (!b.name) continue;
      const id = mujoco.mj_name2id(model, 1, b.name);
      if (id > 0) robotBodyIds.add(id);
    }
    const geomMat = new THREE.Matrix4();
    const applyPose = (obj, i) => {
      obj.position.set(data.geom_xpos[i * 3], data.geom_xpos[i * 3 + 1], data.geom_xpos[i * 3 + 2]);
      const m = data.geom_xmat;
      geomMat.set(
        m[i * 9], m[i * 9 + 1], m[i * 9 + 2], 0,
        m[i * 9 + 3], m[i * 9 + 4], m[i * 9 + 5], 0,
        m[i * 9 + 6], m[i * 9 + 7], m[i * 9 + 8], 0,
        0, 0, 0, 1,
      );
      obj.quaternion.setFromRotationMatrix(geomMat);
    };

    for (let i = 0; i < model.ngeom; i += 1) {
      if (robotBodyIds.has(model.geom_bodyid[i])) continue;
      const type = model.geom_type[i];
      const size = [model.geom_size[i * 3], model.geom_size[i * 3 + 1], model.geom_size[i * 3 + 2]];
      if (type === MJ_GEOM_PLANE) {
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(80, 80),
          new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.95, metalness: 0 }),
        );
        floor.receiveShadow = true;
        this.scene.add(floor);
        this.floorMesh = floor;
        const grid = new THREE.GridHelper(80, 80, 0x46566a, 0x2c3a48);
        grid.rotation.x = -Math.PI / 2;
        grid.position.z = 0.002;
        grid.material.transparent = true;
        grid.material.opacity = 0.5;
        this.scene.add(grid);
        this.grid = grid;
      } else {
        let geometry = null;
        if (type === MJ_GEOM_BOX) {
          geometry = new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2);
        } else if (type === MJ_GEOM_CYLINDER) {
          geometry = new THREE.CylinderGeometry(size[0], size[0], size[1] * 2, 24);
          geometry.rotateX(Math.PI / 2); // MuJoCo cylinder 沿局部 Z 轴
        } else if (type === MJ_GEOM_SPHERE) {
          geometry = new THREE.SphereGeometry(size[0], 24, 16);
        }
        if (!geometry) continue;
        const obj = new THREE.Mesh(geometry, this.terrainMat);
        const p = mujoco.mj_id2name(model, 4, i);
        obj.name = p || `terrain${i}`;
        applyPose(obj, i);
        this.scene.add(obj);
        this.terrainBoxes = this.terrainBoxes || [];
        this.terrainBoxes.push({ obj, gid: i });
      }
    }
    this.clearTrail();
  }

  /** FK：从 qpos 计算每个 body 的世界位姿（与 MuJoCo mj_kinematics 零误差）。
   *  child_world = parent_world ∘ (body pos, quat) ∘ R(joint_axis, q)  */
  fk() {
    const data = this.sim.data, maps = this.sim.maps, kin = this.kin;
    const q = data.qpos;
    const bodies = kin.bodies;
    const groups = this.bodyGroups;
    if (!this._jointIdx) {
      this._jointIdx = {};
      this.sim.jointNames.forEach((n, i) => { this._jointIdx[n] = i; });
      this._axis = new THREE.Vector3();
    }
    for (let i = 0; i < bodies.length; i += 1) {
      const b = bodies[i];
      const g = groups[i];
      if (b.joint && b.joint.type === "free") {
        g.position.set(q[0], q[1], q[2]);
        g.quaternion.set(q[4], q[5], q[6], q[3]);
        continue;
      }
      const p = groups[b.parent];
      if (!b._lq) {
        b._lq = new THREE.Quaternion(b.quat[1], b.quat[2], b.quat[3], b.quat[0]);
        b._lp = new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2]);
      }
      g.position.copy(b._lp);
      g.quaternion.copy(b._lq);
      if (b.joint) {
        this._axis.set(b.joint.axis[0], b.joint.axis[1], b.joint.axis[2]);
        this._q.setFromAxisAngle(this._axis, q[maps.qposAdr[this._jointIdx[b.joint.name]]]);
        g.quaternion.multiply(this._q); // local = body ∘ R(joint)
      }
      g.position.applyQuaternion(p.quaternion).add(p.position); // world = parent ∘ local
      g.quaternion.premultiply(p.quaternion);
    }
  }

  sync() {
    this.fk();
    const base = this.bodyGroups[0];
    if (this.follow && base) {
      const delta = base.position.clone().sub(this._prevBase);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
    if (base) this._prevBase.copy(base.position);
    if (this.trail.visible && base) this.pushTrail(base.position);
  }

  pushTrail(p) {
    if (this._trailCount >= TRAIL_MAX) {
      this._trailPositions.copyWithin(0, 3);
      this._trailCount = TRAIL_MAX - 1;
    }
    const o = this._trailCount * 3;
    this._trailPositions[o] = p.x;
    this._trailPositions[o + 1] = p.y;
    this._trailPositions[o + 2] = 0.01;
    this._trailCount += 1;
    this.trail.geometry.setDrawRange(0, this._trailCount);
    this.trail.geometry.attributes.position.needsUpdate = true;
  }

  clearTrail() {
    this._trailCount = 0;
    this.trail.geometry.setDrawRange(0, 0);
  }

  setCollisionVisible(v) { /* FK 渲染无独立碰撞体层：高亮由线框模式承担 */ }
  setWireframe(v) { for (const m of [this.robotMat, this.terrainMat]) m.wireframe = v; }
  setShadows(v) {
    this.renderer.shadowMap.enabled = v;
    this.sun.castShadow = v;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  fitView() {
    this.fk();
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const obj of this.meshObjects) {
      obj.geometry.computeBoundingBox();
      const bb = obj.geometry.boundingBox;
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
        box.expandByPoint(obj.localToWorld(new THREE.Vector3(x, y, z)));
      }
    }
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const dir = new THREE.Vector3(0.75, -1.3, 0.45).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c).addScaledVector(dir, Math.max(3.0, r * 3.6));
    const base = this.bodyGroups[0]?.position;
    if (base) this._prevBase.copy(base);
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

  /** 客观对齐验证：base mesh 世界包围盒 vs 碰撞盒（MuJoCo 数据直算）。 */
  verifyAlignment() {
    this.sync();
    const { model, data, mujoco } = this.sim;
    const out = { pairs: [], minZ: 1e9, geomCount: this.meshObjects.length };
    let boxId = -1;
    for (let g = 0; g < model.ngeom; g += 1) {
      if (mujoco.mj_id2name(model, 5, g) === "base_link_col1") { boxId = g; break; }
    }
    const baseMesh = this.meshObjects.find((o) => o.userData.meshFile === "base_link");
    if (boxId >= 0 && baseMesh) {
      baseMesh.geometry.computeBoundingBox();
      const bb = baseMesh.geometry.boundingBox;
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
        const p = baseMesh.localToWorld(new THREE.Vector3(x, y, z));
        for (let a = 0; a < 3; a += 1) { mn[a] = Math.min(mn[a], p.getComponent(a)); mx[a] = Math.max(mx[a], p.getComponent(a)); }
      }
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
      const bmn = [1e9, 1e9, 1e9], bmx = [-1e9, -1e9, -1e9];
      for (const p of bpts) for (let a = 0; a < 3; a += 1) { bmn[a] = Math.min(bmn[a], p.getComponent(a)); bmx[a] = Math.max(bmx[a], p.getComponent(a)); }
      out.pairs.push({
        pair: "base_link mesh vs collider box",
        diff: [0, 1, 2].map((i) => +Math.max(Math.abs(mn[i] - bmn[i]), Math.abs(mx[i] - bmx[i])).toFixed(4)),
      });
    }
    for (const obj of this.meshObjects) {
      obj.geometry.computeBoundingBox();
      const bb = obj.geometry.boundingBox;
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
        out.minZ = Math.min(out.minZ, obj.localToWorld(new THREE.Vector3(x, y, z)).z);
      }
    }
    out.minZ = +out.minZ.toFixed(4);
    out.minZLimit = -0.06;
    return out;
  }
}
