<!--
提交 PR 前请确认：
- 目标分支默认为 master；验证性/草稿分支请用 scratch/ 前缀（默认不合入 master）。
- CI（前端 lint/type-check/test + Rust fmt/clippy/build/test + actionlint）已通过。
- 涉及版本号变更请同步 package.json / src-tauri/Cargo.toml / src-tauri/tauri.conf.json。
-->

## 变更类型
<!-- 勾选一项 -->
- [ ] 功能新增 (feat)
- [ ] 缺陷修复 (fix)
- [ ] 文档/配置 (docs/chore)
- [ ] 依赖升级 (build/deps)
- [ ] 性能/重构 (perf/refactor)

## 改动摘要
<!-- 用 1-3 句话说明本次 PR 做了什么、为什么 -->

## 影响范围与破坏性变更
<!-- 列出受影响的模块；如有破坏性变更（API/配置/数据格式），必须在此显式说明并提供迁移步骤 -->

## 测试与验证
<!-- 描述你如何验证（本地构建、单元测试、真机/模拟器 e2e 等）。无验证依据的 PR 不予验收。 -->

## 关联 Issue / PR
<!-- 例如 Closes #12，或关联 #7–#11 等 -->

## 检查清单
- [ ] 已通过本地 `npm run build` 与 `npm test`（前端）
- [ ] 已通过 `npm run lint`（若引入 ESLint）
- [ ] 已通过 Rust `cargo fmt --check && cargo clippy -- -D warnings && cargo test`（如涉及 src-tauri）
- [ ] 已同步版本号（如涉及发版）
- [ ] 已更新相关文档/注释
