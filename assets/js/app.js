// UI 驱动：LainLab playground 外壳 + RC_WheelLeg 静态引擎（双端：桌面键鼠 / 手机摇杆）。
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
  start: $("start"), reset: $("reset"), fallen: $("fallenBadge"),
  cmdPanel: $("cmdPanel"), monitorPanel: $("monitorPanel"), terrainPanel: $("terrainPanel"),
  commandOut: $("command"), clock: $("clock"),
  bodyPos: $("bodyPosition"), contactOut: $("contactCount"), inferOut: $("inferOut"),
  actionChart: $("actionChart"), actionValues: $("actionValues"), obsChart: $("obsChart"),
  leftValue: $("leftJoystickValue"), rightValue: $("rightJoystickValue"),
  liveVx: $("commandVxValue"), liveVy: $("commandVyValue"), liveWz: $("commandYawValue"),
};

// 指令状态：摇杆优先，其次键盘
const assign = { vx: 0.6, vy: 0.5, wz: 0.6 };
const joy = { vx: 0, vy: 0, wz: 0, active: false };
const keys = new Set();

function setState(text, cls) {
  ui.state.textContent = text;
  ui.state.className = `pill ${cls || ""}`.trim();
}

function currentCommand() {
  if (joy.active) return { vx: joy.vx, vy: joy.vy, wz: joy.wz };
  let vx = 0, vy = 0, wz = 0;
  if (keys.has("w") || keys.has("arrowup")) vx += assign.vx;
  if (keys.has("s") || keys.has("arrowdown")) vx -= assign.vx;
  if (keys.has("a") || keys.has("arrowleft")) vy += assign.vy;
  if (keys.has("d") || keys.has("arrowright")) vy -= assign.vy;
  if (keys.has("q")) wz += assign.wz;
  if (keys.has("e")) wz -= assign.wz;
  return { vx, vy, wz };
}

function syncCommandUI() {
  const c = sim.command;
  ui.commandOut.textContent = `vx ${c.vx.toFixed(2)} · vy ${c.vy.toFixed(2)} · ω ${c.wz.toFixed(2)}`;
  ui.liveVx.textContent = `${c.vx.toFixed(2)} m/s`;
  ui.liveVy.textContent = `${c.vy.toFixed(2)} m/s`;
  ui.liveWz.textContent = `${c.wz.toFixed(2)} rad/s`;
  ui.leftValue.textContent = `vx ${c.vx.toFixed(2)} · vy ${c.vy.toFixed(2)}`;
  ui.rightValue.textContent = `ω ${c.wz.toFixed(2)}`;
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
    renderer.fitView();
    ui.boot.hidden = true;
    for (const p of POLICIES) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.label;
      ui.policy.appendChild(o);
    }
    {
      const o = document.createElement("option");
      o.value = "off";
      o.textContent = "无策略（姿态保持）";
      ui.policy.appendChild(o);
    }
    for (const t of TERRAINS) {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.label;
      ui.terrain.appendChild(o);
    }
    for (const id of ["start", "reset", "cmdToggle", "monitorToggle", "terrainToggle", "policySelect", "terrainSelect"]) {
      $(id).disabled = false;
    }
    setRunning(true); // 自动运行（与 LainLab playground 一致）
    requestAnimationFrame(frame);
  } catch (err) {
    ui.bootStage.textContent = `启动失败: ${err.message}`;
    console.error(err);
  }
}

async function frame(now) {
  const dt = lastTs ? Math.min(0.1, (now - lastTs) / 1000) : 0;
  lastTs = now;
  if (running) {
    const c = currentCommand();
    sim.setCommand(c.vx, c.vy, c.wz);
    syncCommandUI();
    acc += dt;
    let n = 0;
    while (acc >= POLICY_DT && n < 6) {
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
  { w: 3, color: "#5ec1ff" }, { w: 3, color: "#7dffb0" }, { w: 3, color: "#ffd75e" },
  { w: 12, color: "#b48cff" }, { w: 12, color: "#ff8c5e" }, { w: 4, color: "#5effd8" },
  { w: 16, color: "#ff5e8c" },
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
  ui.contactOut.textContent = String(t.contacts || 0);
  ui.inferOut.textContent = `${t.inferMs.toFixed(1)} ms`;
  ui.clock.textContent = `${(t.steps * POLICY_DT).toFixed(1)} s`;
  ui.fallen.hidden = !t.fallen;
  if (!ui.monitorPanel.hidden) {
    drawBars(ui.actionChart, Array.from(sim.sim.action), [{ w: 16, color: "#5ec1ff" }]);
    drawBars(ui.obsChart, Array.from(sim.sim.obs), OBS_SEGMENTS);
    ui.actionValues.innerHTML = JOINT_LABELS.map((l, i) =>
      `<div class="av-row"><span>${l}</span><i style="width:${Math.min(100, Math.abs(sim.sim.action[i]) * 20)}%;background:${sim.sim.action[i] >= 0 ? "#5ec1ff" : "#ff5e8c"}"></i><b>${sim.sim.action[i].toFixed(2)}</b></div>`).join("");
  }
}

// ---- 播放 / 策略 / 地形 ----
function setRunning(v) {
  running = v;
  ui.start.textContent = v ? "暂停" : "开始";
  setState(v ? "运行中" : "已暂停", v ? "run" : "");
}
ui.start.addEventListener("click", () => setRunning(!running));
ui.reset.addEventListener("click", () => { sim.reset(); renderer && renderer.clearTrail(); });

ui.policy.addEventListener("change", async () => {
  const id = ui.policy.value;
  if (id !== "off") await sim.ensurePolicy(id); // 首次切换按需拉权重（约 0.7 MB）
  sim.switchPolicy(id);
  const p = POLICIES.find((x) => x.id === id);
  ui.policy.title = p && p.note ? p.note : "";
  if (id === "off") setState("姿态保持", "");
  else setState(`${p ? p.label.split(" · ")[0] : id}${sim._blend ? "（1s 混合）" : ""}`, "run");
});
ui.terrain.addEventListener("change", () => {
  const t = TERRAINS.find((x) => x.id === ui.terrain.value);
  sim.loadScene(t.file);
  if (renderer) { renderer.build(); renderer.clearTrail(); }
  for (const b of document.querySelectorAll("[data-terrain-preset]")) {
    b.classList.toggle("active", b.dataset.terrainPreset === t.id);
  }
  $("terrainHint").textContent = `当前：${t.label}。${t.id === "wall" ? "高墙地形请搭配「高墙 · model_84」策略。" : ""}`;
});

// ---- 键盘 ----
addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === " ") { e.preventDefault(); setRunning(!running); return; }
  if (k === "r") { sim.reset(); renderer && renderer.clearTrail(); return; }
  keys.add(k);
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());

