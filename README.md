# zeitvex.github.io

[![License: MIT](https://img.shields.io/badge/License-MIT-5ec1ff.svg)](LICENSE)
[![Pages](https://img.shields.io/badge/GitHub%20Pages-live-4ec98a.svg)](https://zeitvex.github.io)
[![MuJoCo WASM](https://img.shields.io/badge/physics-MuJoCo%20WASM-1769a9.svg)](./playground.html)
[![PWA](https://img.shields.io/badge/PWA-installable-e0b159.svg)](./manifest.json)

个人站点 + **RC_WheelLeg 16DOF 轮足机器人浏览器在线仿真**。纯静态，GitHub Pages 托管，零后端，可安装为 PWA（离线可用）。

## 在线仿真（playground.html）

浏览器内直接运行：

- **物理**：MuJoCo WebAssembly（`assets/vendor/mujoco/`），加载由比赛 MJCF 生成的 `assets/models/scene_*.xml`
- **策略**：纯 JS 手写推理（`assets/js/policy.js`，53→512→256→128→16 Gemm+ELU），权重由 `tools/export_weights.py` 从比赛 ONNX 导出，与 ONNX 输出逐位对拍（maxDiff < 3e-6，见 parity 验证），0.24ms/步
- **渲染**：Three.js，按 MuJoCo 编译位姿逐帧驱动抽稀网格
- **观测/动作契约**：`assets/js/contract.js`，数值与真机部署契约 `sim2real_ros2_v3` 的 `deployment_contract.hpp` 逐项一致（53 维观测、16 维动作、Kp=50/Kd=1.5、默认站姿 hip 0.55 / knee −1.125、策略 50 Hz、物理 200 Hz）
- 观测构建复用 `assets/js/obs/observation_builders.js`（来自 legged_studio 的 zexw_53 契约驱动实现，与 `rc_mjlab/sim2sim.py` 同源）
- HUD 界面移植自 legged_studio 基础仿真（顶栏工具栏、控制面板、速度指令、负载/摩擦/重心/IMU 扰动、姿态仪表、指标网格、底部开关）

### 本地预览

```bash
python -m http.server 8080
# http://localhost:8080/playground.html
```

### 资产构建

```bash
python tools/build_assets.py
```

从 `rc_old/RC_WheelLeg` 重新生成：STL 顶点聚类抽稀（42.4 MB → 0.21 MB 渲染数据）、
浏览器版 MJCF（执行器与碰撞按部署契约改写）、四种比赛地形场景、复制双策略 ONNX。

## 目录

```text
├─ index.html             # 落地页（项目介绍 + 嵌入仿真）
├─ playground.html        # 在线仿真页
├─ assets/
│  ├─ css/                # 站点与试玩区样式
│  ├─ js/                 # 引擎 / 渲染 / UI / 契约 / 观测模块
│  ├─ models/             # MJCF 场景、抽稀网格、比赛策略 ONNX
│  ├─ media/              # 真机视频与图片
│  └─ vendor/             # mujoco_wasm、onnxruntime-web、three（本地化，CDN 无关）
└─ tools/build_assets.py  # 资产构建脚本
```

## 验证

`_validate/rollout.mjs`（工作区外）在 Node 中以同一管线跑通端到端 rollout：
静立 6 s 姿态稳定、vx=0.6 m/s 指令下稳定行走、高墙策略在 0.30 m 墙地形真实攀爬。

## 许可

站点代码 MIT。MuJoCo（Apache-2.0）、onnxruntime-web（MIT）、three.js（MIT）保留上游许可。
机器人模型、策略权重与媒体文件版权归 zeitvex 所有。
