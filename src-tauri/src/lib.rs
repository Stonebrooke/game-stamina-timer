//! 应用装配：命令注册 + 系统托盘 + 窗口事件。
//! 关键约定（方案 §2）：窗口关闭 = 隐藏到托盘，不销毁 webview，
//! 保证前端 1s tick（UI 刷新 + 通知判定唯一 owner）持续运行。
mod commands;
mod store;
mod timer;

use std::sync::RwLock;

use commands::SharedStore;
use store::TimerStore;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
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
    use std::time::Duration;
    use crate::timer::notification_due;

    loop {
        std::thread::sleep(Duration::from_secs(30));
        let now = crate::timer::now_ms();
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
                                t.name,
                                t.max_stamina as i64,
                                t.max_stamina as i64
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
            let _ = handle
                .notification()
                .builder()
                .title(title)
                .body(body)
                .show();
            eprintln!("[notify] sent: {title}");
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

            // 通知判定下沉到独立线程（P1-1）：窗口隐藏后 WebView2 会节流前端 tick，
            // 故由后端每 30s 轮询直接计算满/里程碑并弹系统通知，不依赖 webview tick。
            let handle = app.handle().clone();
            std::thread::spawn(move || notification_loop(handle));

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
                // 关闭 = 隐藏到托盘（不销毁 webview，通知 tick 继续）
                let _ = window.hide();
                api.prevent_close();
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
            commands::import_timers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
