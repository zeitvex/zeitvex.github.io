# zeitvex.github.io

[![License: MIT](https://img.shields.io/badge/License-MIT-5ec1ff.svg)](LICENSE)
[![Pages](https://img.shields.io/badge/GitHub%20Pages-live-4ec98a.svg)](https://zeitvex.github.io)
[![MuJoCo WASM](https://img.shields.io/badge/physics-MuJoCo%20WASM-1769a9.svg)](./playground.html)
[![PWA](https://img.shields.io/badge/PWA-installable-e0b159.svg)](./manifest.json)

时维（zeitvex）的个人主页：机器人 / 嵌入式 / 强化学习工程师。站点同时包含 **RC_WheelLeg 16DOF 轮足机器人**深度技术页与浏览器在线仿真。纯静态、零后端，GitHub Pages 托管。

> 隐私说明：站点与 README 仅使用网名「时维 / zeitvex」，不公开真实姓名、手机号或含个人信息的简历文件。

## 页面

| 路径 | 内容 |
| --- | --- |
| `index.html` | 个人主页：项目、开源文档、奖项、时间轴、技术栈、作品集、简历邮件索取 |
| `rc-wheelleg.html` | RC_WheelLeg 深度页：系统契约、双策略、训练地形、Sim2Real 演进、实机视频 |
| `playground.html` | MuJoCo WASM 在线仿真，支持策略 / 地形切换、速度指令与扰动注入 |
| `404.html` | 静态 404 |

主页结构、双语机制、明暗主题与卡片布局参考并适配自 [Lain-Ego0/Lain-Ego0.github.io](https://github.com/Lain-Ego0/Lain-Ego0.github.io) 的个人主页模板。

## 技术

- **纯静态单页**：HTML5 + CSS3 + 原生 JavaScript（ES6+），无构建步骤、无框架。
- **数据驱动**：项目、文档、奖项、时间轴、技术栈、作品集、联系链接均定义在 `assets/js/main.js` 顶部数组中。
- **中英双语**：`lang/zh.json` / `lang/en.json` + `data-i18n` 属性，语言选择写入 `localStorage`。
- **明暗主题**：CSS 自定义属性 + `localStorage`，默认浅色，支持系统 `prefers-reduced-motion`。
- **响应式**：桌面、平板、手机；项目卡、时间轴、技能网格与作品集瀑布流自适应。
- **作品集灯箱**：点击图片放大，支持键盘 `Esc` / `←` / `→`。
- **SEO / 分享**：Canonical、Open Graph、Twitter Card、JSON-LD Person、`sitemap.xml`、`robots.txt`。
- **PWA**：`manifest.json` + `sw.js`；导航请求网络优先，静态资产缓存优先，升级后不会继续返回旧首页。

## 目录

```text
├─ index.html                  # 个人主页
├─ rc-wheelleg.html            # RC_WheelLeg 深度页
├─ playground.html             # 在线仿真
├─ 404.html
├─ lang/
│  ├─ zh.json                  # 中文文案
│  └─ en.json                  # 英文文案
├─ assets/
│  ├─ css/
│  │  ├─ style.css             # 主页设计系统
│  │  ├─ site.css              # RC_WheelLeg 深度页
│  │  └─ lain-playground.css   # 仿真 HUD
│  ├─ js/
│  │  ├─ main.js               # 数据与主页渲染
│  │  ├─ i18n.js               # 语言加载与切换
│  │  └─ ...                   # 仿真引擎 / 渲染 / 策略
│  ├─ images/
│  │  ├─ avatar.webp
│  │  ├─ og-cover.jpg
│  │  ├─ covers/               # 项目封面
│  │  └─ portfolio/            # 作品集图片
│  ├─ models/                  # MJCF 场景、抽稀网格、策略权重
│  ├─ media/                   # 真机视频与图片
│  └─ vendor/                  # mujoco_wasm、onnxruntime-web、three
└─ tools/build_assets.py       # 仿真资产构建脚本
```

## 本地预览

```bash
python -m http.server 8080
# http://localhost:8080/
```

不要直接双击 `index.html`：语言包通过 `fetch` 加载，`file://` 下会被浏览器拦截。

## 内容维护

1. **文字**：修改 `lang/zh.json` 与 `lang/en.json`，两边的 key 必须保持一致。
2. **项目 / 文档 / 奖项 / 时间轴 / 技术栈 / 作品集**：修改 `assets/js/main.js` 顶部的 `PROJECTS`、`DOCUMENTS`、`AWARDS`、`TIMELINE_EVENTS`、`TECH_STACK`、`GALLERY`、`STATS`、`CONTACT_LINKS`。
3. **图片**：项目封面放在 `assets/images/covers/`，作品集放在 `assets/images/portfolio/`；建议 WebP，宽度 1200–1400 px。
4. **简历**：站点不托管含真名/手机号的 PDF，当前通过邮箱索取；如需改为公开下载，请使用脱敏版并同步更新 `index.html` 与 `assets/js/main.js` 中的链接。
5. **主题色 / 字体 / 圆角**：修改 `assets/css/style.css` 顶部的 CSS 变量。
6. **SEO**：更新 `index.html` 的 title、description、Canonical、Open Graph，以及 `sitemap.xml` 中的日期。

## 在线仿真

`playground.html` 在浏览器内直接运行：

- **物理**：MuJoCo WebAssembly，加载由比赛 MJCF 生成的 `assets/models/scene_*.xml`
- **策略**：纯 JS 推理（`assets/js/policy.js`，53→512→256→128→16），权重由 `tools/export_weights.py` 从比赛 ONNX 导出，与 ONNX 输出逐位对拍
- **渲染**：Three.js，按 MuJoCo 编译位姿逐帧驱动抽稀网格
- **契约**：`assets/js/contract.js` 与真机部署契约 `sim2real_ros2_v3` 一致（53 维观测、16 维动作、Kp=50/Kd=1.5、策略 50 Hz、物理 200 Hz）
- **HUD**：策略 / 地形切换、速度指令、负载 / 摩擦 / 重心 / IMU 扰动、姿态仪表与实时指标

仿真资产构建：

```bash
python tools/build_assets.py
```

## 部署

GitHub Pages：仓库 `Settings → Pages → Deploy from a branch`，选择 `master` 与 `/ (root)`。

推送后若浏览器仍显示旧首页，是旧版 Service Worker 的缓存：刷新一次让新 `sw.js` 接管，或在 DevTools → Application → Service Workers 中选择 *Update on reload* / *Unregister*。

## 许可

站点代码 MIT。主页模板结构参考 [Lain-Ego0/Lain-Ego0.github.io](https://github.com/Lain-Ego0/Lain-Ego0.github.io)。MuJoCo（Apache-2.0）、onnxruntime-web（MIT）、three.js（MIT）保留上游许可。机器人模型、策略权重、照片与视频版权归 zeitvex 所有。
