// Three.js 渲染器：读取抽稀网格（verts.bin/idx.bin/meshes.json），
// 按 MuJoCo 编译后的 geom 世界位姿逐帧驱动机器人。
import * as THREE from "three";
import { OrbitControls } from "../vendor/three/OrbitControls.js";

const MJ_OBJ_MESH = 10;
const MJ_GEOM_PLANE = 0, MJ_GEOM_SPHERE = 2, MJ_GEOM_CAPSULE = 3, MJ_GEOM_CYLINDER = 5, MJ_GEOM_BOX = 6, MJ_GEOM_MESH = 7;

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
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d13);
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 200);
    this.camera.position.set(1.7, -2.4, 1.3);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 0.45);
    this.controls.enableDamping = true;
    this.follow = true;
    this._prevBase = new THREE.Vector3();

    const hemi = new THREE.HemisphereLight(0x8fb4d9, 0x1a1410, 0.85);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(3, -2, 5);
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.4);
    fill.position.set(-3, 2, 2);
    this.scene.add(fill);

    this.geomObjects = [];
    this._floorAdded = false;
  }

  async load() {
    const base = this.sim.baseUrl;
    const manifest = await (await fetch(`${base}meshes.json`)).json();
    this.verts = new Float32Array(await (await fetch(`${base}verts.bin`)).arrayBuffer());
    this.idx = new Uint32Array(await (await fetch(`${base}idx.bin`)).arrayBuffer());
    this.manifest = manifest;
    this.geoms = {};
    for (const [name, m] of Object.entries(manifest.meshes)) this.geoms[name] = m;
    this.build();
  }

  meshGeometry(name) {
    const m = this.geoms[name];
    if (!m) return null;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(m.vcount * 3);
    const nrm = new Float32Array(m.vcount * 3);
    for (let i = 0; i < m.vcount; i += 1) {
      pos[i * 3] = this.verts[(m.vstart + i) * 6];
      pos[i * 3 + 1] = this.verts[(m.vstart + i) * 6 + 1];
      pos[i * 3 + 2] = this.verts[(m.vstart + i) * 6 + 2];
      nrm[i * 3] = this.verts[(m.vstart + i) * 6 + 3];
      nrm[i * 3 + 1] = this.verts[(m.vstart + i) * 6 + 4];
      nrm[i * 3 + 2] = this.verts[(m.vstart + i) * 6 + 5];
    }
    const index = Array.from(this.idx.slice(m.istart, m.istart + m.icount));
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(index);
    return geo;
  }

  build() {
    const { model, mujoco } = this.sim;
    const robotMat = new THREE.MeshStandardMaterial({ color: 0xb9bec7, metalness: 0.55, roughness: 0.38 });
    const terrainMat = new THREE.MeshStandardMaterial({ color: 0x5b6572, metalness: 0.1, roughness: 0.9 });
    this.geomObjects = [];
    this._floorAdded = false;
    // 清掉旧机器人（地形切换时重建）
    if (this.robotRoot) {
      this.scene.remove(this.robotRoot);
      this.robotRoot.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
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
        this.scene.add(floor);
        continue;
      }
      if (type === MJ_GEOM_MESH) {
        const name = mujoco.mj_id2name(model, MJ_OBJ_MESH, model.geom_dataid[i]);
        const geo = this.meshGeometry(name);
        if (!geo) continue;
        obj = new THREE.Mesh(geo, robotMat);
      } else if (type === MJ_GEOM_BOX) {
        obj = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2), terrainMat);
      } else if (type === MJ_GEOM_CYLINDER) {
        obj = new THREE.Mesh(new THREE.CylinderGeometry(size[0], size[0], size[1] * 2, 20), robotMat);
      } else if (type === MJ_GEOM_SPHERE) {
        obj = new THREE.Mesh(new THREE.SphereGeometry(size[0], 16, 12), robotMat);
      } else if (type === MJ_GEOM_CAPSULE) {
        obj = new THREE.Mesh(new THREE.CapsuleGeometry(size[0], size[1] * 2, 6, 12), robotMat);
      }
      if (!obj) continue;
      obj.userData.geomId = i;
      this.robotRoot.add(obj);
      this.geomObjects.push(obj);
    }
  }

  sync() {
    const { data, model } = this.sim;
    const qb = new THREE.Quaternion();
    const qg = new THREE.Quaternion();
    for (const obj of this.geomObjects) {
      const i = obj.userData.geomId;
      obj.position.set(data.geom_xpos[i * 3], data.geom_xpos[i * 3 + 1], data.geom_xpos[i * 3 + 2]);
      // 本 wasm 构建不暴露 geom_xquat：世界姿态 = 机身世界四元数 ⊗ geom 局部四元数
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
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
