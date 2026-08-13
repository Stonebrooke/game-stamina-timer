> ⚠️ **本文档已过时** —— 与当前 `.github/workflows/*.yml` 实际状态不符。最后校订：2026-08-13。
> 以下关键断言已被实际配置推翻，请勿据此维护：
> 1. 「release.yml 的 `releaseBody` 仍是字面 `X.Y.Z`」—— **已修复**：现用 `${{ steps.ver.outputs.version }}` 动态变量。
> 2. 「release.yml 缺少 tag↔`tauri.conf.json` 版本校验」—— **已修复**：已加 `Verify tag version matches tauri.conf.json` 步骤。
> 3. 「ci.yml 缺少三处版本一致性校验」—— **已修复**：frontend job 已有 `Verify version sync`。
> 4. 「安装包文件名应为 `游戏体力计时器_...`」—— **错误**：`tauri.conf.json` 的 `productName` 实为 `Game Stamina Timer`，故 `Game Stamina Timer_${{ steps.ver.outputs.version }}_x64-setup.exe` 才正确。
> 5. 第三方 Action 已锁 SHA（`dtolnay/rust-toolchain`、`tauri-apps/tauri-action` 等），非浮动 tag。
> 另：`ci.yml` 已追加 `permissions: contents: read` + `concurrency` + `cargo build`（编译兜底）。
> 权威信息以工作流文件与 CI 分析报告为准。
>
> ---

# Releases 配置分析

> 仓库：`Stonebrooke/game-stamina-timer`
> 分析依据：GitHub MCP 实测（releases/tags/CHANGELOG 状态）+ 项目内 `package.json` / `tauri.conf.json` / `Cargo.toml` / `.github/workflows/*.yml`
> 结论：**发布链路已搭好但从未跑过**——仓库实测 0 个 release、0 个 tag、无 `CHANGELOG.md`。当前机制是"打 tag 自动发布"，但 release notes 是写死的模板，版本号需三处手动同步。

---

## 修正记录（v2）

本版相比初稿修正了以下错误：

1. **删除虚构的 `strategy.matrix`**：初稿声称 release.yml 用 `matrix: {platform: [windows-latest]}`，实际为直接 `runs-on: windows-latest`，无 matrix。原"两处不一致"第 2 点（matrix 冗余）已删除。
2. **删除虚构的 `.msi` 文案**：初稿声称 releaseBody 提及 `.exe`/`.msi`，实际 releaseBody 只写 NSIS `.exe`，无 `.msi` 字样。原"两处不一致"第 1 点（.msi 文案不符）已删除。
3. **新增真实问题**：`releaseBody` 中的 `X.Y.Z` 是字面文本而非动态变量，发布后 Release Notes 会显示字面 "X.Y.Z" 而非实际版本号。
4. **新增遗漏**：release.yml 自身缺少 tag 版本 ↔ `tauri.conf.json` 版本的一致性校验（CI 校验不影响 tag 触发的 release 流程）。
5. **澄清 Cargo.lock**：`src-tauri/Cargo.lock` 已存在且已 git 跟踪，`hashFiles` 缓存 key 正常工作，无缓存失效问题。

---

## 一、仓库当前 Releases 状态（实测）

| 项 | 实测值 |
|---|---|
| Releases | **0 个**（无历史发布） |
| Tags | **0 个** |
| `CHANGELOG.md` | **不存在** |
| `src-tauri/Cargo.lock` | **存在**（128KB，已 git 跟踪，`.gitignore` 注明"Rust 二进制锁，提交"） |
| 最新版本声明 | `package.json` / `tauri.conf.json` / `Cargo.toml` 均声明 `0.2.1` |

即：配置就绪，但还需要一次真实发布来落地。

---

## 二、涉及的配置文件与职责

