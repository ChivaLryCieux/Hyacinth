mod ai_client;
mod commands;
mod messages;
mod models;
mod orchestration;
mod storage;

use reqwest::Client;

pub(crate) struct AppState {
    pub http: Client,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http = ai_client::build_http_client();

    tauri::Builder::default()
        .manage(AppState { http })
        .invoke_handler(tauri::generate_handler![
            commands::load_settings,
            commands::save_settings,
            commands::load_history,
            commands::save_history,
            commands::clear_history,
            commands::create_profile,
            commands::send_chat,
            commands::execute_orchestration,
            commands::build_orchestration,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hyacinth");
}
