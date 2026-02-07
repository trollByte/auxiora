// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::get_version,
            commands::quick_reply,
        ])
        .setup(|_app| {
            // Tray and window setup handled by tauri.conf.json
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Auxiora desktop application");
}