```
game-stamina-timer/
├── package.json          # 前端版本号 0.2.1（非权威，需与 tauri.conf 同步）
├── src-tauri/
│   ├── Cargo.toml        # Rust crate 版本 0.2.1（非权威，需同步）
│   ├── Cargo.lock        # 已提交，用于 release.yml 的 cargo 缓存 key
│   └── tauri.conf.json   # ★版本号权威源 + bundle.targets=["nsis"]
├── .github/workflows/
│   ├── ci.yml            # 持续集成（push/PR）：前端 test+build / Rust fmt+clippy+test
│   └── release.yml       # ★发布流水线（tag v*）：Windows 构建 NSIS 并建 GitHub Release
└──（缺失）CHANGELOG.md   # 建议新增：用于自动生成 release notes
```

**职责边界**：
- `ci.yml` **不发布**，只做质量门禁（它挂了，PR 不能合并，但不会影响 release）。
- `release.yml` **是唯一的发布入口**，且仅由 tag 触发。注意：tag 触发的 release 流程**不经过 ci.yml**，因此 CI 中的版本校验无法拦截 release。

---

## 三、版本号定义方式（关键）

Tauri 的版本号有**单一权威源**和**两个需同步的影子**：

| 文件 | 字段 | 角色 | 谁读它 |
|---|---|---|---|
| `src-tauri/tauri.conf.json` | `"version": "0.2.1"` | **权威版本** | `tauri-action` 读它当作 `__VERSION__`；决定安装包文件名 |
| `package.json` | `"version": "0.2.1"` | 影子（前端） | 人类/工具可读；tauri CLI 也参考 |
| `src-tauri/Cargo.toml` | `version = "0.2.1"` | 影子（Rust） | Cargo 包元数据 |

**同步规则**（本项目约定，已在架构优化时对齐）：
1. 发布前先改 `tauri.conf.json` 的 `version` 到目标版本（如 `0.2.2`）。
2. 同步改 `package.json` 与 `Cargo.toml` 的 `version` 为同一值（**必须一致**，否则安装包版本与仓库元数据漂移）。
3. commit 这三个文件，再打 tag。

> 安装包文件名由权威版本决定：`游戏体力计时器_0.2.1_x64-setup.exe`
> （历史记录已产出过 `游戏体力计时器_0.1.0_x64-setup.exe`，印证此规则）

---

## 四、构建与发布触发条件

### release.yml 触发逻辑（当前）

```yaml
on:
  push:
    tags:
      - 'v*'          # 仅当推送形如 v0.2.1 的 tag 时触发
```

| 事件 | 是否触发发布 |
|---|---|
| `git push origin master`（普通提交） | ❌ 否 |
| 开 PR 到 main/master | ❌ 否（仅触发 ci.yml） |
| `git push origin v0.2.1`（推送 tag） | ✅ 是 |

**即：发布是"手动打 tag + 推 tag"，由 CI 自动完成构建与建 Release。**

### 构建环境（当前实际配置）

```yaml
runs-on: windows-latest   # 直接指定，无 matrix
```

- 因 `tauri.conf.json` 的 `bundle.targets: ["nsis"]` 是 Windows 专属格式，故只在 Windows runner 构建。
- `tauri-action@v0` 内部会执行 `npm run build`（前端）→ `cargo tauri build`（Rust + NSIS 打包）。
- 若将来要支持 macOS/Linux，需引入 `strategy.matrix` 并改 `tauri.conf.json` 的 `bundle.targets`，但当前未使用。

---

## 五、Tag 与 Release 资产生成规则

### Tag 命名规则

- 格式：`v` + 权威版本号，例如 `v0.2.1`（**必须带 `v` 前缀**，否则不匹配 `tags: ['v*']`）。
- 错误示例：`0.2.1`（无 v 前缀，**不会触发发布**）、`release-0.2.1`、`V0.2.1`（大写 V 不匹配 `v*`，GitHub tag 匹配区分大小写）。

### Release 与资产生成（由 `tauri-action` 自动完成）

