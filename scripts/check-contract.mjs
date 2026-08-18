#!/usr/bin/env node
// 双源契约校验（P1-3）：比对 Rust timer.rs 与 TS types.ts 的字段名（camelCase 对齐）
// 以及色板 TIMER_COLORS / COLOR_POOL（17 色）。CI `contract` job 运行；失败 exit(1)。
//
// 零依赖：仅用 node 内置模块。运行：node scripts/check-contract.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function fail(msg) {
  console.error(`[contract] FAIL: ${msg}`);
  process.exit(1);
}

// —— 读取源文件 ——
const rust = readFileSync(resolve(root, "src-tauri/src/timer.rs"), "utf8");
const tsTypes = readFileSync(resolve(root, "src/lib/types.ts"), "utf8");
const tsPresets = readFileSync(resolve(root, "src/lib/presets.ts"), "utf8");

// —— 抽取 Rust struct 字段（snake_case 原名）——
function rustStructFields(src, name) {
  const re = new RegExp(`pub struct ${name}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = src.match(re);
  if (!m) fail(`Rust 中未找到 struct ${name}`);
  const body = m[1];
  const fields = [];
  const fr = /pub\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
  let fm;
  while ((fm = fr.exec(body)) !== null) fields.push(fm[1]);
  return fields;
}

// snake_case → camelCase（与 TS 契约对齐）
function toCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// —— 抽取 TS interface 字段名（已是 camelCase）——
function tsInterfaceFields(src, name) {
  const re = new RegExp(`export interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = src.match(re);
  if (!m) fail(`TS 中未找到 interface ${name}`);
  const body = m[1];
  const fields = [];
  const fr = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm;
  let fm;
  while ((fm = fr.exec(body)) !== null) fields.push(fm[1]);
  return fields;
}

// —— 字段比对 ——
const pairs = [
  ["StaminaTimer", "StaminaTimer"],
  ["NewTimer", "NewTimer"],
  ["TimersFile", "TimersFile"],
];
for (const [rustName, tsName] of pairs) {
  const rustF = rustStructFields(rust, rustName).map(toCamel).sort();
  const tsF = tsInterfaceFields(tsTypes, tsName).sort();
  const rustSet = new Set(rustF);
  const tsSet = new Set(tsF);
  const missing = [...tsSet].filter((f) => !rustSet.has(f));
  const extra = [...rustSet].filter((f) => !tsSet.has(f));
  if (missing.length || extra.length) {
    fail(
      `${rustName}: 字段不一致\n  TS 缺(应在 Rust): ${missing.join(", ") || "无"}\n  Rust 多(应在 TS): ${extra.join(", ") || "无"}`
    );
  }
  console.log(`[contract] ${rustName}: ${rustF.length} 字段一致 ✓`);
}

// —— 色板比对 ——
function quotedHex(src, anchorRe) {
  const m = src.match(anchorRe);
  if (!m) fail("未找到色板常量");
  const block = m[0];
  const strs = [];
  const sr = /"#([0-9a-fA-F]{3,8})"/g;
  let sm;
  while ((sm = sr.exec(block)) !== null) strs.push(sm[0]);
  return strs;
}

const rustColors = quotedHex(rust, /pub const TIMER_COLORS[\s\S]*?\];/);
const tsColors = quotedHex(tsPresets, /export const COLOR_POOL[\s\S]*?\];/);

const rustSet = new Set(rustColors);
const tsSet = new Set(tsColors);
const missC = [...tsSet].filter((c) => !rustSet.has(c));
const extraC = [...rustSet].filter((c) => !tsSet.has(c));
if (rustColors.length !== tsColors.length || missC.length || extraC.length) {
  fail(
    `色板不一致\n  Rust(${rustColors.length}): ${rustColors.join(" ")}\n  TS(${tsColors.length}): ${tsColors.join(" ")}\n  TS 缺: ${missC.join(",") || "无"}\n  Rust 多: ${extraC.join(",") || "无"}`
  );
}
console.log(`[contract] 色板: ${rustColors.length} 色一致 ✓`);

// —— 公式契约 fixture 校验（R3：双源公式期望值单一真源，提升为 CI 门禁）——
const fixturesRaw = readFileSync(
  resolve(root, "contracts/contract-fixtures.json"),
  "utf8"
);
const fixtures = JSON.parse(fixturesRaw);
if (!Array.isArray(fixtures.formulaSamples) || fixtures.formulaSamples.length === 0) {
  fail("contract-fixtures.json: formulaSamples 必须为非空数组");
}
const baseline = fixtures.formulaSamples[0];
if (!baseline || typeof baseline !== "object" || !baseline.timer) {
  fail("contract-fixtures.json: formulaSamples[0] 必须含 timer 对象");
}
if (!Array.isArray(baseline.currentCases) || baseline.currentCases.length === 0) {
  fail("contract-fixtures.json: formulaSamples[0].currentCases 必须为非空数组");
}
// baseline.timer 字段必须是 StaminaTimer 接口字段的子集（防止 fixture 漂移）
const timerFields = tsInterfaceFields(tsTypes, "StaminaTimer");
const baselineKeys = Object.keys(baseline.timer);
const unknownKeys = baselineKeys.filter((k) => !timerFields.includes(k));
if (unknownKeys.length) {
  fail(
    `contract-fixtures.json: baseline.timer 含非 StaminaTimer 字段: ${unknownKeys.join(", ")}`
  );
}
console.log(
  `[contract] 公式 fixture: ${baseline.currentCases.length} 用例 / timer 字段 ${baselineKeys.length} 项与 StaminaTimer 对齐 ✓`
);

console.log("[contract] 全部契约校验通过 ✓");
