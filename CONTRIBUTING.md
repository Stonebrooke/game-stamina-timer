# 贡献指南（CONTRIBUTING）

感谢为本项目（游戏体力计时器 / Game Stamina Timer，Tauri v2 + React + Rust）做出贡献。
本文件定义分支模型、提交流程与评审要求，确保所有变更可控、可回溯、可验证。

## 1. 分支模型

| 分支前缀 | 用途 | 是否合入 master |
| --- | --- | --- |
| `feat/` | 新功能 | 是 |
| `fix/` | 缺陷修复 | 是 |
| `chore/` | 配置、依赖、文档、清理 | 是 |
| `refactor/` / `perf/` | 重构 / 性能 | 是 |
| `scratch/` | **验证性 / 草稿 PR**，仅用于讨论或临时验证 | **默认不合入 master** |

> **scratch/ 规则（P3-2）**：以 `scratch/` 开头的分支用于实验，默认不合并到 master。
> 若验证通过、决定正式接纳，请改为 `feat/`/`fix/`/`chore/` 前缀后重新提 PR。

## 2. 提交流程

1. 从最新的 `master` 切出特性分支（参见上面的前缀）。
2. 保持提交原子、信息清晰（建议 Conventional Commits：`feat:` / `fix:` / `chore:` / `docs:` / `refactor:` / `perf:` / `build:`）。
3. 推送分支并发起 PR，使用 `.github/PULL_REQUEST_TEMPLATE.md` 模板填写。
4. 等待 **必要评审（required reviews）** 通过，且 **必要状态检查（required status checks）** 全绿。
5. 合并方式：优先 squash merge，保持 master 线性历史。

## 3. 评审要求（零评审禁止合入）

- master 受 **分支保护** 约束：合入前必须至少有 **1 个有效评审通过**，且 CI 全部绿。
- 任何 PR 都 **不允许零评审直接合入**。
- 评审重点：
  - 破坏性变更是否显式说明并提供迁移步骤；
  - 是否引入未经验证的假设（交付需有真机 e2e / 构建 / 测试等事实依据）；
  - 依赖升级是否成对（如 Vite 与其 plugin 需同批，避免 ERESOLVE）；
  - 是否同步版本号与文档。

## 4. 开发与验证

### 前端（React + TypeScript + Vite）
```bash
npm install
npm run build      # tsc 类型检查 + vite 构建
npm test           # vitest 单元测试
npm run lint       # ESLint 检查（已接入 CI）
```

### 后端（Tauri / Rust）
```bash
cd src-tauri
cargo fmt -- --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build
```

### 发版
- 打 `vX.Y.Z` tag 触发 `Release` 工作流，自动构建 Windows NSIS 安装包 + 便携 zip 并发布到 GitHub Release。
- tag 版本必须与 `src-tauri/tauri.conf.json` 的 `version` 一致。
- 离线 WebView2 运行时由 `webview2.json` + `webview2-sync.yml` 维护，详见对应文件注释。

## 5. 依赖升级原则

- **成对升级**：构建工具链中的耦合项（如 `vite` 与 `@vitejs/plugin-react`、`react` 与 `react-dom` 及 `@types/*`）必须同 PR 一起升级，避免 `npm ci` 因 peer 冲突失败。
- **锁文件必须提交**：`package-lock.json` 与 `src-tauri/Cargo.lock` 均纳入版本控制。
- **谨慎对待大版本**：Vite 8 默认 Rolldown 会破坏当前 Tauri/WebView2 运行时，故保留 Vite 6 / plugin-react 4 基线，不升级到 8/6。
- Dependabot 自动提交碎片 PR，合并前请人工整合为统一 PR（参见 PR 审查报告中的说明）。

## 6. 代码风格

- 前端：ESLint + Prettier（配置见 `eslint.config.js` / `.prettierrc.json`），CI 的 lint 步骤强制生效。
- 后端：Rust `rustfmt` + `clippy -D warnings`。
- 提交信息、PR 标题、Issue 使用中文或中英混合均可，但面向用户的 UI 文案一律使用简体中文。
