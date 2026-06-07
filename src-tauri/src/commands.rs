use tauri::{AppHandle, State};

use crate::models::{
    AiProfile, AppSettings, ChatMessage, ChatRequest, ChatResponse, OrchestrationRequest,
};
use crate::orchestration;
use crate::storage;

// ─── Settings ──────────────────────────────────────────────────

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    storage::load_settings(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    storage::save_settings(&app, &settings)
}

// ─── Chat History ──────────────────────────────────────────────

#[tauri::command]
pub fn load_history(app: AppHandle) -> Result<Vec<ChatMessage>, String> {
    storage::load_history(&app)
}

#[tauri::command]
pub fn save_history(app: AppHandle, messages: Vec<ChatMessage>) -> Result<(), String> {
    storage::save_history(&app, &messages)
}

#[tauri::command]
pub fn clear_history(app: AppHandle) -> Result<(), String> {
    storage::clear_history(&app)
}

// ─── Profile management ────────────────────────────────────────

#[tauri::command]
pub fn create_profile() -> AiProfile {
    storage::create_profile()
}

// ─── Single chat call (kept for direct use) ────────────────────

#[tauri::command]
pub async fn send_chat(
    state: State<'_, crate::AppState>,
    request: ChatRequest,
) -> Result<ChatResponse, String> {
    crate::ai_client::send_openai_compatible(&state.http, &request.profile, &request.messages)
        .await
        .map_err(|err| err.to_string())
}

// ─── Orchestration ─────────────────────────────────────────────

#[tauri::command]
pub async fn execute_orchestration(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    request: OrchestrationRequest,
) -> Result<Vec<ChatMessage>, String> {
    let replies =
        orchestration::execute(&app, &state.http, &request.profiles, &request.messages, &request.mode).await;
    Ok(replies)
}

#[tauri::command]
pub fn build_orchestration(profiles: Vec<AiProfile>) -> Vec<crate::models::OrchestrationStage> {
    orchestration::build_stages(&profiles)
}
