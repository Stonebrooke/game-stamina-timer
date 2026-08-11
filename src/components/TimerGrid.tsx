import type { StaminaTimer } from "../lib/types";
import TimerCard from "./TimerCard";

interface Props {
  timers: StaminaTimer[];
  now: number;
  onEdit: (t: StaminaTimer) => void;
  onDelete: (t: StaminaTimer) => void;
  onAnchor: (id: string, value: number) => Promise<void>;
  onAdd: () => void;
}

/** 卡片网格 + 空库引导 */
export default function TimerGrid({ timers, now, onEdit, onDelete, onAnchor, onAdd }: Props) {
  if (timers.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⏱</div>
        <h2>还没有计时器</h2>
        <p>添加第一个游戏，锚定当前体力后即可自动推算恢复进度。</p>
        <button className="btn btn-primary btn-lg" onClick={onAdd}>
          + 添加游戏
        </button>
      </div>
    );
  }

  return (
    <div className="grid">
      {timers.map(t => (
        <TimerCard
          key={t.id}
          timer={t}
          now={now}
          onEdit={onEdit}
          onDelete={onDelete}
          onAnchor={onAnchor}
        />
      ))}
    </div>
  );
}
