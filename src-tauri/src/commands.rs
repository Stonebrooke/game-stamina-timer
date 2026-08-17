//! IPC 命令入口：只做参数校验 + 分发，业务读写落在 store。
//! 契约见方案 §5.5。统一错误格式：Result<T, String>。
use std::path::Path;
use std::sync::{RwLock, RwLockReadGuard, RwLockWriteGuard};

use tauri::State;
use uuid::Uuid;

use crate::store::TimerStore;
use crate::timer::{now_ms, validate_new, validate_timer, NewTimer, StaminaTimer, TimersFile};

/// 读多写少的桌面单用户场景：用 RwLock 替代 Mutex，
/// 让多次 `list_timers`（前端轮询）/ `export_timers` 的读并发，不被写锁串行化。
pub type SharedStore = RwLock<TimerStore>;

/// 非阻塞排障日志：命令入口打点（架构审查「监控」补充项，清单 #6）。
/// 走 stderr，避免任何 I/O 阻塞命令主路径。
macro_rules! trace_cmd {
    ($name:expr) => {
        eprintln!("[cmd] {} @{}", $name, crate::timer::now_ms());
    };
}

/// 读锁：遇中毒（上游 panic 残留）恢复数据，不令命令永久失败
fn read_lock<'a>(
    store: &'a State<'a, SharedStore>,
) -> Result<RwLockReadGuard<'a, TimerStore>, String> {
    match store.read() {
        Ok(g) => Ok(g),
        Err(p) => Ok(p.into_inner()),
    }
}

/// 写锁：遇中毒恢复数据（同 read_lock 语义）
fn write_lock<'a>(
    store: &'a State<'a, SharedStore>,
) -> Result<RwLockWriteGuard<'a, TimerStore>, String> {
    match store.write() {
        Ok(g) => Ok(g),
        Err(p) => Ok(p.into_inner()),
    }
}

/// 路径安全校验：必须绝对路径 + .json 扩展名，拒绝相对路径/UNC/目录穿越（P1-2）
fn is_safe_json_path(path: &str) -> bool {
    if path.contains("..") || path.starts_with("\\\\") {
        return false;
    }
    let p = Path::new(path);
    if !p.is_absolute() {
        return false;
    }
    matches!(p.extension().and_then(|e| e.to_str()), Some("json"))
}

#[tauri::command]
pub fn list_timers(store: State<SharedStore>) -> Result<Vec<StaminaTimer>, String> {
    trace_cmd!("list_timers");
    Ok(read_lock(&store)?.file.timers.clone())
}

#[tauri::command]
pub fn add_timer(store: State<SharedStore>, input: NewTimer) -> Result<StaminaTimer, String> {
    trace_cmd!("add_timer");
    validate_new(&input)?;
    let now = now_ms();
    let timer = StaminaTimer {
        id: Uuid::new_v4().to_string(),
        name: input.name,
        recover_ms_per_point: input.recover_ms_per_point,
        max_stamina: input.max_stamina,
        current_stamina: input.current_stamina,
        last_update_ts: now, // 锚定到创建时刻
        notify_on_full: input.notify_on_full,
        notify_every_n: input.notify_every_n,
        notified_up_to: input.current_stamina, // 从锚点开始计里程碑
        full_notified: false,
        color: input.color,
        created_at: now,
    };
    let mut guard = write_lock(&store)?;
    guard.mutate(|f| {
        f.timers.push(timer.clone());
        Ok(())
    })?;
    Ok(timer)
}

/// 合并更新：根据哪些字段变化决定重锚点（P1-6）。
/// - 用户手动改了当前体力 → 以用户输入值为新锚点（同 anchor_timer 语义）；
/// - 改了恢复速率/上限（但没改当前体力）→ 用现有锚点公式算出真实当前体力作为新锚点值，
///   避免「新速率 × 旧锚点」导致体力突跳；
/// - 都没改 → 保留原锚点时间戳与通知态。
fn merge_update(existing: &StaminaTimer, timer: StaminaTimer, now: i64) -> StaminaTimer {
    let mut next = timer;
    let current_changed = (existing.current_stamina - next.current_stamina).abs() > f64::EPSILON;
    let rate_changed = (existing.recover_ms_per_point - next.recover_ms_per_point).abs() > 1e-6;
    let max_changed = (existing.max_stamina - next.max_stamina).abs() > 1e-6;

    if current_changed {
        next.last_update_ts = now;
        next.notified_up_to = next.current_stamina;
        next.full_notified = false;
    } else if rate_changed || max_changed {
        let real = crate::timer::current_stamina_of(existing, now).clamp(0.0, next.max_stamina);
        next.current_stamina = real;
        next.last_update_ts = now;
        next.notified_up_to = real;
        next.full_notified = false;
    } else {
        next.last_update_ts = existing.last_update_ts;
        next.notified_up_to = existing.notified_up_to.min(next.max_stamina);
        next.full_notified = existing.full_notified;
    }
    next.created_at = existing.created_at;
    next
}

