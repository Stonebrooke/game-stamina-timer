import { formatDuration, isFull, msUntilFullFrom } from "../lib/stamina";
import type { StaminaTimer } from "../lib/types";

interface Props {
  timers: StaminaTimer[];
  now: number;
}

/** 全局概览：追踪数 / 已满数 / 最快回满倒计时 */
export default function OverviewBar({ timers, now }: Props) {
  if (timers.length === 0) return null;

  const fullCount = timers.filter(t => isFull(t, now)).length;
  const pending = timers.filter(t => !isFull(t, now));
  const soonest = pending.length
    ? Math.min(...pending.map(t => msUntilFullFrom(t, now)))
    : null;
  const soonestTimer = pending.length
    ? pending.reduce((a, b) =>
        msUntilFullFrom(a, now) <= msUntilFullFrom(b, now) ? a : b
      )
    : null;

  return (
    <div className="overview">
      <div className="overview-item">
        <span className="overview-num">{timers.length}</span>
        <span className="overview-label">追踪游戏</span>
      </div>
      <div className="overview-item">
        <span className="overview-num">{fullCount}</span>
        <span className="overview-label">已回满</span>
      </div>
      <div className="overview-item">
        <span className="overview-num">
          {soonest === null ? "—" : formatDuration(soonest)}
        </span>
        <span className="overview-label">
          {soonestTimer ? `最快回满 · ${soonestTimer.name}` : "最快回满"}
        </span>
      </div>
    </div>
  );
}
