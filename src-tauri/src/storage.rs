use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::models::{AiProfile, AppSettings, ChatMessage};

const SETTINGS_FILE: &str = "settings.json";
const HISTORY_FILE: &str = "chat_history.json";

// ─── Paths ─────────────────────────────────────────────────────

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("无法定位应用配置目录: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("无法创建应用配置目录: {err}"))?;
    Ok(dir)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(SETTINGS_FILE))
}

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(HISTORY_FILE))
}

// ─── Settings ──────────────────────────────────────────────────

fn default_settings() -> AppSettings {
    AppSettings {
        user_name: "我".to_string(),
        ai_profiles: vec![default_profile()],
        orchestration_mode: "dag".to_string(),
    }
}

fn default_profile() -> AiProfile {
    AiProfile {
        id: "default-assistant".to_string(),
        name: "Hyacinth".to_string(),
        avatar: "H".to_string(),
        endpoint: "https://api.openai.com/v1/chat/completions".to_string(),
        api_key: String::new(),
        model: "gpt-4o-mini".to_string(),
        system_prompt: "你是一个简洁、可靠的 AI 助手。".to_string(),
        temperature: 0.7,
    }
}

/// Ensure settings have valid defaults.
fn normalize_settings(mut settings: AppSettings) -> AppSettings {
    if settings.ai_profiles.is_empty() {
        settings.ai_profiles = vec![default_profile()];
    }
    if settings.orchestration_mode != "dag" && settings.orchestration_mode != "parallel" {
        settings.orchestration_mode = "dag".to_string();
    }
    settings
}

pub fn load_settings(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(default_settings());
    }
    let text = fs::read_to_string(&path).map_err(|err| format!("无法读取设置: {err}"))?;
    let settings: AppSettings =
        serde_json::from_str(&text).map_err(|err| format!("设置文件格式无效: {err}"))?;
    Ok(normalize_settings(settings))
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let text =
        serde_json::to_string_pretty(settings).map_err(|err| format!("无法序列化设置: {err}"))?;
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, text).map_err(|err| format!("无法保存设置: {err}"))?;
    match fs::rename(&tmp_path, &path) {
        Ok(()) => Ok(()),
        Err(rename_err) if path.exists() => {
            fs::remove_file(&path).map_err(|err| format!("无法替换旧设置文件: {err}"))?;
            fs::rename(tmp_path, path)
                .map_err(|err| format!("无法完成设置保存: {err}; 初次替换失败: {rename_err}"))
        }
        Err(err) => Err(format!("无法完成设置保存: {err}")),
    }
}

// ─── Chat History ──────────────────────────────────────────────

pub fn load_history(app: &AppHandle) -> Result<Vec<ChatMessage>, String> {
    let path = history_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(&path).map_err(|err| format!("无法读取聊天记录: {err}"))?;
    serde_json::from_str(&text).map_err(|err| format!("聊天记录格式无效: {err}"))
}

pub fn save_history(app: &AppHandle, messages: &[ChatMessage]) -> Result<(), String> {
    let path = history_path(app)?;
    let text = serde_json::to_string_pretty(messages)
        .map_err(|err| format!("无法序列化聊天记录: {err}"))?;
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, text).map_err(|err| format!("无法保存聊天记录: {err}"))?;
    match fs::rename(&tmp_path, &path) {
        Ok(()) => Ok(()),
        Err(rename_err) if path.exists() => {
            fs::remove_file(&path).map_err(|err| format!("无法替换旧聊天记录: {err}"))?;
            fs::rename(tmp_path, path)
                .map_err(|err| format!("无法完成聊天记录保存: {err}; 初次替换失败: {rename_err}"))
        }
        Err(err) => Err(format!("无法完成聊天记录保存: {err}")),
    }
}

pub fn clear_history(app: &AppHandle) -> Result<(), String> {
    let path = history_path(app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|err| format!("无法清空聊天记录: {err}"))?;
    }
    Ok(())
}

// ─── Create profile ────────────────────────────────────────────

pub fn create_profile() -> AiProfile {
    AiProfile {
        id: Uuid::new_v4().to_string(),
        name: "新 AI".to_string(),
        avatar: "AI".to_string(),
        endpoint: "https://api.openai.com/v1/chat/completions".to_string(),
        api_key: String::new(),
        model: "gpt-4o-mini".to_string(),
        system_prompt: "你是一个简洁、可靠的 AI 助手。".to_string(),
        temperature: 0.7,
    }
}
