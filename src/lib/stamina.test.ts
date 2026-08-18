import { describe, it, expect } from "vitest";
import {
  computeCurrent,
  msUntilNext,
  msUntilFull,
  msUntilFullFrom,
  fullAtTs,
  pendingMilestones,
  isFull,
  formatDuration
} from "./stamina";
import type { StaminaTimer } from "./types";
// 公式契约单一真源（R3/T3：与 Rust 端 timer.rs 测试同源，消除双端 fixture 默认值 + 期望值重复）
import fixtures from "../../contracts/contract-fixtures.json";

/** 构造一个测试用计时器：默认字段取自 contract-fixtures.json baseline（与 Rust 端同源） */
function makeTimer(overrides: Partial<StaminaTimer> = {}): StaminaTimer {
  const base = fixtures.formulaSamples[0].timer;
  return {
    id: "t1",
    name: "测试游戏",
    createdAt: 0,
    fullNotified: false,
    recoverMsPerPoint: base.recoverMsPerPoint,
    maxStamina: base.maxStamina,
    currentStamina: base.currentStamina,
    lastUpdateTs: base.lastUpdateTs,
    notifyOnFull: base.notifyOnFull,
    notifyEveryN: base.notifyEveryN,
    notifiedUpTo: base.notifiedUpTo,
    color: base.color,
    ...overrides
  };
}

describe("computeCurrent（公式契约：双端共享 contract-fixtures.json）", () => {
  const sample = fixtures.formulaSamples[0];
  for (const c of sample.currentCases) {
    it(`nowOffsetMs=${c.nowOffsetMs} → 期望 ${c.expected}`, () => {
      const t = makeTimer();
      expect(computeCurrent(t, t.lastUpdateTs + c.nowOffsetMs)).toBe(c.expected);
    });
  }
});

describe("msUntilNext", () => {
  it("刚锚定时距下一点 = 完整周期", () => {
    const t = makeTimer();
    expect(msUntilNext(t, t.lastUpdateTs)).toBe(360_000);
  });

  it("半周期后距下一点 = 半周期", () => {
    const t = makeTimer();
    expect(msUntilNext(t, t.lastUpdateTs + 180_000)).toBe(180_000);
  });

  it("时钟回拨时仍返回完整周期", () => {
    const t = makeTimer();
    expect(msUntilNext(t, t.lastUpdateTs - 1_000)).toBe(360_000);
  });

  it("已满返回 null", () => {
    const t = makeTimer({ currentStamina: 240 });
    expect(msUntilNext(t, t.lastUpdateTs)).toBeNull();
  });
});

describe("msUntilFull", () => {
  it("以锚点计算，与 now 无关", () => {
    const t = makeTimer();
    expect(msUntilFull(t)).toBe(140 * 360_000);
  });

  it("已满返回 0", () => {
    const t = makeTimer({ currentStamina: 240 });
    expect(msUntilFull(t)).toBe(0);
  });
});

describe("msUntilFullFrom", () => {
  it("从 now 算距满：锚定 1 小时后已过 10 点", () => {
    const t = makeTimer();
    // 满需 140 点 = 50_400_000ms；过 1h → 剩 46_800_000
    expect(msUntilFullFrom(t, t.lastUpdateTs + 3_600_000)).toBe(46_800_000);
  });
  it("超过回满时刻按 0", () => {
    const t = makeTimer();
    expect(msUntilFullFrom(t, t.lastUpdateTs + 999_999_999_999)).toBe(0);
  });
  it("时钟回拨时剩余变长（回满时刻不变）", () => {
    const t = makeTimer();
    expect(msUntilFullFrom(t, t.lastUpdateTs - 3_600_000)).toBe(54_000_000);
  });
});

describe("fullAtTs", () => {
  it("回满时刻 = 锚点时间戳 + 距满毫秒", () => {
    const t = makeTimer();
    expect(fullAtTs(t)).toBe(t.lastUpdateTs + 50_400_000);
  });
  it("已满时回满时刻 = 锚点时间戳", () => {
    const t = makeTimer({ currentStamina: 240 });
    expect(fullAtTs(t)).toBe(t.lastUpdateTs);
  });
});

