// UI  wiring：启动序列、固定步长主循环、指令输入、遥测面板。
import { WheelLegSim } from "./engine.js";
import { SimRenderer } from "./render.js";
import { POLICIES, TERRAINS, JOINT_LABELS, POLICY_DT, CMD_LIMITS } from "./contract.js";

const $ = (id) => document.getElementById(id);
const MODELS_URL = new URL("../models/", import.meta.url).href;

const sim = new WheelLegSim(MODELS_URL);
let renderer = null;
let running = false;
let acc = 0;
let lastTs = 0;

const ui = {
  boot: $("bootScreen"), bootStage: $("bootStage"), bootBar: $("bootProgress"), bootPct: $("bootPercent"),
  state: $("engineState"), policy: $("policySelect"), terrain: $("terrainSelect"),
  start: $("startBtn"), reset: $("resetBtn"), follow: $("followBtn"),
  cmdOut: $("commandOut"), clock: $("clock"), fallen: $("fallenBadge"),
  cmdToggle: $("cmdToggle"), monitorToggle: $("monitorToggle"),
  cmdPanel: $("cmdPanel"), monitorPanel: $("monitorPanel"),
  vx: $("cmdVx"), vy: $("cmdVy"), wz: $("cmdWz"),
  vxOut: $("cmdVxOut"), vyOut: $("cmdVyOut"), wzOut: $("cmdWzOut"),
  bodyPos: $("bodyPos"), contactOut: $("contactOut"), inferOut: $("inferOut"),
  actionChart: $("actionChart"), actionValues: $("actionValues"), obsChart: $("obsChart"),
};

function setState(text, cls) {
  ui.state.textContent = text;
  ui.state.className = `pill ${cls || ""}`;
}

async function boot() {
  try {
    await sim.boot((stage, p) => {
      ui.bootStage.textContent = stage;
      ui.bootBar.style.width = `${Math.round(p * 100)}%`;
      ui.bootPct.textContent = `${Math.round(p * 100)}%`;
    });
    renderer = new SimRenderer($("simCanvas"), sim);
    window.__wheelrenderer = renderer;
    await renderer.load();
    renderer.resize(innerWidth, innerHeight);
    ui.boot.hidden = true;
    setState("就绪", "ok");
    ui.start.disabled = false;
    ui.reset.disabled = false;
    ui.policy.disabled = false;
    ui.terrain.disabled = false;
    ui.follow.disabled = false;
    ui.cmdToggle.disabled = false;
    ui.monitorToggle.disabled = false;
    for (const p of POLICIES) {
      const o = document.createElement("option");
      o.value = p.id; o.textContent = p.label;
      ui.policy.appendChild(o);
    }
    for (const t of TERRAINS) {
      const o = document.createElement("option");
      o.value = t.id; o.textContent = t.label;
      ui.terrain.appendChild(o);
    }
    requestAnimationFrame(frame);
  } catch (err) {
    ui.bootStage.textContent = `启动失败: ${err.message}`;
    console.error(err);
  }
}

async function frame(now) {
  const dt = lastTs ? Math.min(0.1, (now - lastTs) / 1000) : 0;
  lastTs = now;
  if (running && sim.phase !== "idle") {
    acc += dt;
    let n = 0;
    while (acc >= POLICY_DT && n < 3) {
      await sim.controlStep();
      acc -= POLICY_DT;
      n += 1;
    }
  }
  if (renderer) {
    renderer.sync();
    renderer.render();
    updateHud();
  }
  requestAnimationFrame(frame);
}

const OBS_SEGMENTS = [
  { label: "gyro×0.25", w: 3, color: "#5ec1ff" },
  { label: "重力投影", w: 3, color: "#7dffb0" },
  { label: "指令", w: 3, color: "#ffd75e" },
  { label: "腿位置", w: 12, color: "#b48cff" },
  { label: "腿速度", w: 12, color: "#ff8c5e" },
  { label: "轮速度", w: 4, color: "#5effd8" },
  { label: "上步动作", w: 16, color: "#ff5e8c" },
];

