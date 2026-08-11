//! 数据模型：与前端 `src/lib/types.ts` 单源契约对齐（camelCase）。
//! 修改字段时必须同步 TS 侧。
use serde::{Deserialize, Serialize};

/// 体力计时器（持久化实体）
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct StaminaTimer {
    pub id: String,
    pub name: String,
    pub recover_ms_per_point: f64,
    pub max_stamina: f64,
    pub current_stamina: f64,
    /// epoch ms
    pub last_update_ts: i64,
    pub notify_on_full: bool,
    /// 每恢复 N 点通知（相对锚点；0 = 关闭）
    pub notify_every_n: f64,
    /// 已通知到的最高里程碑值（去重用）
    pub notified_up_to: f64,
    pub full_notified: bool,
    pub color: String,
    /// epoch ms
    pub created_at: i64,
}

/// 新建计时器入参（id/通知态由后端生成）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTimer {
    pub name: String,
    pub recover_ms_per_point: f64,
    pub max_stamina: f64,
    pub current_stamina: f64,
    pub notify_on_full: bool,
    pub notify_every_n: f64,
    pub color: String,
}

/// 持久化文件格式（带版本，便于未来迁移）
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TimersFile {
    pub schema_version: u32,
    pub timers: Vec<StaminaTimer>,
}

impl TimersFile {
    pub fn empty() -> Self {
        Self {
            schema_version: 1,
            timers: Vec::new(),
        }
    }
}

fn validate_common(
    name: &str,
    recover_ms_per_point: f64,
    max_stamina: f64,
    current_stamina: f64,
    notify_every_n: f64,
) -> Result<(), String> {
    if name.trim().is_empty() || name.chars().count() > 50 {
        return Err("名称不能为空且不超过 50 字".into());
    }
    // 有限性 + 下界：Infinity/NaN 会漏过 `> 0.0`，必须显式 is_finite（P1-3）
    if !recover_ms_per_point.is_finite() || recover_ms_per_point <= 0.0 {
        return Err("每点恢复时间必须为大于 0 的有限值".into());
    }
    if !max_stamina.is_finite() || max_stamina < 1.0 {
        return Err("体力上限必须为 >= 1 的有限值".into());
    }
    if !current_stamina.is_finite() || !(0.0..=max_stamina).contains(&current_stamina) {
        return Err(format!("当前体力必须在 0-{max_stamina} 之间"));
    }
    if !notify_every_n.is_finite() || notify_every_n < 0.0 {
        return Err("每 N 点提醒不能为负".into());
    }
    Ok(())
}

pub fn validate_new(t: &NewTimer) -> Result<(), String> {
    validate_common(
        &t.name,
        t.recover_ms_per_point,
        t.max_stamina,
        t.current_stamina,
        t.notify_every_n,
    )
}

pub fn validate_timer(t: &StaminaTimer) -> Result<(), String> {
    validate_common(
        &t.name,
        t.recover_ms_per_point,
        t.max_stamina,
        t.current_stamina,
        t.notify_every_n,
    )?;
    if !t.notified_up_to.is_finite() || t.notified_up_to < 0.0 {
        return Err("notifiedUpTo 必须为 >= 0 的有限值".into());
    }
    if t.notified_up_to > t.max_stamina {
        return Err("notifiedUpTo 不能超过上限".into());
    }
    // 时间戳范围：必须在 (0, now+1天] —— 拒绝负数/0/天文数字（P1-3）
    let now = now_ms();
    if t.last_update_ts <= 0 || t.last_update_ts > now + 86_400_000 {
        return Err("锚点时间戳不合法".into());
    }
    if t.created_at < 0 {
        return Err("createdAt 不能为负".into());
    }
    Ok(())
}

/// 当前 epoch 毫秒
pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 由时间戳推导当前体力（与前端 stamina.ts 同算法；脏数据退化为锚点值，绝不产生 NaN）
pub fn current_stamina_of(t: &StaminaTimer, now: i64) -> f64 {
    let elapsed = (now - t.last_update_ts).max(0) as f64;
    let rate = if t.recover_ms_per_point > 0.0 && t.recover_ms_per_point.is_finite() {
        t.recover_ms_per_point
    } else {
        f64::INFINITY
    };
    let gained = (elapsed / rate).floor();
    (t.current_stamina + gained).clamp(0.0, t.max_stamina)
}

pub fn is_full(t: &StaminaTimer, now: i64) -> bool {
    current_stamina_of(t, now) >= t.max_stamina
}

