/**
 * 状态中枢：单一 now 时钟源 + timers + 1s tick。
 * tick 仅负责 UI 刷新；通知判定已下沉到 Rust 后端线程（P1-1），
 * 避免窗口隐藏后 WebView2 节流导致通知延迟。
 */
import { create } from "zustand";
import { api } from "../api/timers";
import { computeCurrent } from "../lib/stamina";
import type { NewTimer, StaminaTimer } from "../lib/types";

interface TimersState {
  timers: StaminaTimer[];
  /** 单一时钟源：每 tick 推进 */
  now: number;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  add: (input: NewTimer) => Promise<void>;
  update: (timer: StaminaTimer) => Promise<void>;
  remove: (id: string) => Promise<void>;
  anchor: (id: string, value: number) => Promise<void>;
  /** 推进时钟（UI 刷新）；通知由后端线程负责 */
  tick: () => void;
  clearError: () => void;
}

export const useTimers = create<TimersState>()((set) => ({
  timers: [],
  now: Date.now(),
  loading: true,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const timers = await api().listTimers();
      set({ timers, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  add: async input => {
    try {
      const timer = await api().addTimer(input);
      set(s => ({ timers: [...s.timers, timer] }));
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  update: async timer => {
    try {
      const next = await api().updateTimer(timer);
      set(s => ({ timers: s.timers.map(t => (t.id === next.id ? next : t)) }));
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  remove: async id => {
    try {
      await api().deleteTimer(id);
      set(s => ({ timers: s.timers.filter(t => t.id !== id) }));
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  anchor: async (id, value) => {
    try {
      const next = await api().anchorTimer(id, value);
      set(s => ({ timers: s.timers.map(t => (t.id === next.id ? next : t)) }));
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  // UI 刷新时钟源：仅推进 now。通知判定已由 Rust 后端线程负责（P1-1）。
  tick: () => set({ now: Date.now() }),

  clearError: () => set({ error: null })
}));

/** 单一时钟订阅源：叶子组件用它订阅 now，避免 App 整树重渲染（架构审查 ②） */
export const useNow = () => useTimers(s => s.now);

/** 当前体力派生：内部走 useNow，订阅点收敛到单一 hook（架构审查 ②+③，消除死代码） */
export function useCurrent(t: StaminaTimer): number {
  const now = useNow();
  return computeCurrent(t, now);
}
