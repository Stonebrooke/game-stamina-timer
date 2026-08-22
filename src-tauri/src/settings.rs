//! 应用设置：持久化到 app_data_dir/settings.json。
//! 关闭行为（托盘/退出）+ 通知总开关 + 退出确认偏好。
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum CloseBehavior {
    #[serde(rename = "tray")]
    Tray,
    #[serde(rename = "exit")]
    Exit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    /// 通知总开关（false 时后端通知线程整轮跳过）
    pub notifications_enabled: bool,
    /// 关闭窗口行为：tray = 最小化到托盘（不退出）；exit = 退出程序
    pub close_behavior: CloseBehavior,
    /// 关闭行为为 exit 时，是否「退出前不再确认」（false = 关闭弹一次确认）
    pub close_confirm_exit: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            notifications_enabled: true,
            close_behavior: CloseBehavior::Tray,
            close_confirm_exit: true,
        }
    }
}

impl AppSettings {
    /// 加载；文件不存在回退默认（warn=None），损坏则备份为带时间戳 .bak 并回退默认。
    pub fn load(path: PathBuf) -> (Self, Option<String>) {
        match std::fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<AppSettings>(&content) {
                Ok(s) => (s, None),
                Err(e) => {
                    let bak = path.with_extension(format!("json.bak.{}", crate::timer::now_ms()));
                    let _ = std::fs::rename(&path, &bak);
                    (
                        AppSettings::default(),
                        Some(format!(
                            "设置损坏已备份至 {}，已回退默认: {e}",
                            bak.display()
                        )),
                    )
                }
            },
            Err(_) => (AppSettings::default(), None),
        }
    }

    /// 落盘（settings.json 体积小、写频低，普通写即可）
    pub fn save(&self, path: &PathBuf) -> Result<(), String> {
        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(path, content).map_err(|e| format!("写入设置失败: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_tray_and_notifications_on() {
        let s = AppSettings::default();
        assert!(s.notifications_enabled);
        assert_eq!(s.close_behavior, CloseBehavior::Tray);
        assert!(s.close_confirm_exit);
    }

    #[test]
    fn round_trip_persists_and_parses_camel_case() {
        let dir =
            std::env::temp_dir().join(format!("stamina-settings-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        let s = AppSettings {
            notifications_enabled: false,
            close_behavior: CloseBehavior::Exit,
            close_confirm_exit: false,
        };
        s.save(&path).expect("save");
        let (loaded, warn) = AppSettings::load(path.clone());
        assert!(warn.is_none());
        assert_eq!(loaded, s);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_settings_falls_back_to_default_with_warning() {
        let dir =
            std::env::temp_dir().join(format!("stamina-settings-corrupt-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        std::fs::write(&path, "{ not valid").unwrap();
        let (loaded, warn) = AppSettings::load(path.clone());
        assert_eq!(loaded, AppSettings::default());
        assert!(warn.is_some());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