// ---- 虚拟摇杆（触屏 / 鼠标） ----
function bindJoystick(baseId, knobId, onChange) {
  const base = $(baseId), knob = $(knobId);
  let owner = null;
  const apply = (e) => {
    const r = base.getBoundingClientRect();
    const dx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
    const dy = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    const max = Math.min(r.width, r.height) * 0.3;
    knob.style.transform = `translate(${dx * max}px, ${dy * max}px)`;
    onChange(dx, dy);
  };
  base.addEventListener("pointerdown", (e) => {
    base.setPointerCapture(e.pointerId);
    owner = e.pointerId;
    joy.active = true;
    apply(e);
    e.preventDefault();
  });
  base.addEventListener("pointermove", (e) => { if (owner === e.pointerId) apply(e); });
  const release = (e) => {
    if (owner !== e.pointerId) return;
    owner = null;
    joy.active = false;
    knob.style.transform = "";
    onChange(0, 0);
  };
  base.addEventListener("pointerup", release);
  base.addEventListener("pointercancel", release);
}
bindJoystick("leftJoystick", "leftKnob", (dx, dy) => {
  joy.vx = -dy * assign.vx;
  joy.vy = -dx * assign.vy;
});
bindJoystick("rightJoystick", "rightKnob", (dx) => {
  joy.wz = dx * assign.wz;
});

// ---- 指令赋值面板 ----
for (const [id, key, out] of [["commandSpeedVx", "vx", "commandSpeedVxValue"], ["commandSpeedVy", "vy", "commandSpeedVyValue"], ["commandSpeedYaw", "wz", "commandSpeedYawValue"]]) {
  const el = $(id);
  el.addEventListener("input", () => {
    assign[key] = Number(el.value);
    $(out).textContent = `${assign[key].toFixed(2)} ${key === "wz" ? "rad/s" : "m/s"}`;
  });
}
$("commandStop").addEventListener("click", () => {
  keys.clear();
  joy.vx = 0; joy.vy = 0; joy.wz = 0; joy.active = false;
  sim.setCommand(0, 0, 0);
  syncCommandUI();
});

// ---- 面板开关 ----
$("cmdToggle").addEventListener("click", () => { ui.cmdPanel.hidden = !ui.cmdPanel.hidden; });
$("monitorToggle").addEventListener("click", () => { ui.monitorPanel.hidden = !ui.monitorPanel.hidden; });
$("terrainToggle").addEventListener("click", () => { ui.terrainPanel.hidden = !ui.terrainPanel.hidden; });
$("cmdClose").addEventListener("click", () => { ui.cmdPanel.hidden = true; });
$("monitorClose").addEventListener("click", () => { ui.monitorPanel.hidden = true; });
$("terrainClose").addEventListener("click", () => { ui.terrainPanel.hidden = true; });
for (const b of document.querySelectorAll("[data-terrain-preset]")) {
  b.addEventListener("click", () => {
    ui.terrain.value = b.dataset.terrainPreset;
    ui.terrain.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// ---- 面板拖拽（Lain 同款：按住标题拖动） ----
for (const panel of [ui.cmdPanel, ui.monitorPanel, ui.terrainPanel]) {
  const head = panel.querySelector(".panel-heading");
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  head.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    dragging = true;
    head.setPointerCapture(e.pointerId);
    sx = e.clientX; sy = e.clientY;
    const r = panel.getBoundingClientRect();
    ox = r.left; oy = r.top;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.left = `${ox}px`;
    panel.style.top = `${oy}px`;
  });
  head.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    panel.style.left = `${ox + e.clientX - sx}px`;
    panel.style.top = `${oy + e.clientY - sy}px`;
  });
  head.addEventListener("pointerup", () => { dragging = false; });
}

addEventListener("resize", () => { if (renderer) renderer.resize(innerWidth, innerHeight); });

window.__wheelsim = sim; // 调试/自动化测试钩子
boot();