#[tauri::command]
pub fn update_timer(
    store: State<SharedStore>,
    timer: StaminaTimer,
) -> Result<StaminaTimer, String> {
    trace_cmd!("update_timer");
    validate_timer(&timer)?;
    let mut guard = write_lock(&store)?;
    let existing = guard
        .file
        .timers
        .iter()
        .find(|t| t.id == timer.id)
        .cloned()
        .ok_or_else(|| "计时器不存在".to_string())?;

    let next = merge_update(&existing, timer, now_ms());

    guard.mutate(|f| {
        let e = f
            .timers
            .iter_mut()
            .find(|x| x.id == next.id)
            .ok_or_else(|| "计时器不存在".to_string())?;
        *e = next.clone();
        Ok(())
    })?;
    Ok(next)
}

#[tauri::command]
pub fn delete_timer(store: State<SharedStore>, id: String) -> Result<(), String> {
    trace_cmd!("delete_timer");
    let mut guard = write_lock(&store)?;
    guard.mutate(|f| {
        let before = f.timers.len();
        f.timers.retain(|t| t.id != id);
        if f.timers.len() == before {
            return Err("计时器不存在".into());
        }
        Ok(())
    })
}

/// 设为当前：写锚点并重置通知周期
#[tauri::command]
pub fn anchor_timer(
    store: State<SharedStore>,
    id: String,
    current_stamina: f64,
) -> Result<StaminaTimer, String> {
    trace_cmd!("anchor_timer");
    let mut guard = write_lock(&store)?;
    let max = guard
        .file
        .timers
        .iter()
        .find(|t| t.id == id)
        .map(|t| t.max_stamina)
        .ok_or_else(|| "计时器不存在".to_string())?;
    if !(0.0..=max).contains(&current_stamina) {
        return Err(format!("当前体力必须在 0-{max} 之间"));
    }
    let out = guard.mutate(|f| {
        let t = f
            .timers
            .iter_mut()
            .find(|x| x.id == id)
            .ok_or_else(|| "计时器不存在".to_string())?;
        t.current_stamina = current_stamina;
        t.last_update_ts = now_ms();
        t.notified_up_to = current_stamina;
        t.full_notified = false;
        Ok(t.clone())
    })?;
    Ok(out)
}

/// 导出全部计时器到指定路径（路径须为 .json 绝对路径，P1-2）
#[tauri::command]
pub fn export_timers(store: State<SharedStore>, path: String) -> Result<(), String> {
    trace_cmd!("export_timers");
    if !is_safe_json_path(&path) {
        return Err("仅支持导出到 .json 绝对路径（拒绝相对路径/UNC/目录穿越）".into());
    }
    let guard = read_lock(&store)?;
    let content = serde_json::to_string_pretty(&guard.file).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| format!("导出失败: {e}"))
}