```yaml
with:
  tagName: ${{ github.ref_name }}                    # release 的 git tag = 推送的 tag（如 v0.2.1）
  releaseName: '游戏体力计时器 ${{ github.ref_name }}' # 如 "游戏体力计时器 v0.2.1"
  releaseBody: |
    下载 Windows 安装包（NSIS）：
    - `游戏体力计时器_X.Y.Z_x64-setup.exe`
    双击安装即可，会自动覆盖旧版本。
  releaseDraft: false      # 直接发布（非草稿）
  prerelease: false        # 非预发布
```

生成顺序：
1. 检出代码 → 安装 Node 22 + Rust stable → `npm ci` → `tauri-action` 构建。
2. 构建产物：`src-tauri/target/release/bundle/nsis/游戏体力计时器_0.2.1_x64-setup.exe`。
3. `tauri-action` 自动：
   - 创建 GitHub Release（tag = `v0.2.1`，name = "游戏体力计时器 v0.2.1"）。
   - 上传 NSIS `.exe` 作为 Release Asset。
   - Release Body 用上面写死的模板。

### ⚠️ 当前配置的真实问题（需修）

1. **`releaseBody` 中的 `X.Y.Z` 是字面文本，不是动态变量**
   GitHub Actions 在 `releaseBody` 字段里只会替换 `${{ ... }}` 表达式，`X.Y.Z` 是普通字符串。发布 v0.2.1 后，用户在 Release 页面看到的仍是字面 "游戏体力计时器_X.Y.Z_x64-setup.exe"，而非 "游戏体力计时器_0.2.1_x64-setup.exe"。
   → 修法：改成 `游戏体力计时器_${{ github.ref_name }}_x64-setup.exe`（注意 `github.ref_name` 是 `v0.2.1` 含 `v` 前缀，与产物名 `0.2.1` 不一致，需用 `tauri-action` 的 `version` 输出或 step output 去掉 `v`）。

2. **release.yml 自身无版本一致性校验**
   tag 触发的 release 流程不经过 ci.yml，因此可以推送 `v0.3.0` tag 但 `tauri.conf.json` 仍是 `0.2.1`，结果 Release 标记 v0.3.0 但产物内嵌版本 0.2.1，文件名也是 `0.2.1`。
   → 修法：在 release.yml 的 build 步骤前加一步版本校验（见 Section 九）。

---

## 六、手动发布步骤（端到端，当前机制）

```bash
# 1. 本地改版本号（三处同步）
#    tauri.conf.json → "version": "0.2.2"
#    package.json    → "version": "0.2.2"
#    Cargo.toml      → version = "0.2.2"
git add .
git commit -m "chore: bump version to 0.2.2"

# 2. 打 tag（必须 v 前缀，小写 v）
git tag v0.2.2

# 3. 推送 tag（普通 push 不会触发发布，必须推 tag）
git push origin master
git push origin v0.2.2

# 4. 到 GitHub Actions 看 release.yml 自动跑完 → 自动生成 Release + 上传 .exe
```

> 注意：在某些受限网络环境（如 CI 沙箱）中 `git push` 可能被 TLS 拦截（如 Windows 的 `CRYPT_E_NO_REVOCATION_CHECK`），需在**本地普通开发环境**执行上述 push。这是环境问题，与项目配置无关。

---

## 七、如何「自动生成」Release Notes（当前缺失）

当前 `releaseBody` 是**写死的模板**，不随版本变化。要做到 notes 自动生成，引入以下任一：

### 方案 A：CHANGELOG.md + release-please（Google 官方）
1. 新增 `CHANGELOG.md`，commit message 遵循 Conventional Commits（`feat:`/`fix:`/`chore:`）。
2. 加 workflow `release-please.yml`：
   ```yaml
   on:
     push:
       branches: [master]
   jobs:
     release-please:
       runs-on: ubuntu-latest
       steps:
         - uses: googleapis/release-please-action@v4
           with:
             release-type: node   # 读 package.json 版本
   ```
   它会自动开/更新 "release PR"，合并后自动打 tag + 建 Release（notes 来自 CHANGELOG）。

