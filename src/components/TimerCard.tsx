import { memo, useState } from "react";
import {
  formatDuration,
  isFull,
  msUntilFullFrom,
  msUntilNext
} from "../lib/stamina";
import type { StaminaTimer } from "../lib/types";
import { useCurrent, useNow } from "../store/useTimers";
import CircularProgress from "./CircularProgress";

interface Props {
  timer: StaminaTimer;
  onEdit: (t: StaminaTimer) => void;
  onDelete: (t: StaminaTimer) => void;
  onAnchor: (id: string, value: number) => Promise<void>;
}

/** 单张计时卡：now 内部订阅（架构审查 ②），外层 React.memo 让未变 timer 的卡片跳过 diff。 */
function TimerCard({ timer, onEdit, onDelete, onAnchor }: Props) {
  const [anchoring, setAnchoring] = useState(false);
  const [anchorValue, setAnchorValue] = useState("");
  const [busy, setBusy] = useState(false);

  const now = useNow();
  const current = useCurrent(timer);
  const full = isFull(timer, now);
  const nextMs = msUntilNext(timer, now);
  const fullMs = msUntilFullFrom(timer, now);
  /** 快捷调整步长：优先跟随用户的每 N 点提醒设置，否则默认 10 */
  const step = timer.notifyEveryN > 0 ? timer.notifyEveryN : 10;

  const openAnchor = () => {
    setAnchorValue(String(current));
    setAnchoring(true);
  };

  /** 快捷 ±N：以当前推算值为基准锚定（消耗/补记体力） */
  const quickAdjust = async (delta: number) => {
    const v = Math.min(timer.maxStamina, Math.max(0, current + delta));
    setBusy(true);
    try {
      await onAnchor(timer.id, v);
    } finally {
      setBusy(false);
    }
  };

  const confirmAnchor = async () => {
    const v = Number(anchorValue);
    if (Number.isNaN(v) || v < 0 || v > timer.maxStamina) return;
    setBusy(true);
    try {
      await onAnchor(timer.id, v);
      setAnchoring(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`card ${full ? "card-full" : ""}`}>
      <div className="card-colorbar" style={{ background: timer.color }} />
      <div className="card-head">
        <span className="card-name" title={timer.name}>
          {timer.name}
        </span>
        {full && <span className="badge-full">已满</span>}
      </div>

      <div className="card-body">
        <CircularProgress
          progress={current / timer.maxStamina}
          color={timer.color}
          full={full}
        >
          <div className="ring-value">
            <span className="ring-current">{current}</span>
            <span className="ring-max">/ {timer.maxStamina}</span>
          </div>
        </CircularProgress>

        <div className="card-times">
          <div className="time-row">
            <span className="time-label">距满</span>
            <span className="time-value">{full ? "已回满" : formatDuration(fullMs)}</span>
          </div>
          <div className="time-row">
            <span className="time-label">下一点</span>
            <span className="time-value">
              {nextMs === null ? "—" : formatDuration(nextMs)}
            </span>
          </div>
        </div>
      </div>

      {anchoring ? (
        <div className="card-anchor">
          <input
            type="number"
            min={0}
            max={timer.maxStamina}
            value={anchorValue}
            onChange={e => setAnchorValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && void confirmAnchor()}
            autoFocus
          />
          <button className="btn btn-primary" disabled={busy} onClick={() => void confirmAnchor()}>
            确认
          </button>
          <button className="btn" disabled={busy} onClick={() => setAnchoring(false)}>
            取消
          </button>
        </div>
      ) : (
        <>
          <div className="card-quick">
            <button
              className="btn btn-sm"
              disabled={busy || current <= 0}
              title={`消耗 ${step} 点（锚定到 ${Math.max(0, current - step)}）`}
              onClick={() => void quickAdjust(-step)}
            >
              −{step}
            </button>
            <span className="quick-label">快速调整</span>
            <button
              className="btn btn-sm"
              disabled={busy || current >= timer.maxStamina}
              title={`补记 ${step} 点（锚定到 ${Math.min(timer.maxStamina, current + step)}）`}
              onClick={() => void quickAdjust(step)}
            >
              +{step}
            </button>
          </div>
          <div className="card-actions">
            <button className="btn btn-primary" onClick={openAnchor}>
              设为当前
            </button>
            <button className="btn" onClick={() => onEdit(timer)}>
              编辑
            </button>
            <button className="btn btn-danger" onClick={() => onDelete(timer)}>
              删除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(TimerCard);
