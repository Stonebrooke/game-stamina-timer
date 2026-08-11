// 桌面应用不显示控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    stamina_timer_lib::run()
}
