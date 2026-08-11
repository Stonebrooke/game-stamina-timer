/**
 * IPC 封装：统一 invoke 入口 + 错误处理。
 * 浏览器环境（vite dev 预览）下自动降级为 localStorage mock，保证 UI 可独立预览。
 */
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  disable as autostartDisable,
  enable as autostartEnable,
  isEnabled as autostartIsEnabled
} from "@tauri-apps/plugin-autostart";
import type { NewTimer, StaminaTimer, TimersFile } from "../lib/types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

/** 是否运行在 Tauri webview 内 */
export function inTauri(): boolean {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
}

/* ---------------- Tauri 通道 ---------------- */

const JSON_FILTERS = [{ name: "JSON", extensions: ["json"] }];

const tauriApi = {
  listTimers: () => invoke<StaminaTimer[]>("list_timers"),
  addTimer: (input: NewTimer) => invoke<StaminaTimer>("add_timer", { input }),
  updateTimer: (timer: StaminaTimer) => invoke<StaminaTimer>("update_timer", { timer }),
  deleteTimer: (id: string) => invoke<void>("delete_timer", { id }),
  anchorTimer: (id: string, currentStamina: number) =>
    invoke<StaminaTimer>("anchor_timer", { id, currentStamina }),
  markNotified: (id: string, notifiedUpTo: number, fullNotified: boolean) =>
    invoke<void>("mark_notified", { id, notifiedUpTo, fullNotified }),
  /** 导出到用户选择的路径；取消返回 null，成功返回路径 */
  exportTimers: async (): Promise<string | null> => {
    const path = await save({ filters: JSON_FILTERS, defaultPath: "stamina-timers.json" });
    if (!path) return null;
    await invoke<void>("export_timers", { path });
    return path;
  },
  /** 从用户选择的文件导入；取消返回 null，成功返回导入条数 */
  importTimers: async (): Promise<number | null> => {
    const path = await open({ multiple: false, filters: JSON_FILTERS });
    if (!path || typeof path !== "string") return null;
    return invoke<number>("import_timers", { path });
  },
  getAutostart: () => autostartIsEnabled(),
  setAutostart: async (on: boolean) => {
    if (on) await autostartEnable();
    else await autostartDisable();
  }
};

/* ---------------- 浏览器 localStorage mock（仅预览用） ---------------- */

const MOCK_KEY = "stamina-timers-mock";

function mockRead(): TimersFile {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (raw) return JSON.parse(raw) as TimersFile;
  } catch {
    /* 损坏则回退空库 */
  }
  return { schemaVersion: 1, timers: [] };
}

function mockWrite(file: TimersFile): void {
  localStorage.setItem(MOCK_KEY, JSON.stringify(file));
}

