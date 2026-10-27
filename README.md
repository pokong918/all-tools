# 🧰 All-Tools

**English** | [简体中文](#简体中文)

> A local tools hub that downloads popular GitHub tools into one desktop app — discover, run and manage them all in a single window. Fully offline once downloaded.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6.svg)](https://github.com/pokong918/all-tools/releases)
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://www.electronjs.org/)

## ✨ Features

- **Discover** — Built-in catalog synced from GitHub: high-star & trending tools across all categories (AI, dev tools, design, docs, utilities…), searchable and filterable locally.
- **One-click acquire** — Tools are downloaded straight into this project (`tools/`) via `git clone --depth 1` or a zip fallback with mirror acceleration. Community tools are **auto-adapted**: the host detects the stack (Node web app / Python web app / Docker / static site / CLI) and generates a run manifest locally — zero API cost.
- **Run in-app** — Web tools open inside the host window (embedded webview); CLI tools open in an embedded terminal (xterm.js). Health-checked startup, automatic port allocation, process-tree cleanup on exit.
- **Fully offline** — Everything runs locally after download. No cloud dependency.
- **Unified management** — Start / stop / update / remove, disk usage dashboard with dependency cleanup, favorites & recent, system-tray shortcuts.
- **Zero-requirement distribution** — Bundles its own Node runtime. End users need nothing installed (no Node, no Git, no Python unless a specific tool requires it).

## 🚀 Quick Start

### For users

Download from [Releases](https://github.com/pokong918/all-tools/releases):

- `All-Tools-Setup-x.y.z.exe` — NSIS installer
- `All-Tools-Portable-x.y.z.exe` — portable, no installation

First launch guides you through choosing a data drive, optionally adding a GitHub token, and syncing the catalog.

### For developers

```bash
cd host
npm install        # uses npmmirror via .npmrc
npm run dev        # dev mode: tools land in <repo>/tools, data in <repo>/data
```

Requirements: Node ≥ 18, npm. Git / Python / Docker are optional (zip download fallback / Python & Docker tools only).

## 🧩 How it works

```
all-tools/
├── host/          Electron host app (electron-vite + Vue 3 + TypeScript)
├── manifests/     Official tool adaptation manifests (the only adaptation contract)
├── tools/         Downloaded tools (git-ignored)
├── data/          State: installed tools, prefs, catalog cache, auto-manifests (git-ignored)
└── dist/          Packaging output (git-ignored)
```

Each tool is described by a JSON **manifest** (repo, install/start commands, port, health check). The host executes it through a type-specific **runner** (`web-node` / `web-static` / `web-python` / `docker` / `cli`). Community tools get their manifest generated automatically after download by inspecting the repository contents. See [manifests/SCHEMA.md](./manifests/SCHEMA.md).

## 📦 Build & distribute

```bash
cd host
npm run dist       # NSIS installer + portable exe → ../dist
npm run dist:dir   # unpacked directory build (fastest verification)
```

The build auto-downloads a Node 20 sidecar (npmmirror) and bundles the official manifests, so the produced packages run on machines with zero dev environment. Requires `electron-builder ≥ 26` on the build machine.

## 🗺️ Roadmap

- [x] M1 — host shell, manifests, web-node/web-static runners, lifecycle & process management
- [x] M2 — GitHub catalog sync, auto-adaptation, python/docker/cli runners, updates, storage dashboard, packaging (NSIS/portable), first-run wizard, remote manifest sync
- [x] M3 — app icon, manifest visual editor (local overrides), multi-tab usage, data-directory migration, export/import backup, desktop-tool runner
- [ ] M4 — macOS/Linux, community manifest contributions, shared dependency cache

## 🤝 Contributing

Issues and PRs are welcome — especially new tool manifests (`manifests/tools/*.json`, follow [SCHEMA.md](./manifests/SCHEMA.md)).

## 📄 License

[MIT](./LICENSE)

---

# 简体中文

[English](#english) | **简体中文**

> 本地工具集线器：把 GitHub 热门工具下载到本地一个桌面应用里——在同一个窗口中发现、运行、管理所有工具。下载后完全离线可用。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6.svg)](https://github.com/pokong918/all-tools/releases)
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://www.electronjs.org/)

## ✨ 功能特性

- **发现** — 内置工具目录，从 GitHub 同步高星/新晋工具（AI、开发、设计、文档、生活实用……各行业分类），本地搜索与筛选。
- **一键获取** — 工具直接下载进本项目（`tools/`），`git clone --depth 1` 优先、zip 兜底并支持镜像加速。社区工具**自动适配**：宿主下载后本地识别技术栈（Node Web / Python Web / Docker / 静态站点 / 命令行）并生成运行清单，零 API 消耗。
- **应用内使用** — Web 类工具在宿主窗口内嵌打开；命令行工具进入内嵌终端（xterm.js）。启动带健康检查、自动分配端口、退出清理进程树。
- **完全离线** — 下载完成后全部本地运行，不依赖任何在线服务。
- **统一管理** — 启动/停止/更新/移除、磁盘占用看板与依赖清理、收藏与最近使用、系统托盘快捷入口。
- **零环境分发** — 安装包内置 Node 运行时，目标机器无需预装任何开发环境（Python/Docker 仅特定类型工具需要）。

## 🚀 快速开始

### 普通用户

从 [Releases](https://github.com/pokong918/all-tools/releases) 下载：

- `All-Tools-Setup-x.y.z.exe` — NSIS 安装包
- `All-Tools-Portable-x.y.z.exe` — 免安装便携版

首次启动引导选择数据盘、可选填写 GitHub Token 并同步目录。

### 开发者

```bash
cd host
npm install        # .npmrc 已配置国内镜像
npm run dev        # 开发态：工具落仓库 tools/，数据落 data/
```

要求 Node ≥ 18 与 npm；Git/Python/Docker 可选（无 Git 自动走 zip 下载；Python、Docker 仅对应类型工具需要）。

## 🧩 工作原理

```
all-tools/
├── host/          宿主应用（Electron + electron-vite + Vue 3 + TypeScript）
├── manifests/     官方工具适配清单（唯一适配契约）
├── tools/         已下载工具（gitignore）
├── data/          状态数据：已装工具、偏好、目录缓存、自动适配清单（gitignore）
└── dist/          打包产物（gitignore）
```

每个工具由一份 JSON **清单**（manifest）描述（仓库地址、安装/启动命令、端口、健康检查），宿主按类型分派到对应**运行器**（`web-node` / `web-static` / `web-python` / `docker` / `cli`）执行。社区工具下载后由宿主检查仓库内容自动生成清单，规范见 [manifests/SCHEMA.md](./manifests/SCHEMA.md)。

## 📦 打包分发

```bash
cd host
npm run dist       # 产出 NSIS 安装包 + 便携版 → ../dist
npm run dist:dir   # 仅产出目录版（最快验证）
```

构建时自动下载 Node 20 sidecar（npmmirror）并内置官方清单，产物可在无任何开发环境的机器上运行。打包机需 `electron-builder ≥ 26`。

## 🗺️ 路线图

- [x] M1 — 宿主壳、Manifest 规范、web-node/web-static 运行器、生命周期与进程管理
- [x] M2 — GitHub 目录同步、自动适配、python/docker/cli 运行器、工具更新、磁盘看板、打包分发（NSIS/便携版）、首次启动向导、清单远程同步
- [x] M3 — 应用图标、Manifest 可视化编辑（本地覆盖）、多标签使用、数据目录迁移、导出/导入备份、桌面程序运行器
- [ ] M4 — macOS/Linux、社区清单共建、共享依赖缓存

## 🤝 参与贡献

欢迎 Issue 与 PR——尤其欢迎新的工具适配清单（`manifests/tools/*.json`，规范见 [SCHEMA.md](./manifests/SCHEMA.md)）。

## 📄 许可证

[MIT](./LICENSE)