function drawBars(canvas, values, segments) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  let i = 0;
  for (const seg of segments) {
    for (let k = 0; k < seg.w && i < values.length; k += 1, i += 1) {
      const v = values[i];
      const x = (i / values.length) * w;
      const bw = w / values.length - 1;
      const mag = Math.min(1, Math.abs(v) / 2);
      const bh = Math.max(1, mag * (h / 2 - 2));
      ctx.fillStyle = seg.color;
      if (v >= 0) ctx.fillRect(x, h / 2 - bh, bw, bh);
      else ctx.fillRect(x, h / 2, bw, bh);
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
}

function updateHud() {
  const t = sim.telemetry;
  ui.bodyPos.textContent = `x ${t.x.toFixed(2)} · y ${t.y.toFixed(2)} · z ${t.z.toFixed(3)}`;
  ui.inferOut.textContent = `推理 ${t.inferMs.toFixed(1)} ms · 步数 ${t.steps}`;
  ui.clock.textContent = `${(t.steps * POLICY_DT).toFixed(1)} s`;
  ui.fallen.hidden = !t.fallen;
  if (!ui.monitorPanel.hidden) {
    drawBars(ui.actionChart, Array.from(sim.sim.action), [{ label: "a", w: 16, color: "#5ec1ff" }]);
    drawBars(ui.obsChart, Array.from(sim.sim.obs), OBS_SEGMENTS);
    const rows = JOINT_LABELS.map((l, i) =>
      `<div class="av-row"><span>${l}</span><i style="width:${Math.min(100, Math.abs(sim.sim.action[i]) * 20)}%;background:${sim.sim.action[i] >= 0 ? "#5ec1ff" : "#ff5e8c"}"></i><b>${sim.sim.action[i].toFixed(2)}</b></div>`).join("");
    ui.actionValues.innerHTML = rows;
  }
}

// ---- 指令输入 ----
const keys = new Set();
addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  keys.add(e.key.toLowerCase());
  applyKeys();
});
addEventListener("keyup", (e) => { keys.delete(e.key.toLowerCase()); applyKeys(); });

function applyKeys() {
  let vx = 0, vy = 0, wz = 0;
  if (keys.has("w") || keys.has("arrowup")) vx += CMD_LIMITS.vx;
  if (keys.has("s") || keys.has("arrowdown")) vx -= CMD_LIMITS.vx;
  if (keys.has("a") || keys.has("arrowleft")) vy += CMD_LIMITS.vy;
  if (keys.has("d") || keys.has("arrowright")) vy -= CMD_LIMITS.vy;
  if (keys.has("q")) wz += CMD_LIMITS.wz;
  if (keys.has("e")) wz -= CMD_LIMITS.wz;
  if (vx || vy || wz || true) {
    sim.setCommand(vx, vy, wz);
    syncCmdUI();
  }
}

function syncCmdUI() {
  ui.vx.value = sim.command.vx;
  ui.vy.value = sim.command.vy;
  ui.wz.value = sim.command.wz;
  ui.vxOut.textContent = `${sim.command.vx.toFixed(2)} m/s`;
  ui.vyOut.textContent = `${sim.command.vy.toFixed(2)} m/s`;
  ui.wzOut.textContent = `${sim.command.wz.toFixed(2)} rad/s`;
  ui.cmdOut.textContent = `vx ${sim.command.vx.toFixed(2)} · vy ${sim.command.vy.toFixed(2)} · ω ${sim.command.wz.toFixed(2)}`;
}

for (const [el, key] of [[ui.vx, "vx"], [ui.vy, "vy"], [ui.wz, "wz"]]) {
  el.addEventListener("input", () => {
    sim.setCommand(Number(ui.vx.value), Number(ui.vy.value), Number(ui.wz.value));
    syncCmdUI();
  });
}

$("cmdCenter").addEventListener("click", () => { sim.setCommand(0, 0, 0); syncCmdUI(); });

// ---- 按钮 ----
ui.start.addEventListener("click", () => {
  running = !running;
  ui.start.textContent = running ? "暂停" : "开始";
  setState(running ? "运行中" : "已暂停", running ? "run" : "");
});
ui.reset.addEventListener("click", () => { sim.reset(); });
ui.follow.addEventListener("click", () => {
  if (renderer) renderer.follow = !renderer.follow;
  ui.follow.classList.toggle("active", renderer?.follow);
});
ui.policy.addEventListener("change", () => {
  sim.switchPolicy(ui.policy.value);
  const p = POLICIES.find((x) => x.id === ui.policy.value);
  setState(`切换 ${p.label.split(" · ")[0]}（1s 混合）`, "run");
});
ui.terrain.addEventListener("change", () => {
  const t = TERRAINS.find((x) => x.id === ui.terrain.value);
  sim.loadScene(t.file);
  if (renderer) renderer.build();
});
$("cmdToggle").addEventListener("click", () => { ui.cmdPanel.hidden = !ui.cmdPanel.hidden; });
$("monitorToggle").addEventListener("click", () => { ui.monitorPanel.hidden = !ui.monitorPanel.hidden; });

addEventListener("resize", () => {
  if (renderer) renderer.resize(innerWidth, innerHeight);
});

syncCmdUI();
window.__wheelsim = sim; // 调试/自动化测试钩子
window.__wheelrenderer = null;
boot();
