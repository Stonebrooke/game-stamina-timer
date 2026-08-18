//! 数据模型：与前端 `src/lib/types.ts` 单源契约对齐（camelCase）。
//! 修改字段时必须同步 TS 侧。
use serde::{Deserialize, Serialize};

/// 卡片可选配色池（与前端 `src/lib/presets.ts` 的 COLOR_POOL 一一对应，共 17 色）。
/// 计时器配色必须取自本池，防止脏数据写入任意 hex 导致 UI 串色 / 解析异常（P1-5）。
pub const TIMER_COLORS: &[&str] = &[
    "#ef4444", "#e8a33d", "#facc15", "#e86a92", "#4a9eff", "#0ea5e9", "#7c5cff", "#3dc8c0",
    "#6bbf59", "#10b981", "#8a9199", "#64748b", "#a8a29e", "#c4b5fd", "#fda4af", "#7dd3fc",
    "#86efac",
];

/// 配色校验：必须为内置色板成员（P1-5）
pub fn validate_color(c: &str) -> Result<(), String> {
    if TIMER_COLORS.contains(&c) {
        Ok(())
    } else {
        Err(format!("配色必须为内置色板之一，收到: {c}"))
    }
}

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
    color: &str,
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
    validate_color(color)?; // 配色须取自固定池（P1-5）
    Ok(())
}

pub fn validate_new(t: &NewTimer) -> Result<(), String> {
    validate_common(
        &t.name,
        t.recover_ms_per_point,
        t.max_stamina,
        t.current_stamina,
        t.notify_every_n,
        &t.color,
    )
}

pub fn validate_timer(t: &StaminaTimer) -> Result<(), String> {
    validate_common(
        &t.name,
        t.recover_ms_per_point,
        t.max_stamina,
        t.current_stamina,
        t.notify_every_n,
        &t.color,
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

    /// 从 contracts/contract-fixtures.json 读取 baseline timer（与 TS 端 makeTimer 同源，
    /// 消除双端 fixture 默认值重复，T3 收口）。fixture 仅含公式相关字段；
    /// id/name/full_notified/created_at 等非公式字段在双端各自以固定值补齐。
    fn fixtures_json() -> serde_json::Value {
        let raw = include_str!("../../contracts/contract-fixtures.json");
        serde_json::from_str(raw).expect("contract-fixtures.json 解析失败")
    }

    fn baseline_timer() -> StaminaTimer {
        let t = &fixtures_json()["formulaSamples"][0]["timer"];
        StaminaTimer {
            id: "t1".into(),
            name: "测试游戏".into(),
            recover_ms_per_point: t["recoverMsPerPoint"].as_f64().expect("recoverMsPerPoint"),
            max_stamina: t["maxStamina"].as_f64().expect("maxStamina"),
            current_stamina: t["currentStamina"].as_f64().expect("currentStamina"),
            last_update_ts: t["lastUpdateTs"].as_i64().expect("lastUpdateTs"),
            notify_on_full: t["notifyOnFull"].as_bool().expect("notifyOnFull"),
            notify_every_n: t["notifyEveryN"].as_f64().expect("notifyEveryN"),
            notified_up_to: t["notifiedUpTo"].as_f64().expect("notifiedUpTo"),
            full_notified: false,
            color: t["color"].as_str().expect("color").to_string(),
            created_at: 0,
        }
    }

    fn valid() -> StaminaTimer {
        baseline_timer()
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
        // 公式契约来自 contracts/contract-fixtures.json（R3：双端共享单一真源，不再各写一套）
        let t = valid();
        let cases = fixtures_json()["formulaSamples"][0]["currentCases"]
            .as_array()
            .expect("currentCases 应为数组");
        for c in cases {
            let off = c["nowOffsetMs"].as_i64().expect("nowOffsetMs");
            let expected = c["expected"].as_f64().expect("expected");
            assert_eq!(
                current_stamina_of(&t, t.last_update_ts + off),
                expected,
                "公式契约用例 nowOffsetMs={off} 不符"
            );
        }
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
        // 里程碑契约来自 contract-fixtures.json（R3：与 TS 端同源，单一真源）
        let t = valid();
        let pm = &fixtures_json()["formulaSamples"][0]["pendingMilestones"];
        let off = pm["nowOffsetMs"].as_i64().expect("nowOffsetMs");
        let expected: Vec<f64> = pm["expected"]
            .as_array()
            .expect("expected 应为数组")
            .iter()
            .map(|x| x.as_f64().expect("expected 元素"))
            .collect();
        assert_eq!(pending_milestones(&t, t.last_update_ts + off), expected);
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

    #[test]
    fn rejects_unknown_color() {
        let mut t = valid();
        t.color = "#000000".into();
        assert!(validate_timer(&t).is_err());
    }

    #[test]
    fn color_must_be_pool_member() {
        for c in super::TIMER_COLORS {
            let mut t = valid();
            t.color = c.to_string();
            assert!(validate_timer(&t).is_ok(), "色板成员应校验通过: {c}");
        }
    }
}
