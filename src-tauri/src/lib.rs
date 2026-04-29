use anyhow::{anyhow, Context};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, time::Duration};
use tauri::{AppHandle, Manager, State};

const SETTINGS_FILE: &str = "settings.json";
const HTTP_TIMEOUT_SECS: u64 = 120;

struct AppState {
    http: Client,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProfile {
    pub id: String,
    pub name: String,
    pub avatar: String,
    pub endpoint: String,
    pub api_key: String,
    pub model: String,
    pub system_prompt: String,
    pub temperature: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub user_name: String,
    pub ai_profiles: Vec<AiProfile>,
    #[serde(default = "default_orchestration_mode")]
    pub orchestration_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub profile: AiProfile,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAiMessage {
    content: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct OpenAiErrorResponse {
    error: OpenAiError,
}

#[derive(Debug, Deserialize)]
struct OpenAiError {
    message: String,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("无法定位应用配置目录: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("无法创建应用配置目录: {err}"))?;
    Ok(dir.join(SETTINGS_FILE))
}

fn default_settings() -> AppSettings {
    AppSettings {
        user_name: "我".to_string(),
        ai_profiles: vec![AiProfile {
            id: "default-assistant".to_string(),
            name: "Hyacinth".to_string(),
            avatar: "H".to_string(),
            endpoint: "https://api.openai.com/v1/chat/completions".to_string(),
            api_key: String::new(),
            model: "gpt-4o-mini".to_string(),
            system_prompt: "你是一个简洁、可靠的 AI 助手。".to_string(),
            temperature: 0.7,
        }],
        orchestration_mode: default_orchestration_mode(),
    }
}

fn default_orchestration_mode() -> String {
    "dag".to_string()
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(default_settings());
    }

    let text = fs::read_to_string(&path).map_err(|err| format!("无法读取设置: {err}"))?;
    serde_json::from_str(&text).map_err(|err| format!("设置文件格式无效: {err}"))
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let text =
        serde_json::to_string_pretty(&settings).map_err(|err| format!("无法序列化设置: {err}"))?;
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

#[tauri::command]
async fn send_chat(
    state: State<'_, AppState>,
    request: ChatRequest,
) -> Result<ChatResponse, String> {
    send_openai_compatible(&state.http, request)
        .await
        .map_err(|err| err.to_string())
}

async fn send_openai_compatible(
    client: &Client,
    request: ChatRequest,
) -> anyhow::Result<ChatResponse> {
    let profile = request.profile;
    let endpoint = profile.endpoint.trim();
    if profile.api_key.trim().is_empty() {
        return Err(anyhow!("请先为 {} 填写 API Key", profile.name));
    }
    if endpoint.is_empty() {
        return Err(anyhow!("请先为 {} 填写 API 地址", profile.name));
    }
    if !(endpoint.starts_with("https://") || endpoint.starts_with("http://")) {
        return Err(anyhow!(
            "{} 的 API 地址必须以 http:// 或 https:// 开头",
            profile.name
        ));
    }
    if profile.model.trim().is_empty() {
        return Err(anyhow!("请先为 {} 填写模型名称", profile.name));
    }

    let mut messages = Vec::new();
    if !profile.system_prompt.trim().is_empty() {
        messages.push(json!({
            "role": "system",
            "content": profile.system_prompt,
        }));
    }
    for message in request.messages {
        if message.content.trim().is_empty() {
            continue;
        }
        messages.push(json!({
            "role": message.role,
            "content": message.content,
        }));
    }
    if messages.is_empty() {
        return Err(anyhow!("没有可发送的消息内容"));
    }

    let response = client
        .post(endpoint)
        .bearer_auth(profile.api_key.trim())
        .json(&json!({
            "model": profile.model.trim(),
            "messages": messages,
            "temperature": profile.temperature.clamp(0.0, 2.0),
        }))
        .send()
        .await
        .context("请求 AI 服务失败")?;

    let status = response.status();
    let body = response.text().await.context("无法读取 AI 服务响应")?;
    if !status.is_success() {
        return Err(anyhow!(
            "AI 服务返回 {status}: {}",
            readable_error_body(&body)
        ));
    }

    let value: Value = serde_json::from_str(&body).context("AI 服务响应不是有效 JSON")?;
    let parsed: Result<Vec<OpenAiChoice>, _> = serde_json::from_value(
        value
            .get("choices")
            .cloned()
            .ok_or_else(|| anyhow!("AI 服务响应缺少 choices 字段"))?,
    );
    let choices = parsed.context("AI 服务响应 choices 格式不兼容")?;
    let content = choices
        .first()
        .and_then(|choice| choice.message.content.as_ref())
        .and_then(extract_message_content)
        .filter(|text| !text.trim().is_empty())
        .ok_or_else(|| anyhow!("AI 服务没有返回文本内容"))?;

    Ok(ChatResponse { content })
}

fn extract_message_content(content: &Value) -> Option<String> {
    match content {
        Value::String(text) => Some(text.to_string()),
        Value::Array(parts) => {
            let text = parts
                .iter()
                .filter_map(|part| {
                    part.as_str()
                        .map(str::to_string)
                        .or_else(|| part.get("text").and_then(Value::as_str).map(str::to_string))
                })
                .collect::<Vec<_>>()
                .join("");
            (!text.trim().is_empty()).then_some(text)
        }
        _ => None,
    }
}

fn readable_error_body(body: &str) -> String {
    if let Ok(parsed) = serde_json::from_str::<OpenAiErrorResponse>(body) {
        return parsed.error.message;
    }

    const MAX_ERROR_LEN: usize = 800;
    if body.chars().count() > MAX_ERROR_LEN {
        format!(
            "{}...",
            body.chars().take(MAX_ERROR_LEN).collect::<String>()
        )
    } else {
        body.to_string()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http = Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .expect("failed to create HTTP client");

    tauri::Builder::default()
        .manage(AppState { http })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            send_chat
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hyacinth");
}
