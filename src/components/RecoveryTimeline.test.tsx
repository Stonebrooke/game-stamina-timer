/**
 * RecoveryTimeline 组件单测：用 react-dom/server 的 renderToStaticMarkup 在 node 环境直接渲染
 * SVG 字符串并断言刻度几何（无需 jsdom / @testing-library）。
 * 时间源 useNow 通过 vi.mock 替换为可控值，彻底隔离 store / Tauri 后端。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { StaminaTimer } from "../lib/types";

/** 受控时钟：mock 后的 useNow 读取此值 */
const ctx = { now: 0 };
vi.mock("../store/useTimers", () => ({
  useNow: () => ctx.now
}));

// vi.mock 在 import 之前被提升生效，故下方导入拿到的是 mock 版 useNow
import RecoveryTimeline from "./RecoveryTimeline";

// 与组件常量保持一致（避免魔法数漂移）
const GUTTER = 96;
const RIGHT_PAD = 16;
const WIDTH = 680;
const USABLE = WIDTH - GUTTER - RIGHT_PAD; // 568
const STEP_2H = 2 * 3_600_000; // 7_200_000

/**
 * 构造一个未回满、且 fullAt = now + rangeMs 的计时器。
 * recover=1h/点，maxStamina = rangeMs/3600_000（需为整小时），保证 fullAtTs = now+rangeMs。
 */
function makeTimer(now: number, rangeMs: number): StaminaTimer {
  return {
    id: "t1",
    name: "测试游戏",
    recoverMsPerPoint: 3_600_000,
    maxStamina: rangeMs / 3_600_000,
    currentStamina: 0,
    lastUpdateTs: now,
    notifyOnFull: true,
    notifyEveryN: 0,
    notifiedUpTo: 0,
    fullNotified: false,
    color: "#4a9eff",
    createdAt: 0
  };
}

interface TickInfo {
  x: number;
  anchor: string;
  label: string;
}

/** 从静态 markup 抽取所有 axis 刻度文本（class="tl-tick"），解析 x / text-anchor / 标签 */
function getTicks(html: string): TickInfo[] {
  const out: TickInfo[] = [];
  const re = /<text\b([^>]*)class="tl-tick"([^>]*)>([^<]*)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1] + m[2];
    const x = Number((attrs.match(/x="([^"]+)"/) || [])[1]);
    const anchor = (attrs.match(/text-anchor="([^"]+)"/) || [])[1] ?? "middle";
    out.push({ x, anchor, label: m[3].trim() });
  }
  return out;
}

/** 把任意时间戳向下对齐到 2h 网格 */
const align2h = (t: number) => Math.floor(t / STEP_2H) * STEP_2H;

describe("RecoveryTimeline 刻度密度（grill-me B1/B2：2h 档落点）", () => {
  it("约 23h 跨度落到 2h 档：等距刻度 + HH:MM 标签 + 全部 middle", () => {
    // now 对齐到 2h 边界：首刻度为 now+2h，远离 now 线，不应触发 nearNow
    const now = align2h(1_700_000_000_000);
    const rangeMs = 23 * 3_600_000;
    ctx.now = now;

    const html = renderToStaticMarkup(
      <RecoveryTimeline timers={[makeTimer(now, rangeMs)]} />
    );
    const ticks = getTicks(html);

    // 23h / 2h = 11 个刻度（now+2h … now+22h）
    expect(ticks.length).toBe(11);

    // 2h 档在 23h 跨度下的像素间距 = (2h/23h) * 568 ≈ 49.39px，且严格等距
    const gap = (STEP_2H / rangeMs) * USABLE;
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].x - ticks[i - 1].x).toBeCloseTo(gap, 1);
    }

    // 首刻度远离 now 线（>18px），全部为居中标签；格式 HH:MM
    const firstX = GUTTER + (STEP_2H / rangeMs) * USABLE;
    expect(ticks[0].x).toBeCloseTo(firstX, 1);
    expect(firstX - GUTTER).toBeGreaterThan(18);
    for (const t of ticks) {
      expect(t.anchor).toBe("middle");
      expect(t.label).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("更短但不跨 12h 门槛的跨度仍保持 2h（regression：上限 12 生效）", () => {
    // 13h：1h 档会 13/1=13>12 被拒，落到 2h 档（13/2=6.5≤12）
    const now = align2h(1_700_000_000_000);
    const rangeMs = 13 * 3_600_000;
    ctx.now = now;

    const html = renderToStaticMarkup(
      <RecoveryTimeline timers={[makeTimer(now, rangeMs)]} />
    );
    const ticks = getTicks(html);

    // 13h / 2h = 6 个刻度（now+2h … now+12h）
    expect(ticks.length).toBe(6);
    const gap = (STEP_2H / rangeMs) * USABLE;
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].x - ticks[i - 1].x).toBeCloseTo(gap, 1);
    }
  });
});

describe("RecoveryTimeline 左边界（grill-me B4：nearNow 守卫）", () => {
  it("首刻度紧贴 now 线时右对齐、锚点 start、x=GUTTER+6，避开「现在」", () => {
    // now 比下一个 2h 边界早 1 分钟 → 首刻度距 now 仅 ~0.47px，触发 nearNow
    const boundary = align2h(1_700_000_000_000) + STEP_2H; // 一个 2h 边界
    const now = boundary - 60_000;
    const rangeMs = 23 * 3_600_000;
    ctx.now = now;

    const html = renderToStaticMarkup(
      <RecoveryTimeline timers={[makeTimer(now, rangeMs)]} />
    );
    const ticks = getTicks(html);
    expect(ticks.length).toBeGreaterThan(0);

    // 首刻度：右对齐、x=GUTTER+6
    expect(ticks[0].anchor).toBe("start");
    expect(ticks[0].x).toBe(GUTTER + 6);

    // 次刻度距 now 线已 >18px，恢复居中
    expect(ticks[1].anchor).toBe("middle");
  });

  it("now 恰在 2h 边界时不触发 nearNow（守卫仅对极近边界生效）", () => {
    const now = align2h(1_700_000_000_000); // 精确落在 2h 边界
    const rangeMs = 23 * 3_600_000;
    ctx.now = now;

    const html = renderToStaticMarkup(
      <RecoveryTimeline timers={[makeTimer(now, rangeMs)]} />
    );
    const ticks = getTicks(html);

    // 首刻度是 now+2h（距 now 线 ≈49px），应为居中
    expect(ticks[0].anchor).toBe("middle");
    expect(ticks.every(t => t.anchor === "middle")).toBe(true);
  });
});