/// 相对锚点的每 N 点里程碑（返回应触发通知的值列表；可能因长睡眠跨多个）
pub fn pending_milestones(t: &StaminaTimer, now: i64) -> Vec<f64> {
    if t.notify_every_n <= 0.0 {
        return Vec::new();
    }
    let cur = current_stamina_of(t, now);
    let mut out = Vec::new();
    let mut v = t.notified_up_to + t.notify_every_n;
    while v <= cur {
        out.push(v);
        v += t.notify_every_n;
    }
    out
}

/// 本次应发的通知：(是否为满通知, 最新里程碑值)。None = 无。
/// 后端通知线程与单测共用此决策，保证去重一致（P0-1/P1-1）。
pub fn notification_due(t: &StaminaTimer, now: i64) -> Option<(bool, f64)> {
    let full = is_full(t, now);
    if t.notify_on_full && full && !t.full_notified {
        return Some((true, t.max_stamina));
    }
    let ms = pending_milestones(t, now);
    if !ms.is_empty() {
        return Some((full, *ms.last().unwrap()));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid() -> StaminaTimer {
        StaminaTimer {
            id: "t1".into(),
            name: "测试游戏".into(),
            recover_ms_per_point: 360_000.0,
            max_stamina: 240.0,
            current_stamina: 100.0,
            last_update_ts: 1_000_000,
            notify_on_full: true,
            notify_every_n: 20.0,
            notified_up_to: 100.0,
            full_notified: false,
            color: "#4a9eff".into(),
            created_at: 0,
        }
    }

    #[test]
    fn accepts_valid_timer() {
        assert!(validate_timer(&valid()).is_ok());
    }

    #[test]
    fn rejects_infinite_rate() {
        let mut t = valid();
        t.recover_ms_per_point = f64::INFINITY;
        assert!(validate_timer(&t).is_err());
    }

    #[test]
    fn rejects_nan_rate() {
        let mut t = valid();
        t.recover_ms_per_point = f64::NAN;
        assert!(validate_timer(&t).is_err());
    }

    #[test]
    fn rejects_negative_timestamp() {
        let mut t = valid();
        t.last_update_ts = -9_000_000_000_000_000_000; // -9e18
        assert!(validate_timer(&t).is_err());
    }

    #[test]
    fn rejects_future_timestamp() {
        let mut t = valid();
        t.last_update_ts = now_ms() + 200_000_000; // > now + 1 天
        assert!(validate_timer(&t).is_err());
    }

    #[test]
    fn rejects_negative_notified_up_to() {
        let mut t = valid();
        t.notified_up_to = -5.0;
        assert!(validate_timer(&t).is_err());
    }

    #[test]
    fn rejects_nonfinite_notified_up_to() {
        let mut t = valid();
        t.notified_up_to = f64::NAN;
        assert!(validate_timer(&t).is_err());
    }

    #[test]
    fn current_stamina_matches_ts_formula() {
        let t = valid();
        // 锚定 100，6min/点，1h 后 +10
        assert_eq!(current_stamina_of(&t, t.last_update_ts + 3_600_000), 110.0);
        // 时钟回拨按 0
        assert_eq!(current_stamina_of(&t, t.last_update_ts - 999_999), 100.0);
        // 封顶
        assert_eq!(
            current_stamina_of(&t, t.last_update_ts + 999_999_999_999),
            240.0
        );
    }

    #[test]
    fn dirty_rate_degrades_to_anchor_value() {
        let mut t = valid();
        t.recover_ms_per_point = 0.0;
        let v = current_stamina_of(&t, t.last_update_ts + 1_000_000_000);
        assert!(v.is_finite());
        assert_eq!(v, 100.0);
        t.recover_ms_per_point = f64::NAN;
        assert!(current_stamina_of(&t, t.last_update_ts + 1_000_000_000).is_finite());
    }

    #[test]
    fn pending_milestones_relative_to_anchor() {
        let t = valid(); // 锚 100, N=20
        assert_eq!(
            pending_milestones(&t, t.last_update_ts + 8 * 3_600_000),
            vec![120.0, 140.0, 160.0, 180.0]
        );
    }

    #[test]
    fn full_notification_fires_once_then_deduped() {
        let mut t = valid();
        t.current_stamina = t.max_stamina;
        t.notified_up_to = 100.0;
        t.full_notified = false;
        let now = now_ms();
        assert!(notification_due(&t, now).is_some_and(|(f, _)| f));
        // 模拟后端应用去重：推进游标到上限
        t.full_notified = true;
        t.notified_up_to = t.max_stamina;
        assert!(notification_due(&t, now).is_none());
    }
}
