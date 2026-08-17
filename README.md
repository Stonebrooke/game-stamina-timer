# 游戏体力计时器 · Game Stamina Timer

> 基于时间戳被动推算的多游戏体力恢复计时器。关掉软件、休眠、甚至改系统时间都不会算错——重新打开时按「已流失时间 ÷ 每点恢复耗时」直接给出当前体力。窗口关闭后常驻系统托盘，体力回满或到达里程碑时本地弹窗提醒（不联网、不打扰）。

[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6)](https://www.microsoft.com/)
[![Framework](https://img.shields.io/badge/Framework-Tauri%202-24C8DB)](https://v2.tauri.app/)
[![Frontend](https://img.shields.io/badge/Frontend-React%2018-61DAFB)](https://react.dev/)
[![Language](https://img.shields.io/badge/Language-Rust%20%2B%20TypeScript-dea584)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)
[![Version](https://img.shields.io/badge/Version-0.2.1-brightgreen)](./package.json)

---

## ✨ 功能特性

- **多游戏并行计时** — 每个游戏独立配置「每点恢复耗时 / 体力上限 / 当前体力」。
- **被动时间戳推算** — 只存一个锚点时间戳；离线、休眠、时钟回拨都安全（结果钳制在 `[0, 上限]`）。
- **本地通知（托盘常驻）** — 由 Rust 后端线程每 30 秒轮询，**窗口隐藏也不漏通知**；同一里程碑只提醒一次，长睡眠后合并为单条。
- **相对锚点 N 点提醒** — 按「距锚点每 N 点」触发（而非绝对整点），贴合实际玩法。
- **导入 / 导出 JSON** — 一键备份与迁移计时器配置（含路径安全校验与体积上限）。
- **开机自启** — 系统设置内开关。
- **快捷 ±N 调整** — 卡片上一键增减当前体力（步长 = 提醒间隔或 10）。
- **全部恢复时间轴** — SVG 时间轴标出每个游戏「回满时刻」与当前进度游标。
- **内置游戏预设** — 常用游戏体力参数一键填入。
- **健壮的存档层** — 存档损坏时带时间戳备份并回退空库；写入走 `tmp → rename` 原子替换 + `fsync`；写命令失败自动回滚内存。

---

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 桌面外壳 | Tauri 2（Rust） |
| 前端 | React 18 + TypeScript + Vite |
| 状态管理 | Zustand |
| 后端逻辑 | Rust（`commands.rs` / `timer.rs` / `store.rs` / `lib.rs`） |
| 打包 | NSIS（Windows 安装包） |

---

## 📁 项目结构

```
游戏体力计时器/
├── src/                    # 前端（React + TS）
│   ├── api/timers.ts       # Tauri 命令封装（浏览器环境自动降级为 localStorage mock）
│   ├── components/         # 计时卡片、时间轴、设置弹窗等
│   ├── lib/                # 计时纯函数 + 预设 + 类型
│   ├── store/              # Zustand 状态
│   └── styles/             # 浅色主题样式
├── src-tauri/              # 后端（Rust）
│   ├── src/                # commands / timer / store / lib
│   ├── icons/              # 全套应用图标（含 android / ios）
│   ├── capabilities/       # Tauri 权限声明
│   ├── Cargo.toml / Cargo.lock
│   └── tauri.conf.json     # 应用配置（窗口、CSP、打包目标）
├── scripts/
│   ├── gen_icon.py         # 图标生成脚本
│   └── check-contract.mjs  # 双源契约校验（Rust⇄TS 字段/色板，CI 门禁）
├── assets/icon.png         # 源图标
├── index.html
├── package.json            # 前端依赖与脚本
├── tsconfig.json / vite.config.ts
├── LICENSE / README.md / .gitignore / .gitattributes
```

> 仓库刻意**不提交** `node_modules/`、`dist/`、`.workbuddy/` 与 `src-tauri/target/`（编译产物），详见 `.gitignore`。

---

## 🚀 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) 18+
- [Rust 工具链](https://www.rust-lang.org/tools/install)（含 `cargo`）
- [Tauri 2  prerequisites](https://v2.tauri.app/start/prerequisites/)：Windows 需安装 **Visual Studio Build Tools（含 MSVC）** 与 **WebView2**（Win11 自带）

### 安装依赖

```bash
npm install
```

### 开发模式（热重载，独立窗口）

```bash
npm run tauri dev
```

### 仅前端开发预览

```bash
npm run dev      # Vite 开发服务器（localhost:1420）
npm run test     # 运行前端单元测试（Vitest，36 用例）
npm run build    # tsc 类型检查 + vite 生产构建
```

---

## 📦 构建与安装包

```bash
npm run tauri build
```

成功后安装包位于：

```
src-tauri/target/release/bundle/nsis/游戏体力计时器_0.2.1_x64-setup.exe
```

双击即可安装。应用数据（计时器配置）保存在系统应用数据目录下的 `timers.json`，卸载不会删除该文件。

---

## 🧪 测试

| 层 | 命令 | 覆盖 |
|----|------|------|
| 前端 | `npm run test` | 计时纯函数、脏数据防御、store 契约（36 用例） |
| 后端 | `cargo test`（在 `src-tauri/` 下） | 校验、通知去重、原子写回滚、重锚逻辑、配色校验（21 用例） |

---

## 🗺 路线图

- [ ] 跨平台（macOS / Linux）打包
- [ ] 通知音效与自定义文案
- [ ] 多语言界面
- [ ] 云同步（可选，需用户授权）

---

## 📄 开源协议

[MIT](./LICENSE) © 2026 Stonebrooke
