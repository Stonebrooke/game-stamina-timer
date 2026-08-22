//! 应用装配：命令注册 + 系统托盘 + 窗口事件 + 设置。
//! 关键约定（方案 §2）：窗口关闭默认 = 隐藏到托盘，不销毁 webview，
//! 保证前端 1s tick（UI 刷新 + 通知判定唯一 owner）持续运行。
mod commands;
mod settings;
mod store;
mod timer;

use std::sync::RwLock;

use commands::SharedStore;
use settings::AppSettings;
use store::TimerStore;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

/// 后端通知线程（P1-1）：每 30s 轮询，直接计算满/里程碑并弹系统通知。
/// 不依赖前端 webview tick —— 解决窗口隐藏后 WebView2 节流导致通知延迟的问题。
/// 去重游标（notified_up_to / full_notified）与前端原逻辑一致，保证只发一次。
///
/// 临界区纪律（架构审查 ①）：持锁期间**只做**内存决策 + 改写游标 + 一次 `save()`
/// （本地 fsync，ms 级），**绝不**在锁内调用 `show()`（Windows Toast / COM I/O，可阻塞
/// 数十~数百 ms）。`show()` 在释放锁后执行，使通知弹出与用户命令彻底解耦——
/// 否则全局唯一锁被通知 I/O 占住时，所有 `add/update/delete/import` 会被串行阻塞（UI 冻结）。
fn notification_loop(handle: tauri::AppHandle) {
    use crate::timer::notification_due;
    use std::time::Duration;

    loop {
        std::thread::sleep(Duration::from_secs(30));
        let now = crate::timer::now_ms();

        // 全局通知开关：关闭则整轮跳过（不推进游标，重新开启后补发一次，符合预期）
        let notif_on = {
            let settings_state = handle.state::<RwLock<AppSettings>>();
            let guard = match settings_state.read() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            guard.notifications_enabled
        };
        if !notif_on {
            continue;
        }

        let store = handle.state::<SharedStore>();

        // 1) 持锁（写锁）：仅决策 + 改写游标 + 落盘；临界区无外部 I/O 副作用
        let pending: Vec<(String, String)> = {
            let mut guard = match store.write() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            let mut out = Vec::new();
            let mut dirty = false;
            for t in guard.file.timers.iter_mut() {
                match notification_due(t, now) {
                    None => continue,
                    Some((full, latest)) => {
                        let title = if full {
                            "体力已回满".to_string()
                        } else {
                            "体力恢复提醒".to_string()
                        };
                        let body = if full {
                            format!(
                                "{} 体力已回满 {}/{}",
                                t.name, t.max_stamina as i64, t.max_stamina as i64
                            )
                        } else {
                            format!("{} 体力已恢复到 {} 点", t.name, latest as i64)
                        };
                        // 应用去重游标（与前端原逻辑一致）
                        if full {
                            t.full_notified = true;
                            t.notified_up_to = t.max_stamina;
                        } else {
                            t.notified_up_to = latest;
                            t.full_notified = full || t.full_notified;
                        }
                        out.push((title, body));
                        dirty = true;
                    }
                }
            }
            if dirty {
                let _ = guard.save();
            }
            out
        }; // ← 写锁在此释放

        // 2) 无锁：弹系统通知（纯副作用，不碰共享状态，不阻塞任何用户命令）
        for (title, body) in &pending {
            if let Err(e) = handle
                .notification()
                .builder()
                .title(title)
                .body(body)
                .show()
            {
                // 注意：tauri-plugin-notification 的 show() 返回 Ok 后异步发送、错误被吞，
                // 这里仅记录真实失败原因，便于排障（根因：未注册 AUMID / 未授权等）。
                eprintln!("[notify] send failed: {e}");
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // 数据目录与存储
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败: {e}"))?;
            let (store, load_warn) = TimerStore::load(dir.join("timers.json"));
            if let Some(w) = load_warn {
                eprintln!("[store] {w}");
            }
            app.manage(RwLock::new(store));

            // 应用设置（项 1）：持久化到 settings.json，全局管理
            let (settings, settings_warn) = AppSettings::load(dir.join("settings.json"));
            if let Some(w) = settings_warn {
                eprintln!("[settings] {w}");
            }
            app.manage(RwLock::new(settings));

            // 通知判定下沉到独立线程（P1-1）：窗口隐藏后 WebView2 会节流前端 tick，
            // 故由后端每 30s 轮询直接计算满/里程碑并弹系统通知，不依赖 webview tick。
            let handle = app.handle().clone();
            std::thread::spawn(move || notification_loop(handle));

            // AUMID 快捷方式自愈（Windows only，幂等）：保证安装版 toast 能弹出
            crate::ensure_aumid_shortcut();

            // 托盘菜单：打开 / 退出
            let open = MenuItem::with_id(app, "open", "打开", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("默认窗口图标缺失").clone())
                .menu(&menu)
                .tooltip("游戏体力计时器")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // 左键单击托盘图标 = 唤起主窗口
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // 读设置决定关闭行为（项 5）：退出确认仅弹出一次
                let (behavior, confirm) = {
                    let settings_state = window.state::<RwLock<AppSettings>>();
                    let guard = match settings_state.read() {
                        Ok(g) => g,
                        Err(p) => p.into_inner(),
                    };
                    (guard.close_behavior, guard.close_confirm_exit)
                };
                match behavior {
                    settings::CloseBehavior::Tray => {
                        // 隐藏到托盘（不销毁 webview，通知 tick 继续）
                        let _ = window.hide();
                        api.prevent_close();
                    }
                    settings::CloseBehavior::Exit => {
                        if confirm {
                            // 关闭前确认仅弹一次：拦截关闭，前端弹确认 modal
                            api.prevent_close();
                            let _ = window.emit("exit-confirm-requested", ());
                        } else {
                            // 已勾选「不再确认」：统一经 exit_app 显式退出，
                            // 避免托盘+通知线程下窗口关闭但进程残留的幽灵态
                            api.prevent_close();
                            window.app_handle().exit(0);
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_timers,
            commands::add_timer,
            commands::update_timer,
            commands::delete_timer,
            commands::anchor_timer,
            commands::mark_notified,
            commands::export_timers,
            commands::import_timers,
            get_app_settings,
            set_app_settings,
            test_notification,
            check_notification_support,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/* ---------------- 设置命令（项 1） ---------------- */

#[tauri::command]
fn get_app_settings(store: tauri::State<RwLock<AppSettings>>) -> Result<AppSettings, String> {
    let guard = store.read().map_err(|_| "读取设置失败".to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn set_app_settings(
    app: tauri::AppHandle,
    store: tauri::State<RwLock<AppSettings>>,
    settings: AppSettings,
) -> Result<(), String> {
    // 先落盘（save 借用 &self，不移动 settings）
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join("settings.json");
    settings.save(&path)?;
    // 再写内存
    let mut guard = store.write().map_err(|_| "写入设置失败".to_string())?;
    *guard = settings;
    Ok(())
}

/* ---------------- 通知测试 / 诊断（项 1 审查修正 G1/G7） ---------------- */

#[tauri::command]
fn test_notification(app: tauri::AppHandle) -> Result<String, String> {
    // 注意：tauri-plugin-notification 的 show() 返回 Ok 后异步发送、错误被吞（根因），
    // 故成功文案不得声称「已发送成功」，仅提示已触发 + 引导诊断。
    app.notification()
        .builder()
        .title("游戏体力计时器")
        .body("测试通知已触发：若数秒内未弹出，请运行诊断并检查 Windows 通知设置。")
        .show()
        .map(|_| "测试通知已触发；若数秒内未弹出，请查看下方诊断。".to_string())
        .map_err(|e| format!("触发测试通知失败: {e}"))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn check_notification_support() -> Result<String, String> {
    use std::path::PathBuf;
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let start_menu = PathBuf::from(&local)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs");
    let lnk = start_menu.join("Game Stamina Timer.lnk");
    let lnk_exists = lnk.exists();
    let mut msg = String::from("Windows 通知诊断：\n");
    msg.push_str(&format!(
        "· 开始菜单快捷方式（含 AUMID）：{}（路径 {}）\n",
        if lnk_exists { "存在" } else { "缺失" },
        lnk.display()
    ));
    msg.push_str("· 安装版（开始菜单启动，非 target\\debug|release 目录）才支持 toast 通知；\n");
    msg.push_str(
        "· 请在 Windows 设置 > 系统 > 通知 > 游戏体力恢复计时器 中确认已开启，并关闭专注助手拦截。",
    );
    Ok(msg)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn check_notification_support() -> Result<String, String> {
    Ok("当前为非 Windows 平台；toast 通知为 Windows 专属能力，桌面应用安装版生效。".to_string())
}

/* ---------------- 退出（项 5：避免幽灵态） ---------------- */

#[tauri::command]
fn exit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

/* ---------------- AUMID 快捷方式自愈（项 1 审查修正 S1/S2） ---------------- */
/// 安全提示：计划原建议的 `windows-shortcuts` crate 在 crates.io 已被占用为恶意/占位包
/// （仅 0.0.1，描述「Fuck Auto HotKeys」，无 lib 仅二进制），严禁使用。
/// AUMID 须经 Windows COM `IPropertyStore::SetValue(PKEY_AppUserModel_ID)` 写入开始菜单 .lnk；
/// 此实现需在真机（Windows + `windows` crate）编译验证，本沙箱无法编译 Windows 目标，
/// 故先留安全桩（仅做存在性诊断打印，不阻塞启动），由后续在真机迭代补全实际写 AUMID。
#[cfg(target_os = "windows")]
fn ensure_aumid_shortcut() {
    use std::path::PathBuf;
    let local = match std::env::var("LOCALAPPDATA") {
        Ok(v) => v,
        Err(_) => return,
    };
    let lnk = PathBuf::from(local)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Game Stamina Timer.lnk");
    if lnk.exists() {
        eprintln!("[aumid] 开始菜单快捷方式已存在：{}", lnk.display());
    } else {
        eprintln!(
            "[aumid] 开始菜单快捷方式缺失（预期由 NSIS 安装器创建）：{}",
            lnk.display()
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn ensure_aumid_shortcut() {}
