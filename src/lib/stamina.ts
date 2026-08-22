/**
 * 计时核心：全部纯函数，由时间戳推导，无任何后台进程依赖。
 *
 * 设计要点：
 * - elapsed 负值（系统时间被调早）一律按 0 处理；
 * - 结果钳制在 [0, maxStamina]；
 * - 系统睡眠/合盖天然正确：唤醒后 now - lastUpdateTs 自动跨过睡眠时长。
 */
import type { StaminaTimer } from "./types";

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/**
 * 安全速率：无效速率（<=0 或非有限）一律退化为 Infinity。
 * 退化后 computeCurrent 的 gained=floor(elapsed/Infinity)=0，当前体力恒等于锚点值，
 * 绝不会产生 NaN/Infinity 传染到进度环与时间轴（P0-3 脏数据防御）。
 */
function safeRate(t: StaminaTimer): number {
  const r = t.recoverMsPerPoint;
  return r > 0 && Number.isFinite(r) ? r : Infinity;
}

/** 时钟回拨防护后的已流逝毫秒 */
function elapsedMs(t: StaminaTimer, now: number): number {
  return Math.max(0, now - t.lastUpdateTs);
}

/** 由时间戳推导当前体力（脏数据下返回 finite，等于锚点值） */
export function computeCurrent(t: StaminaTimer, now: number): number {
  const gained = Math.floor(elapsedMs(t, now) / safeRate(t));
  return clamp(t.currentStamina + gained, 0, t.maxStamina);
}

/** 距下 1 点（ms）；已满或速率无效返回 null */
export function msUntilNext(t: StaminaTimer, now: number): number | null {
  const cur = computeCurrent(t, now);
  if (cur >= t.maxStamina) return null;
  const rate = safeRate(t);
  if (!Number.isFinite(rate)) return null;
  const rem = elapsedMs(t, now) % rate;
  return rate - rem;
}

/** 距满（ms）—— 仅依赖锚点，与 now 无关 */
export function msUntilFull(t: StaminaTimer): number {
  const need = t.maxStamina - t.currentStamina;
  return need <= 0 ? 0 : need * t.recoverMsPerPoint;
}

/** 从 now 时刻算距满（ms）—— 回满时刻 - now */
export function msUntilFullFrom(t: StaminaTimer, now: number): number {
  const fullAt = t.lastUpdateTs + msUntilFull(t);
  return Math.max(0, fullAt - now);
}

/** 回满的绝对时间戳（epoch ms）—— 仅依赖锚点 */
export function fullAtTs(t: StaminaTimer): number {
  return t.lastUpdateTs + msUntilFull(t);
}

/**
 * 每 N 点里程碑判定（语义：相对锚点，每恢复 N 点提醒一次）。
 * 返回本次应触发通知的里程碑值列表（可能因长时间睡眠跨多个）。
 */
export function pendingMilestones(t: StaminaTimer, now: number): number[] {
  if (!t.notifyEveryN || t.notifyEveryN <= 0) return [];
  const cur = computeCurrent(t, now);
  const out: number[] = [];
  for (let v = t.notifiedUpTo + t.notifyEveryN; v <= cur; v += t.notifyEveryN) {
    out.push(v);
  }
  return out;
}

/** 是否已满 */
export function isFull(t: StaminaTimer, now: number): boolean {
  return computeCurrent(t, now) >= t.maxStamina;
}

/**
 * 倒计时格式化（中文）：
 * < 1min → "X秒"；< 1h → "X分钟X秒"；< 24h → "X小时X分钟X秒"；≥ 24h → "X天X小时"
 */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}天${h % 24}小时`;
  }
  if (h >= 1) return `${h}小时${m}分钟${s}秒`;
  if (m >= 1) return `${m}分钟${s}秒`;
  return `${s}秒`;
}
