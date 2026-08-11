//! 持久化层：timers.json 读写。
//! - 原子写：先写 .tmp 再 rename，避免中途崩溃写坏文件；
//! - 损坏回退：解析失败时把原文件备份为 .bak，回退空库，不丢原始数据。
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;

use crate::timer::TimersFile;

pub struct TimerStore {
    pub path: PathBuf,
    pub file: TimersFile,
}

impl TimerStore {
    /// 加载；文件不存在时回退空库（warn=None），
    /// 文件损坏时备份为带时间戳的 .bak 并回退空库（warn=Some(提示)）。
    /// 返回 (Self, Option<String>) —— 调用方据此决定是否告警用户（P1-4）。
    pub fn load(path: PathBuf) -> (Self, Option<String>) {
        let (file, warn) = match std::fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<TimersFile>(&content) {
                Ok(f) => (f, None),
                Err(e) => {
                    // 损坏：备份为带时间戳 .bak（保留原始数据，便于人工恢复），回退空库
                    let bak = path.with_extension(format!("json.bak.{}", crate::timer::now_ms()));
                    let _ = std::fs::rename(&path, &bak);
                    (
                        TimersFile::empty(),
                        Some(format!(
                            "存档损坏已备份至 {}，已回退空库: {e}",
                            bak.display()
                        )),
                    )
                }
            },
            Err(_) => (TimersFile::empty(), None),
        };
        (Self { path, file }, warn)
    }

    /// 原子写：写 .tmp → fsync → rename（P1-5，防掉电丢写）
    pub fn save(&self) -> Result<(), String> {
        let tmp = self.path.with_extension("json.tmp");
        let content = serde_json::to_string_pretty(&self.file).map_err(|e| e.to_string())?;
        // fsync：先把临时文件刷盘，再原子 rename，避免「rename 成功但数据未落盘」的掉电丢写
        let mut f = File::create(&tmp).map_err(|e| format!("写入临时文件失败: {e}"))?;
        f.write_all(content.as_bytes())
            .map_err(|e| format!("写入临时文件失败: {e}"))?;
        f.sync_all().map_err(|e| format!("刷盘失败: {e}"))?;
        drop(f);
        std::fs::rename(&tmp, &self.path).map_err(|e| format!("原子替换失败: {e}"))?;
        Ok(())
    }

    /// 原子变更（P0-2）：先改内存，save 失败则自动回滚，保证内存与磁盘一致。
    /// 所有写命令统一收口于此，避免「先改内存后 save、失败已变」的静默数据丢失。
    pub fn mutate<F>(&mut self, f: F) -> Result<(), String>
    where
        F: FnOnce(&mut TimersFile) -> Result<(), String>,
    {
        let backup = self.file.clone();
        if let Err(e) = f(&mut self.file) {
            return Err(e); // 业务校验失败：不动内存
        }
        if let Err(e) = self.save() {
            self.file = backup; // 落盘失败：回滚内存
            return Err(e);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timer::StaminaTimer;

    fn temp_path(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "stamina-timer-test-{tag}-{}.json",
            uuid::Uuid::new_v4()
        ))
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
    fn round_trip_persists_timers() {
        let path = temp_path("roundtrip");
        {
            let mut store = TimerStore::load(path.clone()).0;
            store.file.timers.push(sample());
            store.save().expect("save ok");
        }
        let store = TimerStore::load(path.clone()).0;
        assert_eq!(store.file.timers.len(), 1);
        assert_eq!(store.file.timers[0], sample());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn corrupted_file_backs_up_and_falls_back_to_empty() {
        let path = temp_path("corrupt");
        std::fs::write(&path, "{ not valid json !!!").expect("write corrupt");
        let (store, warn) = TimerStore::load(path.clone());
        assert!(store.file.timers.is_empty());
        assert!(warn.is_some(), "损坏应返回告警提示");
        // 原文件已被备份为带时间戳的 .bak，且内容保留
        let bak = std::fs::read_dir(std::env::temp_dir())
            .unwrap()
            .filter_map(|e| e.ok().map(|e| e.path()))
            .find(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.contains("corrupt") && n.contains(".bak."))
                    .unwrap_or(false)
            })
            .expect("带时间戳的 .bak 应存在");
        let bak_content = std::fs::read_to_string(&bak).expect("bak readable");
        assert_eq!(bak_content, "{ not valid json !!!");
        let _ = std::fs::remove_file(&bak);
    }

    #[test]
    fn missing_file_loads_empty() {
        let path = temp_path("missing");
        let (store, warn) = TimerStore::load(path);
        assert!(store.file.timers.is_empty());
        assert!(warn.is_none());
    }
}
