use crate::models::{AiProfile, ApiMessage, ChatMessage};

/// Convert frontend ChatMessages into OpenAI-compatible ApiMessages.
///
/// Key behaviour:
/// - Filters out pending and error messages.
/// - When an assistant message was produced by a *different* agent than
///   `target`, it is rewritten as a `user` role message with the speaker
///   name prepended, so the current agent sees it as external context.
pub fn to_api_messages(messages: &[ChatMessage], target: Option<&AiProfile>) -> Vec<ApiMessage> {
    messages
        .iter()
        .filter(|m| !m.pending && !m.error)
        .map(|m| {
            let is_foreign_assistant = m.role == "assistant"
                && target.is_some_and(|t| m.speaker_id.as_deref() != Some(&t.id));

            if is_foreign_assistant {
                ApiMessage {
                    role: "user".to_string(),
                    content: format!("{}: {}", m.speaker_name, m.content),
                    name: Some(m.speaker_name.clone()),
                }
            } else {
                ApiMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                    name: Some(m.speaker_name.clone()),
                }
            }
        })
        .collect()
}
