// 集成测试：useTimers.tick 现在仅负责 UI 刷新（通知已下沉 Rust 后端线程，P1-1）。
// 用 mock 替换 api/timers，避免依赖 localStorage/window（node 环境）。
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useTimers } from "./useTimers";
import type { StaminaTimer } from "../lib/types";

const mockMarkNotified = vi.fn(async () => {});

vi.mock("../api/timers", () => ({
  inTauri: () => false,
  api: () => ({
    markNotified: mockMarkNotified,
    listTimers: vi.fn(async () => []),
    addTimer: vi.fn(),
    updateTimer: vi.fn(),
    deleteTimer: vi.fn(),
    anchorTimer: vi.fn()
  })
}));

function sampleTimer(): StaminaTimer {
  return {
    id: "t1",
    name: "测试",
    recoverMsPerPoint: 60_000,
    maxStamina: 240,
    currentStamina: 100,
    lastUpdateTs: Date.now(),
    notifyOnFull: true,
    notifyEveryN: 20,
    notifiedUpTo: 100,
    fullNotified: false,
    color: "#fff",
    createdAt: 0
  };
}

describe("useTimers.tick (UI 刷新，通知已下沉后端)", () => {
  beforeEach(() => {
    mockMarkNotified.mockClear();
    useTimers.setState({ timers: [], now: 0, loading: false, error: null });
  });

  it("tick 仅推进 now 用于 UI，不触发通知、不写 markNotified", () => {
    useTimers.setState({ timers: [sampleTimer()] });
    useTimers.getState().tick();
    expect(useTimers.getState().now).toBeGreaterThan(0);
    expect(mockMarkNotified).not.toHaveBeenCalled(); // 通知归后端线程
  });

  it("loaded timers 进入 state 且不触发通知", async () => {
    // listTimers mock 返回空，load 后 timers 为空、无错误
    await useTimers.getState().load();
    expect(useTimers.getState().timers).toEqual([]);
    expect(useTimers.getState().error).toBeNull();
    expect(mockMarkNotified).not.toHaveBeenCalled();
  });
});
