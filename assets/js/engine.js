// RC_WheelLeg 浏览器仿真引擎：MuJoCo WASM 物理 + 纯 JS 策略推理（与比赛 ONNX
// 逐位对拍，见 tools/export_weights.py 与 _validate/parity.mjs）。
// 与 _validate/rollout.mjs 同一条管线（Node 端到端已验证），本文件无 DOM 依赖。
import loadMujoco from "../vendor/mujoco/mujoco.js";
import { JsPolicy } from "./policy.js";
import { createObservationSystems } from "./obs/observation_builders.js";
import { imuSampleFromQpos, clamp } from "./utils.js";
import {
  JOINT_ORDER, ACTION_SCALE, DEFAULT_POSE, makeConfig,
  PHYSICS_DT, DECIMATION, POLICY_DT, INIT_HEIGHT, SETTLE_STEPS, BLEND_STEPS,
  CMD_LIMITS, POLICIES,
} from "./contract.js";

const MJ_OBJ_JOINT = 3;      // 经验枚举值（本 wasm 构建实测）
const MJ_OBJ_ACTUATOR = 19;

export class WheelLegSim {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;           // assets/models/ 的绝对 URL
    this.phase = "idle";              // idle|booting|ready|running|paused
    this.activePolicy = "rough";
    this.policyEnabled = true;        // false = 无策略（PD 姿态保持）
    this.jointNames = JOINT_ORDER;    // FK 渲染用
    this.command = { vx: 0, vy: 0, wz: 0 };
    this.telemetry = { x: 0, y: 0, z: INIT_HEIGHT, tilt: 0, speed: 0, steps: 0, inferMs: 0, fallen: false, fps: 0, realtime: 0 };
    this._lastAction = { rough: new Float32Array(16), wall: new Float32Array(16) };
    this._blend = null;               // { from, to, step }
    this._ortReady = false;
    this._actionQueue = [];           // 动作延迟队列
    this._actionDelay = 0;
    this._disturbance = { payload: 0, friction: 0.8, comX: 0, comY: 0 };
    this._base = { mass: 0, ipos: [0, 0, 0] };
  }

  async boot(onProgress = () => {}) {
    this.phase = "booting";
    onProgress("加载 MuJoCo WebAssembly", 0.05);
    // 流式读取 wasm 以获得真实下载进度，编译时直接传字节（避免二次请求）
    const wasmUrl = new URL("../vendor/mujoco/mujoco.wasm", import.meta.url).href;
    const resp = await fetch(wasmUrl);
    const total = Number(resp.headers.get("content-length") || 0);
    if (resp.body && total) {
      const reader = resp.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        const mb = (got / 1048576).toFixed(1);
        onProgress(`加载 MuJoCo WebAssembly ${mb} / ${(total / 1048576).toFixed(1)} MB`, 0.05 + 0.4 * (got / total));
      }
      const wasmBinary = new Uint8Array(got);
      let off = 0;
      for (const c of chunks) { wasmBinary.set(c, off); off += c.length; }
      this.mujoco = await loadMujoco({ wasmBinary });
    } else {
      this.mujoco = await loadMujoco();
    }
    const FS = this.mujoco.FS;
    if (!FS) throw new Error("MuJoCo WASM 未暴露文件系统");
    onProgress("写入模型与网格", 0.5);
    for (const d of ["/model", "/model/meshes-lod0"]) {
      try { FS.mkdir(d); } catch { /* 已存在 */ }
    }
    // 资产全并行下载（XML + STL + 默认策略权重），再统一写入 FS
    const xmls = ["wheelleg_web.xml", "wheelleg_web_hi.xml", "scene_flat.xml", "scene_stairs.xml", "scene_rough.xml", "scene_wall.xml"];
    const meshList = await (await fetch(`${this.baseUrl}meshes.json`)).json();
    const meshNames = Array.isArray(meshList.meshes) ? meshList.meshes : Object.keys(meshList.meshes);
    const fetchLog = [];
    const [xmlTexts, meshBufs, roughW] = await Promise.all([
      Promise.all(xmls.map((f) => fetch(`${this.baseUrl}${f}`).then((r) => r.text()))),
      Promise.all(meshNames.map((n) => fetch(`${this.baseUrl}meshes-lod0/${n}.STL`).then((r) => {
        if (!r.ok) fetchLog.push({ n, status: r.status });
        return r.arrayBuffer();
      }))),
      fetch(`${this.baseUrl}weights/model_6800.bin`).then((r) => r.arrayBuffer()),
    ]);
    if (fetchLog.length) throw new Error(`网格下载失败: ${JSON.stringify(fetchLog.slice(0, 3))}`);
    xmls.forEach((f, i) => FS.writeFile(`/model/${f}`, xmlTexts[i]));
    meshNames.forEach((n, i) => FS.writeFile(`/model/meshes-lod0/${n}.STL`, new Uint8Array(meshBufs[i])));
    // 自检：写后读回，定位“fetch 坏”还是“writeFile 丢数据”
    const fsLens = meshNames.map((n) => { try { return FS.stat(`/model/meshes-lod0/${n}.STL`).size; } catch { return -1; } });
    const bufLens = meshBufs.map((b) => b.byteLength);
    this._bootDebug = { meshNames, bufLens, fsLens };
    const badIdx = meshNames.findIndex((n, i) => fsLens[i] !== bufLens[i]);
    if (badIdx >= 0) {
      throw new Error(`STL 写入损坏: ${meshNames[badIdx]} buf=${bufLens[badIdx]} fs=${fsLens[badIdx]}`);
    }
    onProgress("编译 MuJoCo 模型", 0.7);
    this.loadScene("scene_flat.xml");
    onProgress("就绪", 0.85);
    this.sessions = { rough: new JsPolicy(roughW) }; // 默认策略即载；其余按需
    this._ortReady = true;
    onProgress("就绪", 1);
    this.phase = "ready";
    return this;
  }

  /** 按需加载策略权重（wall 首次切换时拉取，约 0.7 MB） */
  async ensurePolicy(id) {
    if (this.sessions[id]) return;
    const file = id === "rough" ? "model_6800" : "model_84";
    const r = await fetch(`${this.baseUrl}weights/${file}.bin`);
    this.sessions[id] = new JsPolicy(await r.arrayBuffer());
  }

  loadScene(file, keepState = false) {
    this._currentScene = file;
    // 可选保留物理状态（视觉升级时无缝延续）
    const saved = keepState && this.data
      ? { qpos: Array.from(this.data.qpos), qvel: Array.from(this.data.qvel), ctrl: Array.from(this.data.ctrl), time: this.data.time }
      : null;
    const mujoco = this.mujoco;
    this.model = mujoco.MjModel.mj_loadXML(`/model/${file}`);
    this.data = new mujoco.MjData(this.model);
    const qposAdr = [], dofAdr = [], ctrlId = [];
    for (const n of JOINT_ORDER) {
      const jid = mujoco.mj_name2id(this.model, MJ_OBJ_JOINT, n);
      const aid = mujoco.mj_name2id(this.model, MJ_OBJ_ACTUATOR, n);
      if (jid < 0 || aid < 0) throw new Error(`关节/执行器查找失败: ${n}`);
      qposAdr.push(this.model.jnt_qposadr[jid]);
      dofAdr.push(this.model.jnt_dofadr[jid]);
      ctrlId.push(aid);
    }
    this.maps = { qposAdr, dofAdr, ctrlId };
    const CONFIG = makeConfig();
    this.sim = { obs: new Float32Array(53), action: new Float32Array(16), cmd: new Float32Array(3) };
    this.input = { imuAxisSigns: { angular: [1, 1, 1], gravity: [1, 1, 1] } };
    const self = this;
    const ctx = {
      CONFIG, sim: this.sim, input: this.input, elements: {},
      readImuSample: () => imuSampleFromQpos(self.data.qpos, self.data.qvel),
      jointQpos: (i) => self.data.qpos[qposAdr[i]],
      jointQvel: (i) => self.data.qvel[dofAdr[i]],
      clamp, finiteNumber: Number.isFinite,
      jointGroup: () => "leg", enumValue: (v) => v,
      isJumpCommandActive: () => false, heightCommandIndex: () => -1, bucketHeightCommand: () => 0,
      observationLayout: () => CONFIG.observationLayout,
      publishDebugState: () => {},
      WHEEL_LEG_GAIT_OBSERVATION: 0, WHEEL_LEG_GAIT_PERIOD_S: 0.6,
      WHEEL_LEG_JUMP_OBSERVATION: 0, WHEEL_LEG_JUMP_PERIOD_S: 0.6,
    };
    this.obsSystem = createObservationSystems(ctx);
    this.readImuSample = ctx.readImuSample;
    if (saved) {
      // 无缝延续：恢复物理状态（维度一致：free joint + 16 关节）
      this.data.qpos.set(saved.qpos.subarray(0, this.data.qpos.length));
      this.data.qvel.set(saved.qvel.subarray(0, this.data.qvel.length));
      this.data.ctrl.set(saved.ctrl.subarray(0, this.data.ctrl.length));
      this.data.time = saved.time;
      mujoco.mj_forward(this.model, this.data);
    } else {
      this.reset();
    }
    this._captureBase();
    this._applyDisturbance();
  }

  _captureBase() {
    // 机身（base_link，body 1）的质量与质心基准，供扰动增量修改
    this._base.mass = this.model.body_mass[1];
    this._base.ipos = [this.model.body_ipos[1 * 3], this.model.body_ipos[1 * 3 + 1], this.model.body_ipos[1 * 3 + 2]];
  }

  _applyDisturbance() {
    const d = this._disturbance;
    // 附加负载：机身质量
    this.model.body_mass[1] = this._base.mass + d.payload;
    // 重心偏移：机身质心
    this.model.body_ipos[1 * 3] = this._base.ipos[0] + d.comX;
    this.model.body_ipos[1 * 3 + 1] = this._base.ipos[1] + d.comY;
    this.model.body_ipos[1 * 3 + 2] = this._base.ipos[2];
    // 接触摩擦力：世界体几何（地板与地形），轮子摩擦保持训练值
    for (let g = 0; g < this.model.ngeom; g += 1) {
      if (this.model.geom_bodyid[g] === 0 && this.model.geom_type[g] !== 7) {
        this.model.geom_friction[g * 3] = d.friction;
      }
    }
  }

  setPayload(kg) { this._disturbance.payload = kg; this._applyDisturbance(); }
  setFriction(v) { this._disturbance.friction = v; this._applyDisturbance(); }
  setComOffset(x, y) { this._disturbance.comX = x; this._disturbance.comY = y; this._applyDisturbance(); }
  setActionDelay(n) { this._actionDelay = Math.max(0, Math.min(10, n | 0)); this._actionQueue = []; }
  setImuSigns(vector, axis, sign) { this.input.imuAxisSigns[vector][axis] = sign; }

  reset() {
    const d = this.data;
    d.qpos[0] = 0; d.qpos[1] = 0; d.qpos[2] = INIT_HEIGHT;
    d.qpos[3] = 1; d.qpos[4] = 0; d.qpos[5] = 0; d.qpos[6] = 0;
    for (let i = 0; i < 16; i += 1) {
      d.qpos[this.maps.qposAdr[i]] = DEFAULT_POSE[i];
      d.ctrl[this.maps.ctrlId[i]] = i < 12 ? DEFAULT_POSE[i] : 0;
    }
    for (let s = 0; s < SETTLE_STEPS; s += 1) this.mujoco.mj_step(this.model, d);
    this.sim.action.fill(0);
    this._lastAction.rough.fill(0);
    this._lastAction.wall.fill(0);
    this._blend = null;
    this._actionQueue = [];
    this.telemetry.steps = 0;
    this.telemetry.fallen = false;
  }

  switchPolicy(id) {
    if (id === "off") {
      this.policyEnabled = false;
      this._blend = null;
      return;
    }
    this.policyEnabled = true;
    if (!this.sessions[id] || id === this.activePolicy) return;
    this._blend = { from: this.activePolicy, to: id, step: 0 };
    this.activePolicy = id;
  }

  setCommand(vx, vy, wz) {
    this.command.vx = clamp(vx, -CMD_LIMITS.vx, CMD_LIMITS.vx);
    this.command.vy = clamp(vy, -CMD_LIMITS.vy, CMD_LIMITS.vy);
    this.command.wz = clamp(wz, -CMD_LIMITS.wz, CMD_LIMITS.wz);
  }

  async controlStep() {
    const t0 = performance.now();
    const { sim, data, maps } = this;
    sim.cmd[0] = this.command.vx;
    sim.cmd[1] = this.command.vy;
    sim.cmd[2] = this.command.wz;

    let raw;
    if (!this.policyEnabled || !this._ortReady) {
      // 无策略：PD 保持默认站姿（raw = 0 → 目标 = 默认位姿）
      raw = new Float32Array(16);
      this._lastAction[this.activePolicy].fill(0);
    } else {
      // 双策略推理（切换时按 policy_runner 方式线性混合）
      const runOne = (id) => {
        sim.action.set(this._lastAction[id]);
        this.obsSystem.buildObservation();
        for (let i = 0; i < 53; i += 1) sim.obs[i] = clamp(sim.obs[i], -100, 100);
        const rawOut = this.sessions[id].run(sim.obs);
        this._lastAction[id].set(rawOut);
        return rawOut;
      };

      if (this._blend) {
        const a = runOne(this._blend.from);
        const b = runOne(this._blend.to);
        const alpha = Math.min(1, this._blend.step / BLEND_STEPS);
        raw = new Float32Array(16);
        for (let i = 0; i < 16; i += 1) raw[i] = (1 - alpha) * a[i] + alpha * b[i];
        this._blend.step += 1;
        if (this._blend.step >= BLEND_STEPS) this._blend = null;
      } else {
        raw = runOne(this.activePolicy);
      }
    }

    // 动作延迟（对齐训练域随机化 0~2 步语义）
    if (this._actionDelay > 0) {
      this._actionQueue.push(raw);
      if (this._actionQueue.length > this._actionDelay + 1) this._actionQueue.shift();
      raw = this._actionQueue[0];
    } else if (this._actionQueue.length) {
      this._actionQueue = [];
    }

    for (let i = 0; i < 16; i += 1) {
      const scaled = raw[i] * ACTION_SCALE[i];
      data.ctrl[maps.ctrlId[i]] = i < 12 ? scaled + DEFAULT_POSE[i] : scaled;
    }
    for (let k = 0; k < DECIMATION; k += 1) this.mujoco.mj_step(this.model, data);

    const tel = this.telemetry;
    tel.x = data.qpos[0]; tel.y = data.qpos[1]; tel.z = data.qpos[2];
    tel.tilt = Math.hypot(sim.obs[3], sim.obs[4]);
    tel.speed = Math.hypot(data.qvel[0], data.qvel[1]);
    tel.yawRate = data.qvel[5];
    tel.contacts = data.ncon;
    tel.steps += 1;
    tel.inferMs = performance.now() - t0;
    tel.fallen = data.qpos[2] < 0.18 || tel.tilt > 1.2;
  }

  // 渲染取数：geom 世界位姿
  geomPose(i) {
    const d = this.data;
    return {
      pos: [d.geom_xpos[i * 3], d.geom_xpos[i * 3 + 1], d.geom_xpos[i * 3 + 2]],
      quat: [d.geom_xquat[i * 4], d.geom_xquat[i * 4 + 1], d.geom_xquat[i * 4 + 2], d.geom_xquat[i * 4 + 3]],
    };
  }
}
