/**
 * 游戏预设模板：新建计时器时一键填充，用户可再修改。
 * 预设只是默认值——游戏版本更新导致参数变化时用户手改即可。
 */
import type { GamePreset } from "./types";

export const GAME_PRESETS: GamePreset[] = [
  { label: "绝区零", resourceName: "电量", maxStamina: 240, minutesPerPoint: 6, color: "#7c5cff" },
  { label: "原神", resourceName: "原粹树脂", maxStamina: 200, minutesPerPoint: 8, color: "#4a9eff" },
  { label: "崩坏：星穹铁道", resourceName: "开拓力", maxStamina: 300, minutesPerPoint: 6, color: "#e8a33d" },
  { label: "鸣潮", resourceName: "结晶波片", maxStamina: 240, minutesPerPoint: 6, color: "#3dc8c0" },
  { label: "明日方舟", resourceName: "理智", maxStamina: 135, minutesPerPoint: 6, color: "#8a9199" }
];

/** 卡片可选配色池（自定义游戏时循环取用） */
export const COLOR_POOL: string[] = [
  "#4a9eff",
  "#7c5cff",
  "#3dc8c0",
  "#e8a33d",
  "#e86a92",
  "#6bbf59",
  "#8a9199"
];
