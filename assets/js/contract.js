// RC_WheelLeg 浏览器仿真契约常量。
// 数值来源（按优先级）：
//   1. RC_WheelLeg/05_software/real/sim2real_ros2_v3/.../deployment_contract.hpp
//      （真机部署 C++ 契约：kLegKp/kLegKd/kWheelKd/kActionScale/kDefaultDofPos/kPolicyHz）
//   2. rc_mjlab/src/robot/robot_cfg.py + config/env_cfgs.py（训练配置）
//   3. legged_studio/assets/robots/zex-w/simulation/config.json（观测布局声明）
// 观测构建复用 legged_studio 的 obs/observation_builders.js（zexw_53 布局，
// 与 rc_mjlab/sim2sim.py 同源），Node 端到端 rollout 已验证可行。

export const JOINT_ORDER = [
  "fl_hip_abduction_joint", "fl_hip_pitch_joint", "fl_knee_joint",
  "fr_hip_abduction_joint", "fr_hip_pitch_joint", "fr_knee_joint",
  "rl_hip_abduction_joint", "rl_hip_pitch_joint", "rl_knee_joint",
  "rr_hip_abduction_joint", "rr_hip_pitch_joint", "rr_knee_joint",
  "fl_wheel_joint", "fr_wheel_joint", "rl_wheel_joint", "rr_wheel_joint",
];

export const JOINT_LABELS = [
  "FL 外展", "FL 髋俯仰", "FL 膝",
  "FR 外展", "FR 髋俯仰", "FR 膝",
  "RL 外展", "RL 髋俯仰", "RL 膝",
  "RR 外展", "RR 髋俯仰", "RR 膝",
  "FL 轮", "FR 轮", "RL 轮", "RR 轮",
];

export const ACTION_SCALE = [
  0.125, 0.25, 0.25, 0.125, 0.25, 0.25, 0.125, 0.25, 0.25, 0.125, 0.25, 0.25,
  5.0, 5.0, 5.0, 5.0,
];

export const DEFAULT_POSE = [
  0.0, 0.55, -1.125, 0.0, 0.55, -1.125, 0.0, 0.55, -1.125, 0.0, 0.55, -1.125,
  0.0, 0.0, 0.0, 0.0,
];

export const CONTROL_MODES = [
  ...Array(12).fill("position"), ...Array(4).fill("velocity"),
];

export const OBS_LAYOUT = [
  { source: "ang_vel", width: 3, scale: "@contract" },
  { source: "gravity" },
  { source: "cmd", width: 3, scale: "@contract" },
  { source: "joint_pos", width: 12, mode: "position", scale: "@contract" },
  { source: "joint_vel", width: 12, mode: "position", scale: "@contract" },
  { source: "joint_vel", width: 4, mode: "velocity", scale: "@contract" },
  { source: "action" },
];

export const OBS_SCALES = { angVel: 0.25, dofPos: 1.0, dofVel: 0.05, cmd: [1, 1, 1] };

export const PHYSICS_DT = 0.005;   // 200 Hz（env_cfgs.py: timestep=0.005）
export const DECIMATION = 4;       // 控制降采样
export const POLICY_DT = 0.02;     // 50 Hz 策略周期
export const INIT_HEIGHT = 0.42;   // 初始机身高度
export const SETTLE_STEPS = 250;   // 落地沉降步数（约 0.6 s）
export const BLEND_STEPS = 50;     // 策略切换线性混合步数（1.0 s @ 50Hz）
export const CMD_LIMITS = { vx: 2.0, vy: 2.0, wz: 2.0 };  // 指令上限统一 2.0，默认赋值 1.0
export const CLIP_OBS = 100.0;

export const POLICIES = [
  { id: "rough", label: "Rough 主策略 · model_6800", file: "model_6800.onnx", note: "比赛最终 Rough 策略（1050 分部署件）" },
  { id: "wall", label: "高墙策略 · model_84", file: "model_84.onnx", note: "Robocon 高墙专用策略" },
];

export const TERRAINS = [
  { id: "flat", label: "平地", file: "scene_flat.xml" },
  { id: "stairs", label: "台阶", file: "scene_stairs.xml" },
  { id: "rough", label: "粗糙网格", file: "scene_rough.xml" },
  { id: "wall", label: "五道高墙", file: "scene_wall.xml" },
];

export function makeConfig() {
  return {
    numObs: 53,
    numActions: 16,
    observationKind: "zexw_53",
    observationLayout: OBS_LAYOUT,
    angVelScale: OBS_SCALES.angVel,
    dofPosScale: OBS_SCALES.dofPos,
    dofVelScale: OBS_SCALES.dofVel,
    cmdScale: OBS_SCALES.cmd,
    defaultAngles: DEFAULT_POSE,
    controlModes: CONTROL_MODES,
    policyJointSlots: null,
    clipObs: CLIP_OBS,
  };
}