/// 从指定路径导入：校验后按 id 合并（同 id 覆盖），返回导入条数
#[tauri::command]
pub fn import_timers(store: State<SharedStore>, path: String) -> Result<usize, String> {
    trace_cmd!("import_timers");
    if !is_safe_json_path(&path) {
        return Err("仅支持导入 .json 文件（拒绝相对路径/UNC/目录穿越）".into());
    }
    let meta = std::fs::metadata(&path).map_err(|e| format!("读取文件失败: {e}"))?;
    if meta.len() > 2 * 1024 * 1024 {
        return Err("文件过大（上限 2MB）".into());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {e}"))?;
    let incoming: TimersFile =
        serde_json::from_str(&content).map_err(|e| format!("文件格式不正确: {e}"))?;
    if incoming.schema_version > 1 {
        return Err(format!(
            "文件版本过新（v{}），请升级应用",
            incoming.schema_version
        ));
    }
    if incoming.timers.len() > 1000 {
        return Err("计时器数量过多（上限 1000）".into());
    }
    // 逐条校验，任何一条非法则整体拒绝（不做部分导入）
    for t in &incoming.timers {
        validate_timer(t).map_err(|e| format!("「{}」校验失败: {e}", t.name))?;
    }

    let count = incoming.timers.len();
    let mut guard = write_lock(&store)?;
    guard.mutate(|f| {
        for t in incoming.timers {
            match f.timers.iter_mut().find(|x| x.id == t.id) {
                Some(existing) => *existing = t,
                None => f.timers.push(t),
            }
        }
        Ok(())
    })?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;
    use uuid::Uuid;

    #[test]
    fn is_safe_json_path_rejects_unsafe() {
        // 绝对路径判定与平台相关：Windows 认盘符/UNC，Unix 认前导 /
        #[cfg(windows)]
        {
            assert!(is_safe_json_path("C:\\Users\\me\\stamina.json"));
            assert!(!is_safe_json_path("C:\\Users\\me\\stamina.txt"));
            assert!(!is_safe_json_path("\\\\server\\share\\x.json"));
            assert!(!is_safe_json_path("C:\\Users\\me\\..\\x.json"));
        }
        #[cfg(unix)]
        {
            assert!(is_safe_json_path("/tmp/stamina.json"));
            assert!(!is_safe_json_path("/tmp/stamina.txt"));
            assert!(!is_safe_json_path("/tmp/../etc/x.json"));
        }
        // 跨平台通用：相对路径一律拒绝
        assert!(!is_safe_json_path("relative/path.json"));
    }

    fn sample() -> StaminaTimer {
        StaminaTimer {
            id: "t1".into(),
            name: "绝区零".into(),
            recover_ms_per_point: 360_000.0,
            max_stamina: 240.0,
            current_stamina: 100.0,
            last_update_ts: 1_000_000,
            notify_on_full: true,
            notify_every_n: 20.0,
            notified_up_to: 100.0,
            full_notified: false,
            color: "#7c5cff".into(),
            created_at: 0,
        }
    }

    #[test]
    fn mutate_rolls_back_on_save_failure() {
        // 路径父目录不存在 → save 写入 .tmp 失败 → mutate 必须回滚内存
        let bad_dir = temp_dir().join(format!("stamina-nonexistent-{}", Uuid::new_v4()));
        let mut store = TimerStore {
            path: bad_dir.join("timers.json"),
            file: TimersFile::empty(),
        };
        store.file.timers.push(sample());
        let before = store.file.timers.len();

        let res = store.mutate(|f| {
            f.timers.push(sample());
            Ok(())
        });

        assert!(res.is_err(), "save 失败应返回 Err");
        assert_eq!(store.file.timers.len(), before, "内存须回滚到变更前");
    }

    fn existing() -> StaminaTimer {
        StaminaTimer {
            id: "t1".into(),
            name: "绝区零".into(),
            recover_ms_per_point: 360_000.0,
            max_stamina: 240.0,
            current_stamina: 100.0,
            last_update_ts: 1_000_000,
            notify_on_full: true,
            notify_every_n: 20.0,
            notified_up_to: 100.0,
            full_notified: false,
            color: "#7c5cff".into(),
            created_at: 0,
        }
    }

    #[test]
    fn merge_update_manual_current_reanchors_with_typed_value() {
        let ex = existing();
        let mut incoming = ex.clone();
        incoming.current_stamina = 150.0; // 手动改当前体力
        let now = now_ms();
        let next = merge_update(&ex, incoming, now);
        assert_eq!(next.current_stamina, 150.0);
        assert_eq!(next.last_update_ts, now); // 重锚点到 now
        assert_eq!(next.notified_up_to, 150.0);
        assert!(!next.full_notified);
    }

    #[test]
    fn merge_update_rate_change_recomputes_real_current() {
        let mut ex = existing();
        // 锚定 100，6min/点，已过去 1h → 真实当前 110
        ex.last_update_ts = now_ms() - 3_600_000;
        let mut incoming = ex.clone();
        incoming.recover_ms_per_point = 180_000.0; // 速率改成 3min/点
        let now = now_ms();
        let next = merge_update(&ex, incoming, now);
        // 不应突跳到用新速率算，而是用旧锚点公式的真实值 110 作为新锚点
        assert_eq!(next.current_stamina, 110.0);
        assert_eq!(next.last_update_ts, now);
        assert_eq!(next.notified_up_to, 110.0);
    }

    #[test]
    fn merge_update_no_change_preserves_anchor_and_dedup() {
        let ex = existing();
        let incoming = ex.clone();
        let now = now_ms();
        let next = merge_update(&ex, incoming, now);
        assert_eq!(next.last_update_ts, ex.last_update_ts); // 锚点时间戳不变
        assert_eq!(next.notified_up_to, ex.notified_up_to);
        assert_eq!(next.full_notified, ex.full_notified);
        assert_eq!(next.created_at, ex.created_at);
    }
}
