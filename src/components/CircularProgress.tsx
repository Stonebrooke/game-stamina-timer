import type { ReactNode } from "react";

interface Props {
  /** 0..1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  /** 已满高亮 */
  full?: boolean;
  children?: ReactNode;
}

/** SVG 圆环进度：中心放自定义内容（当前体力等） */
export default function CircularProgress({
  progress,
  size = 120,
  strokeWidth = 10,
  color,
  full = false,
  children
}: Props) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  const dash = c * p;
  const ringColor = full ? "#14b8a6" : color;

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.3s ease" }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
