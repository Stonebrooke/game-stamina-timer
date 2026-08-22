/**
 * 游戏预设模板：新建计时器时一键填充，用户可再修改。
 * 预设只是默认值——游戏版本更新导致参数变化时用户手改即可。
 */
import type { GamePreset } from "./types";

export const GAME_PRESETS: GamePreset[] = [
  { label: "绝区零", resourceName: "电量", maxStamina: 240, secondsPerPoint: 360, color: "#7c5cff" },
  { label: "原神", resourceName: "原粹树脂", maxStamina: 200, secondsPerPoint: 480, color: "#4a9eff" },
  { label: "崩坏：星穹铁道", resourceName: "开拓力", maxStamina: 300, secondsPerPoint: 360, color: "#e8a33d" },
  { label: "鸣潮", resourceName: "结晶波片", maxStamina: 240, secondsPerPoint: 360, color: "#3dc8c0" },
  { label: "明日方舟", resourceName: "理智", maxStamina: 210, secondsPerPoint: 360, color: "#8a9199" }
];

/**
 * 卡片可选配色池：按「暖 / 冷 / 中性 / 柔和」四族排列，共 16 色。
 * 与初始 7 色保持同一中饱和、现代中性风家族，确保整体协调、互不串色。
 * 自定义游戏时按顺序循环取用；新增色块不破坏已有计时器的颜色存储。
 */
export const COLOR_POOL: string[] = [
  // —— 暖色：红 / 橙 / 黄 / 玫 ——
  "#ef4444",
  "#e8a33d",
  "#facc15",
  "#e86a92",
  // —— 冷色：蓝 / 天蓝 / 紫 / 青 / 绿 / 翠 ——
  "#4a9eff",
  "#0ea5e9",
  "#7c5cff",
  "#3dc8c0",
  "#6bbf59",
  "#10b981",
  // —— 中性：灰 / 石板 / 暖灰 ——
  "#8a9199",
  "#64748b",
  "#a8a29e",
  // —— 柔和：薰衣草 / 粉 / 粉蓝 / 薄荷 ——
  "#c4b5fd",
  "#fda4af",
  "#7dd3fc",
  "#86efac"
];

/** 新建计时器默认配色（与品牌主色 --primary 一致，避免默认跳到暖色首选项） */
export const DEFAULT_COLOR = "#4a9eff";
