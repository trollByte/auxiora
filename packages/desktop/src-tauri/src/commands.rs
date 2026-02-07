use serde::Serialize;

#[derive(Serialize)]
pub struct AppStatus {
    pub version: String,
    pub uptime: u64,
    pub ollama_running: bool,
}

#[tauri::command]
pub fn get_status() -> AppStatus {
    AppStatus {
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime: 0,
        ollama_running: false,
    }
}

#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn quick_reply(message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("Message cannot be empty".to_string());
    }
    // Forward to the Node.js runtime via the webview
    Ok(format!("Reply queued: {}", message))
}
