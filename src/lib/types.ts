/**
 * 前后端契约源：与 Rust `timer.rs` 的 serde(camelCase) 一一对应。
 * 修改字段时必须同步 Rust 侧。
 */

/** 体力计时器（持久化实体） */
export interface StaminaTimer {
  /** UUID */
  id: string;
  /** 游戏/角色名 */
  name: string;
  /** 每恢复 1 点所需毫秒 */
  recoverMsPerPoint: number;
  /** 体力上限 */
  maxStamina: number;
  /** 锚点值：用户最后一次手动确认时的体力 */
  currentStamina: number;
  /** 锚点时间戳（epoch ms），currentStamina 对应的时刻 */
  lastUpdateTs: number;
  /** 满体力时通知 */
  notifyOnFull: boolean;
  /** 每恢复 N 点通知（相对锚点；0 = 关闭） */
  notifyEveryN: number;
  /** 已通知到的最高里程碑值（去重用） */
  notifiedUpTo: number;
  /** 本周期是否已通知过「满」 */
  fullNotified: boolean;
  /** 卡片配色（hex） */
  color: string;
  /** 创建时间（epoch ms） */
  createdAt: number;
}

/** 新建计时器的入参（id/通知态由后端生成） */
export interface NewTimer {
  name: string;
  recoverMsPerPoint: number;
  maxStamina: number;
  currentStamina: number;
  notifyOnFull: boolean;
  notifyEveryN: number;
  color: string;
}

/** 持久化文件格式 */
export interface TimersFile {
  schemaVersion: number;
  timers: StaminaTimer[];
}

/** 游戏预设模板 */
export interface GamePreset {
  /** 预设名（游戏名） */
  label: string;
  /** 资源名（如「电量」「原粹树脂」） */
  resourceName: string;
  maxStamina: number;
  /** 每点恢复分钟数（展示友好，转 ms 由调用方做） */
  minutesPerPoint: number;
  color: string;
}
