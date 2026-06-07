use serde::{Deserialize, Serialize};

// ─── AI Profile ────────────────────────────────────────────────

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

// ─── App Settings ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub user_name: String,
    pub ai_profiles: Vec<AiProfile>,
    #[serde(default = "default_orchestration_mode")]
    pub orchestration_mode: String,
}

fn default_orchestration_mode() -> String {
    "dag".to_string()
}

// ─── Chat Messages ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub speaker_id: Option<String>,
    pub speaker_name: String,
    pub avatar: String,
    #[serde(default)]
    pub pending: bool,
    #[serde(default)]
    pub error: bool,
}

/// Wire format for OpenAI-compatible API (no camelCase needed).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

// ─── Orchestration ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationStage {
    pub id: String,
    pub title: String,
    pub role: String,
    pub instruction: String,
    pub profile: AiProfile,
    pub depends_on: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationRequest {
    pub profiles: Vec<AiProfile>,
    pub messages: Vec<ChatMessage>,
    pub mode: String,
}

/// Event emitted to the frontend during orchestration execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationProgress {
    pub stage_id: String,
    pub stage_title: String,
    pub profile_name: String,
    pub status: String, // "running" | "completed" | "error"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
}

// ─── Chat Request / Response (for single API call) ─────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub profile: AiProfile,
    pub messages: Vec<ApiMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub content: String,
}

// ─── OpenAI response parsing helpers ───────────────────────────

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiChoice {
    pub message: OpenAiMessage,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiMessage {
    pub content: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiErrorResponse {
    pub error: OpenAiError,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiError {
    pub message: String,
}
