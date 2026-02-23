use tauri::command;

/// Get the configured gateway URL
#[command]
pub fn get_gateway_url() -> String {
    std::env::var("AUXIORA_GATEWAY_URL").unwrap_or_else(|_| "http://localhost:18800".to_string())
}