### 方案 B：git-cliff（从 commit 生成 CHANGELOG + notes）
```yaml
- uses: orhun/git-cliff-action@v3
  with:
    config: cliff.toml
    args: --latest --strip header
```
`git-cliff` 按 `cliff.toml` 规则把 conventional commits 渲染成 release notes，可喂给 `tauri-action` 的 `releaseBody`。

### 推荐
- 小项目：先补 `CHANGELOG.md` 手维护 + 保留当前 tag 触发机制即可。
- 想全自动：上 **release-please**（改动最小，且与现有 `v*` tag 约定兼容）。需注意 release-please 会接管 tag 创建，要与现有 `release.yml` 的 tag 触发协调好（通常让 release-please 打 tag，release.yml 仍由 tag 触发构建）。

---

## 八、配置检查清单（发布前自检）

| 检查项 | 命令/位置 | 预期 |
|---|---|---|
| 三处版本一致 | `grep -h version package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json` | 三处同号 |
| tag 版本 = tauri.conf 版本 | `git tag` vs `tauri.conf.json` | tag `vX.Y.Z` 的 `X.Y.Z` = conf 的 version |
| bundle target 与文案一致 | `tauri.conf.json` vs releaseBody | 有 nsis 才有 .exe；releaseBody 不应提未产出的格式 |
| releaseBody 动态变量 | release.yml | 用 `${{ ... }}` 而非字面 `X.Y.Z` |
| Cargo.lock 已提交 | `git ls-files src-tauri/Cargo.lock` | 非空（缓存 key 依赖它） |
| tag 前缀正确 | `git tag` | `vX.Y.Z`（小写 v） |
| CI 已绿 | Actions 页 ci.yml | 前端 + Rust 全绿 |
| 资产会出现 | release.yml `tauri-action` | NSIS `.exe` 上传为 asset |

---

## 九、立即可做的修复（建议）

### 1. 修 release.yml 的 releaseBody 动态变量

```yaml
# 修改前（字面 X.Y.Z）
releaseBody: |
  下载 Windows 安装包（NSIS）：
  - `游戏体力计时器_X.Y.Z_x64-setup.exe`
  双击安装即可，会自动覆盖旧版本。

# 修改后（用 tauri-action 的 version 输出去掉 v 前缀）
# 需要在 build 步骤前先取版本号
- name: Read version
  id: ver
  run: |
    V=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
    echo "version=$V" >> $GITHUB_OUTPUT

# releaseBody 用 steps.ver.outputs.version
releaseBody: |
  下载 Windows 安装包（NSIS）：
  - `游戏体力计时器_${{ steps.ver.outputs.version }}_x64-setup.exe`
  双击安装即可，会自动覆盖旧版本。
```

### 2. release.yml 加 tag↔conf 版本一致性校验

```yaml
- name: Verify tag version matches tauri.conf.json
  run: |
    TAG_VER="${GITHUB_REF_NAME#v}"          # v0.2.1 → 0.2.1
    CONF_VER=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
    if [ "$TAG_VER" != "$CONF_VER" ]; then
      echo "ERROR: tag version ($TAG_VER) != tauri.conf.json version ($CONF_VER)"
      exit 1
    fi
    echo "Version OK: $TAG_VER"
```

### 3. ci.yml 加三处版本一致性校验（防漂移，原建议保留）

```yaml
- name: Verify version sync
  run: |
    V=$(node -p "require('./package.json').version")
    C=$(grep '^version' src-tauri/Cargo.toml | head -1 | cut -d'"' -f2)
    T=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
    [ "$V" = "$C" ] && [ "$V" = "$T" ] || { echo "版本不一致: package=$V cargo=$C tauri=$T"; exit 1; }
```

### 4.（可选）加 CHANGELOG.md + release-please

实现 notes 自动生成，详见 Section 七。

---

要我直接动手改 `release.yml`（修 releaseBody 动态变量 + 加 tag↔conf 版本校验）和 `ci.yml`（加三处版本校验）吗？这三处都是低风险纯配置修改。
