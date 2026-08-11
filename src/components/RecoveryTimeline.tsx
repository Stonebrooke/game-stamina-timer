import { formatDuration, fullAtTs, isFull } from "../lib/stamina";
import type { StaminaTimer } from "../lib/types";

interface Props {
  timers: StaminaTimer[];
  now: number;
}

const GUTTER = 96; // 左侧游戏名列宽
const RIGHT_PAD = 16;
const AXIS_H = 26; // 顶部时间刻度高度
const ROW_H = 30;
const WIDTH = 680;

const STEPS = [
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  3_600_000,
  2 * 3_600_000,
  4 * 3_600_000,
  6 * 3_600_000,
  12 * 3_600_000,
  86_400_000,
  2 * 86_400_000,
  7 * 86_400_000
];

function pickStep(rangeMs: number): number {
  for (const s of STEPS) {
    if (rangeMs / s <= 8) return s;
  }
  return 14 * 86_400_000;
}

function tickLabel(ts: number, step: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (step >= 86_400_000) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${hh}:${mm}`;
}

/**
 * 全部恢复时间轴：每游戏一行，标记回满时刻；左侧 now 游标。
 * 纯 SVG，随 1s tick 重渲染。
 */
export default function RecoveryTimeline({ timers, now }: Props) {
  if (timers.length === 0) return null;

  const entries = timers.map(t => ({
    t,
    full: isFull(t, now),
    fullAt: fullAtTs(t)
  }));

  const pending = entries.filter(e => !e.full);
  const height = AXIS_H + entries.length * ROW_H + 8;

  // 全部已满：短轴占位
  const rangeEnd =
    pending.length > 0 ? Math.max(...pending.map(e => e.fullAt)) : now + 3_600_000;
  const range = Math.max(rangeEnd - now, 60_000);
  const step = pickStep(range);

  const x = (ts: number) =>
    GUTTER + ((ts - now) / range) * (WIDTH - GUTTER - RIGHT_PAD);

  // 刻度：从 now 之后第一个 step 整数倍开始
  const firstTick = Math.ceil(now / step) * step;
  const ticks: number[] = [];
  for (let ts = firstTick; ts <= rangeEnd; ts += step) ticks.push(ts);

  return (
    <div className="timeline">
      <div className="timeline-title">恢复时间轴</div>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="timeline-svg" role="img">
        {/* 时间刻度 */}
        {ticks.map(ts => (
          <g key={ts}>
            <line
              x1={x(ts)}
              y1={AXIS_H - 8}
              x2={x(ts)}
              y2={height - 8}
              stroke="var(--border)"
              strokeDasharray="2 4"
            />
            <text x={x(ts)} y={AXIS_H - 12} textAnchor="middle" className="tl-tick">
              {tickLabel(ts, step)}
            </text>
          </g>
        ))}

        {/* now 游标 */}
        <line
          x1={GUTTER}
          y1={AXIS_H - 8}
          x2={GUTTER}
          y2={height - 8}
          stroke="var(--text-muted)"
          strokeWidth={1.5}
        />
        <text x={GUTTER + 4} y={AXIS_H - 12} className="tl-now">
          现在
        </text>

        {/* 每游戏一行 */}
        {entries.map((e, i) => {
          const cy = AXIS_H + i * ROW_H + ROW_H / 2;
          const dotX = e.full ? GUTTER : x(e.fullAt);
          return (
            <g key={e.t.id}>
              <text x={GUTTER - 8} y={cy + 4} textAnchor="end" className="tl-name">
                {e.t.name.length > 8 ? e.t.name.slice(0, 8) + "…" : e.t.name}
              </text>
              <line
                x1={GUTTER}
                y1={cy}
                x2={WIDTH - RIGHT_PAD}
                y2={cy}
                stroke="var(--ring-track)"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <circle
                cx={dotX}
                cy={cy}
                r={6}
                fill={e.full ? "var(--full-accent)" : e.t.color}
                stroke="var(--surface)"
                strokeWidth={2}
              >
                <title>
                  {e.t.name} · {e.full ? "已回满" : `${formatDuration(e.fullAt - now)} 后回满`}
                </title>
              </circle>
              <text
                x={Math.min(dotX + 10, WIDTH - RIGHT_PAD - 56)}
                y={cy + 4}
                className="tl-remain"
              >
                {e.full ? "已回满" : formatDuration(e.fullAt - now)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
