// RC_WheelLeg 浏览器仿真引擎：MuJoCo WASM 物理 + ONNX Runtime Web 策略推理。
// 与 _validate/rollout.mjs 同一条管线（Node 端到端已验证），本文件无 DOM 依赖。
import loadMujoco from "../vendor/mujoco/mujoco.js";
import * as ort from "../vendor/ort/ort.all.min.mjs";
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
    this.command = { vx: 0, vy: 0, wz: 0 };
    this.telemetry = { x: 0, y: 0, z: INIT_HEIGHT, tilt: 0, speed: 0, steps: 0, inferMs: 0, fallen: false };
    this._lastAction = { rough: new Float32Array(16), wall: new Float32Array(16) };
    this._blend = null;               // { from, to, step }
    this._ortReady = false;
  }

  async boot(onProgress = () => {}) {
    this.phase = "booting";
    onProgress("加载 MuJoCo WebAssembly", 0.05);
    this.mujoco = await loadMujoco();
    const FS = this.mujoco.FS;
    if (!FS) throw new Error("MuJoCo WASM 未暴露文件系统");
    onProgress("写入模型与网格", 0.2);
    for (const d of ["/model", "/model/meshes"]) {
      try { FS.mkdir(d); } catch { /* 已存在 */ }
    }
    const xmls = ["wheelleg_web.xml", "scene_flat.xml", "scene_stairs.xml", "scene_rough.xml", "scene_wall.xml"];
    for (const f of xmls) {
      const r = await fetch(`${this.baseUrl}${f}`);
      FS.writeFile(`/model/${f}`, await r.text());
    }
    const meshList = await (await fetch(`${this.baseUrl}meshes.json`)).json();
    for (const name of Object.keys(meshList.meshes)) {
      const r = await fetch(`${this.baseUrl}meshes/${name}.STL`);
      FS.writeFile(`/model/meshes/${name}.STL`, new Uint8Array(await r.arrayBuffer()));
    }
    onProgress("编译 MuJoCo 模型", 0.45);
    this.loadScene("scene_flat.xml");
    onProgress("加载比赛策略 ONNX", 0.6);
    ort.env.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).href;
    ort.env.wasm.numThreads = 1;      // GitHub Pages 无 COOP/COEP，禁用线程
    ort.env.logLevel = "error";
    this.sessions = {};
    for (const p of POLICIES) {
      const r = await fetch(`${this.baseUrl}${p.file}`);
      this.sessions[p.id] = await ort.InferenceSession.create(new Uint8Array(await r.arrayBuffer()));
    }
    this._ortReady = true;
    onProgress("就绪", 1);
    this.phase = "ready";
    return this;
  }

  loadScene(file) {
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
    this.reset();
  }

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
    this.telemetry.steps = 0;
    this.telemetry.fallen = false;
  }

  switchPolicy(id) {
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
    if (!this._ortReady) return;
    const t0 = performance.now();
    const { sim, data, maps } = this;
    sim.cmd[0] = this.command.vx;
    sim.cmd[1] = this.command.vy;
    sim.cmd[2] = this.command.wz;

    // 双策略推理（切换时按 policy_runner 方式线性混合）
    const runOne = async (id) => {
      sim.action.set(this._lastAction[id]);
      this.obsSystem.buildObservation();
      for (let i = 0; i < 53; i += 1) sim.obs[i] = clamp(sim.obs[i], -100, 100);
      const r = await this.sessions[id].run({ obs: new ort.Tensor("float32", sim.obs, [1, 53]) });
      const out = r.action ?? r[Object.keys(r)[0]];
      const raw = out.data;
      this._lastAction[id].set(raw);
      return raw;
    };

    let raw;
    if (this._blend) {
      const a = await runOne(this._blend.from);
      const b = await runOne(this._blend.to);
      const alpha = Math.min(1, this._blend.step / BLEND_STEPS);
      raw = new Float32Array(16);
      for (let i = 0; i < 16; i += 1) raw[i] = (1 - alpha) * a[i] + alpha * b[i];
      this._blend.step += 1;
      if (this._blend.step >= BLEND_STEPS) this._blend = null;
    } else {
      raw = await runOne(this.activePolicy);
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