describe("pendingMilestones（相对锚点，每恢复 N 点）", () => {
  it("未跨里程碑时为空", () => {
    const t = makeTimer();
    // 恢复 10 点 < 20
    expect(pendingMilestones(t, t.lastUpdateTs + 10 * 360_000)).toEqual([]);
  });

  it("跨 1 个里程碑", () => {
    const t = makeTimer();
    // 恢复 20 点 → [120]
    expect(pendingMilestones(t, t.lastUpdateTs + 20 * 360_000)).toEqual([120]);
  });

  it("长睡眠跨多个里程碑，全部列出（调用方合并通知，契约来自 fixture）", () => {
    const t = makeTimer();
    const pm = fixtures.formulaSamples[0].pendingMilestones;
    expect(pendingMilestones(t, t.lastUpdateTs + pm.nowOffsetMs)).toEqual(pm.expected);
  });

  it("里程碑封顶于上限", () => {
    const t = makeTimer({ notifiedUpTo: 220, currentStamina: 220 });
    // 恢复到满 240 → 只有 [240]
    expect(pendingMilestones(t, t.lastUpdateTs + 20 * 360_000)).toEqual([240]);
  });

  it("notifyEveryN=0 时关闭", () => {
    const t = makeTimer({ notifyEveryN: 0 });
    expect(pendingMilestones(t, t.lastUpdateTs + 8 * 3_600_000)).toEqual([]);
  });

  it("时钟回拨时不产生里程碑", () => {
    const t = makeTimer();
    expect(pendingMilestones(t, t.lastUpdateTs - 999_999)).toEqual([]);
  });
});

describe("isFull", () => {
  it("未满/已满", () => {
    const t = makeTimer();
    expect(isFull(t, t.lastUpdateTs)).toBe(false);
    expect(isFull(t, t.lastUpdateTs + 140 * 360_000)).toBe(true);
  });
});

describe("formatDuration", () => {
  it("< 1h → MM:SS", () => {
    expect(formatDuration(59_000)).toBe("00:59");
    expect(formatDuration(3_599_000)).toBe("59:59");
  });
  it("< 24h → Xh Ym", () => {
    expect(formatDuration(3_600_000)).toBe("1h 0m");
    expect(formatDuration(86_399_000)).toBe("23h 59m");
  });
  it("≥ 24h → Xd Xh", () => {
    expect(formatDuration(86_400_000)).toBe("1d 0h");
    expect(formatDuration(2 * 86_400_000 + 5 * 3_600_000)).toBe("2d 5h");
  });
  it("负值按 0", () => {
    expect(formatDuration(-1000)).toBe("00:00");
  });
});

describe("computeCurrent 脏数据防御 (P0-3)", () => {
  const probe = (rate: number, elapsed: number) => {
    const t = makeTimer({ recoverMsPerPoint: rate, currentStamina: 100 });
    return computeCurrent(t, t.lastUpdateTs + elapsed);
  };

  it("rate=0 返回 finite 且等于锚点（不 NaN）", () => {
    const v = probe(0, 1_000_000_000);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBe(100);
  });

  it("rate=NaN 返回 finite 且等于锚点", () => {
    const v = probe(NaN, 1_000_000_000);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBe(100);
  });

  it("rate=-1 返回 finite 且等于锚点", () => {
    const v = probe(-1, 360_000);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBe(100);
  });

  it("rate=Infinity 返回 finite 且等于锚点", () => {
    const v = probe(Infinity, 360_000);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBe(100);
  });

  it("msUntilNext 对无效速率返回 null（非 NaN）", () => {
    expect(msUntilNext(makeTimer({ recoverMsPerPoint: 0 }), Date.now())).toBeNull();
    expect(msUntilNext(makeTimer({ recoverMsPerPoint: NaN }), Date.now())).toBeNull();
  });
});
