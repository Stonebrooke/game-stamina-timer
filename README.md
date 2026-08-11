# 游戏体力计时器

一款基于 **Tauri 2 + React + TypeScript** 的桌面小工具，用于追踪多个游戏的体力恢复进度。所有计算基于**时间戳被动推算**，关掉软件、休眠、甚至改系统时间都不会算错——重新打开时按「已流失时间 ÷ 每点恢复耗时」直接给出当前体力。

窗口关闭后常驻系统托盘，体力回满或到达指定里程碑时**本地弹窗提醒**（不打扰、不联网）。

---

## ✨ 功能特性

- **多游戏并行计时**：每个游戏独立配置「每点恢复耗时」「体力上限」「当前体力」。
- **被动时间戳推算**：只存一个锚点时间戳，离线 / 休眠 / 时钟回拨都安全（钳制在 `[0, 上限]`）。
- **本地通知（托盘常驻）**：由 Rust 后端线程每 30 秒轮询，窗口隐藏也不漏通知；同一里程碑只提醒一次，长睡眠后合并为单条。
- **相对锚点 N 点提醒**：按「距锚点每 N 点」触发（而非绝对整点），更贴合实际玩法。
- **导入 / 导出 JSON**：一键备份与迁移你的计时器配置。
- **开机自启**：系统设置里开关。
- **快捷 ±N 调整**：卡片上一键增减当前体力（步长 = 提醒间隔或 10）。
- **全部恢复时间轴**：用 SVG 时间轴标出每个游戏「回满时刻」与当前进度游标。
- **内置游戏预设**：常用游戏体力参数一键填入。

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
│   ├── tauri.conf.json     # 应用配置（窗口、CSP、打包目标）
│   └── tauri.build.conf.json
├── scripts/gen_icon.py     # 图标生成脚本
├── assets/icon.png         # 源图标
├── index.html
├── package.json            # 前端依赖与脚本
├── tsconfig.json / vite.config.ts
└── .gitignore
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
npm run dev          # Vite 开发服务器（localhost:1420）
npm run test         # 运行前端单元测试（Vitest）
npm run build        # tsc 类型检查 + vite 生产构建
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

## 📄 开源协议

[MIT](./LICENSE) © 2026 cstg5