const mockApi = {
  async listTimers(): Promise<StaminaTimer[]> {
    return mockRead().timers;
  },
  async addTimer(input: NewTimer): Promise<StaminaTimer> {
    const file = mockRead();
    const now = Date.now();
    const timer: StaminaTimer = {
      id: crypto.randomUUID(),
      lastUpdateTs: now,
      notifiedUpTo: input.currentStamina,
      fullNotified: false,
      createdAt: now,
      ...input
    };
    file.timers.push(timer);
    mockWrite(file);
    return timer;
  },
  async updateTimer(timer: StaminaTimer): Promise<StaminaTimer> {
    const file = mockRead();
    const i = file.timers.findIndex(t => t.id === timer.id);
    if (i < 0) throw new Error("计时器不存在");
    const prev = file.timers[i];
    const next = { ...timer };
    if (prev.currentStamina !== next.currentStamina) {
      next.lastUpdateTs = Date.now();
      next.notifiedUpTo = next.currentStamina;
      next.fullNotified = false;
    } else {
      next.lastUpdateTs = prev.lastUpdateTs;
      next.notifiedUpTo = Math.min(prev.notifiedUpTo, next.maxStamina);
      next.fullNotified = prev.fullNotified;
    }
    next.createdAt = prev.createdAt;
    file.timers[i] = next;
    mockWrite(file);
    return next;
  },
  async deleteTimer(id: string): Promise<void> {
    const file = mockRead();
    file.timers = file.timers.filter(t => t.id !== id);
    mockWrite(file);
  },
  async anchorTimer(id: string, currentStamina: number): Promise<StaminaTimer> {
    const file = mockRead();
    const t = file.timers.find(t => t.id === id);
    if (!t) throw new Error("计时器不存在");
    t.currentStamina = currentStamina;
    t.lastUpdateTs = Date.now();
    t.notifiedUpTo = currentStamina;
    t.fullNotified = false;
    mockWrite(file);
    return t;
  },
  async markNotified(id: string, notifiedUpTo: number, fullNotified: boolean): Promise<void> {
    const file = mockRead();
    const t = file.timers.find(t => t.id === id);
    if (!t) return;
    t.notifiedUpTo = Math.min(notifiedUpTo, t.maxStamina);
    t.fullNotified = fullNotified;
    mockWrite(file);
  },
  /** 浏览器降级：Blob 下载导出 */
  async exportTimers(): Promise<string | null> {
    const blob = new Blob([JSON.stringify(mockRead(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stamina-timers.json";
    a.click();
    URL.revokeObjectURL(url);
    return "stamina-timers.json（浏览器下载）";
  },
  /** 浏览器降级：文件选择导入，按 id 合并 */
  async importTimers(): Promise<number | null> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      // 取消选择（含窗口失焦兜底）必须 resolve(null)，否则 Promise 永久 pending 锁死 UI（P1-7）
      const cancel = () => resolve(null);
      input.addEventListener("cancel", cancel);
      window.addEventListener("focus", cancel, { once: true });
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        try {
          const parsed = JSON.parse(await f.text()) as TimersFile;
          if (!Array.isArray(parsed.timers)) throw new Error("文件格式不正确：缺少 timers 数组");
          // 逐字段校验，任何一条非法整体拒绝（P0-3 脏数据防御）
          for (const t of parsed.timers) {
            if (typeof t.id !== "string" || !t.id) throw new Error("存在缺少 id 的计时器");
            if (typeof t.name !== "string" || !t.name.trim()) throw new Error("存在缺少名称的计时器");
            if (!(t.recoverMsPerPoint > 0) || !Number.isFinite(t.recoverMsPerPoint))
              throw new Error(`「${t.name}」每点恢复时间非法`);
            if (!(t.maxStamina >= 1) || !Number.isFinite(t.maxStamina))
              throw new Error(`「${t.name}」体力上限非法`);
            if (!Number.isFinite(t.currentStamina) || t.currentStamina < 0 || t.currentStamina > t.maxStamina)
              throw new Error(`「${t.name}」当前体力非法`);
            if (!Number.isFinite(t.lastUpdateTs) || t.lastUpdateTs <= 0)
              throw new Error(`「${t.name}」锚点时间戳非法`);
            if (!Number.isFinite(t.notifyEveryN) || t.notifyEveryN < 0)
              throw new Error(`「${t.name}」每 N 点提醒非法`);
          }
          const file = mockRead();
          for (const t of parsed.timers) {
            const i = file.timers.findIndex(x => x.id === t.id);
            if (i >= 0) file.timers[i] = t;
            else file.timers.push(t);
          }
          mockWrite(file);
          resolve(parsed.timers.length);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      };
      input.click();
    });
  },
  async getAutostart(): Promise<boolean> {
    return localStorage.getItem("stamina-timers-mock-autostart") === "1";
  },
  async setAutostart(on: boolean): Promise<void> {
    localStorage.setItem("stamina-timers-mock-autostart", on ? "1" : "0");
  }
};

/** 按运行环境选择通道 */
export function api() {
  return inTauri() ? tauriApi : mockApi;
}
