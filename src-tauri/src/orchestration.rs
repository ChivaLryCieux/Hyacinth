use reqwest::Client;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::ai_client::send_openai_compatible;
use crate::messages::to_api_messages;
use crate::models::{
    AiProfile, ChatMessage, OrchestrationProgress, OrchestrationStage,
};

// ─── Stage templates ───────────────────────────────────────────

struct StageTemplate {
    title: &'static str,
    role: &'static str,
    instruction: &'static str,
}

const ROLE_TEMPLATES: &[StageTemplate] = &[
    StageTemplate {
        title: "AI1 简答",
        role: "先行回答者",
        instruction: "你是多智能体编排中的 AI1。请先对用户问题给出简洁、直接的回答，控制篇幅，优先明确结论和关键依据。不要评价其他智能体。",
    },
    StageTemplate {
        title: "AI2 拓展",
        role: "拓展补充者",
        instruction: "你是多智能体编排中的 AI2。请基于用户问题和 AI1 的回答做拓展补充，补上遗漏的背景、步骤、边界条件或可执行建议。避免重复 AI1 已经说清楚的内容。",
    },
    StageTemplate {
        title: "AI3 评价",
        role: "评价审校者",
        instruction: "你是多智能体编排中的 AI3。请评价前面回答的准确性、完整性和风险点，指出需要修正的地方，并给出一个更可靠的最终建议。",
    },
];

const SPECIALIST_TEMPLATE: StageTemplate = StageTemplate {
    title: "", // computed at runtime
    role: "专项处理者",
    instruction: "你是多智能体编排中的专项节点。请基于用户问题和前序节点输出，补充一个新的、有价值的角度，并明确你的补充如何影响最终结论。",
};

// ─── Public API ────────────────────────────────────────────────

/// Build orchestration stages from the selected profiles.
pub fn build_stages(profiles: &[AiProfile]) -> Vec<OrchestrationStage> {
    profiles
        .iter()
        .enumerate()
        .map(|(index, profile)| {
            let template = ROLE_TEMPLATES
                .get(index)
                .unwrap_or(&SPECIALIST_TEMPLATE);

            let title = if index < ROLE_TEMPLATES.len() {
                template.title.to_string()
            } else {
                format!("AI{} 专项节点", index + 1)
            };

            let depends_on = if index == 0 {
                vec![]
            } else {
                vec![format!("{}-{}", profiles[index - 1].id, index - 1)]
            };

            OrchestrationStage {
                id: format!("{}-{}", profile.id, index),
                title,
                role: template.role.to_string(),
                instruction: template.instruction.to_string(),
                profile: profile.clone(),
                depends_on,
            }
        })
        .collect()
}

/// Append orchestration instructions to a profile's system prompt.
pub fn with_stage_instruction(profile: &AiProfile, stage: &OrchestrationStage) -> AiProfile {
    let base_prompt = profile.system_prompt.trim();
    let orchestration_prompt = format!(
        "多智能体编排任务:\n\
         - 当前节点: {}\n\
         - 节点角色: {}\n\
         - 节点指令: {}\n\
         - 输出要求: 使用清晰的小段落或要点，直接面向用户，不要暴露内部实现细节。",
        stage.title, stage.role, stage.instruction,
    );

    let system_prompt = if base_prompt.is_empty() {
        orchestration_prompt
    } else {
        format!("{base_prompt}\n\n{orchestration_prompt}")
    };

    AiProfile {
        system_prompt,
        ..profile.clone()
    }
}

/// Execute the full orchestration pipeline and return the final message list.
///
/// For DAG mode, stages execute sequentially; each stage's output is appended
/// to the context for the next stage.  Progress events are emitted to the
/// frontend via Tauri's event system.
///
/// For parallel mode, all profiles are queried concurrently with the same
/// base context.
pub async fn execute(
    app: &AppHandle,
    http: &Client,
    profiles: &[AiProfile],
    base_messages: &[ChatMessage],
    mode: &str,
) -> Vec<ChatMessage> {
    if mode == "parallel" {
        execute_parallel(app, http, profiles, base_messages).await
    } else {
        execute_dag(app, http, profiles, base_messages).await
    }
}

// ─── DAG execution ─────────────────────────────────────────────

async fn execute_dag(
    app: &AppHandle,
    http: &Client,
    profiles: &[AiProfile],
    base_messages: &[ChatMessage],
) -> Vec<ChatMessage> {
    let stages = build_stages(profiles);
    let mut completed_replies: Vec<ChatMessage> = Vec::new();

    for stage in &stages {
        let message_id = Uuid::new_v4().to_string();

        // Emit "running" progress
        let _ = app.emit(
            "orchestration-progress",
            OrchestrationProgress {
                stage_id: stage.id.clone(),
                stage_title: stage.title.clone(),
                profile_name: stage.profile.name.clone(),
                status: "running".to_string(),
                content: Some(format!("{} 正在处理...", stage.title)),
                message_id: Some(message_id.clone()),
            },
        );

        // Build context: base messages + all completed replies so far
        let mut context: Vec<ChatMessage> = base_messages.to_vec();
        context.extend(completed_replies.clone());

        let api_messages = to_api_messages(&context, Some(&stage.profile));
        let augmented_profile = with_stage_instruction(&stage.profile, stage);

        let result = send_openai_compatible(http, &augmented_profile, &api_messages).await;

        match result {
            Ok(response) => {
                let reply = ChatMessage {
                    id: message_id,
                    role: "assistant".to_string(),
                    content: response.content,
                    speaker_id: Some(stage.profile.id.clone()),
                    speaker_name: format!("{} · {}", stage.title, stage.profile.name),
                    avatar: stage.profile.avatar.clone(),
                    pending: false,
                    error: false,
                };
                completed_replies.push(reply.clone());

                let _ = app.emit(
                    "orchestration-progress",
                    OrchestrationProgress {
                        stage_id: stage.id.clone(),
                        stage_title: stage.title.clone(),
                        profile_name: stage.profile.name.clone(),
                        status: "completed".to_string(),
                        content: Some(reply.content),
                        message_id: Some(reply.id),
                    },
                );
            }
            Err(err) => {
                let reply = ChatMessage {
                    id: message_id,
                    role: "assistant".to_string(),
                    content: err.to_string(),
                    speaker_id: Some(stage.profile.id.clone()),
                    speaker_name: format!("{} · {}", stage.title, stage.profile.name),
                    avatar: stage.profile.avatar.clone(),
                    pending: false,
                    error: true,
                };
                completed_replies.push(reply.clone());

                let _ = app.emit(
                    "orchestration-progress",
                    OrchestrationProgress {
                        stage_id: stage.id.clone(),
                        stage_title: stage.title.clone(),
                        profile_name: stage.profile.name.clone(),
                        status: "error".to_string(),
                        content: Some(err.to_string()),
                        message_id: Some(reply.id),
                    },
                );
            }
        }
    }

    completed_replies
}

// ─── Parallel execution ────────────────────────────────────────

async fn execute_parallel(
    _app: &AppHandle,
    http: &Client,
    profiles: &[AiProfile],
    base_messages: &[ChatMessage],
) -> Vec<ChatMessage> {
    let api_messages_per_profile: Vec<_> = profiles
        .iter()
        .map(|p| to_api_messages(base_messages, Some(p)))
        .collect();

    let futures: Vec<_> = profiles
        .iter()
        .zip(api_messages_per_profile.iter())
        .map(|(profile, api_msgs)| async move {
            let result = send_openai_compatible(http, profile, api_msgs).await;
            (profile, result)
        })
        .collect();

    let results = futures::future::join_all(futures).await;

    results
        .into_iter()
        .map(|(profile, result)| {
            let message_id = Uuid::new_v4().to_string();
            match result {
                Ok(response) => ChatMessage {
                    id: message_id,
                    role: "assistant".to_string(),
                    content: response.content,
                    speaker_id: Some(profile.id.clone()),
                    speaker_name: profile.name.clone(),
                    avatar: profile.avatar.clone(),
                    pending: false,
                    error: false,
                },
                Err(err) => ChatMessage {
                    id: message_id,
                    role: "assistant".to_string(),
                    content: err.to_string(),
                    speaker_id: Some(profile.id.clone()),
                    speaker_name: profile.name.clone(),
                    avatar: profile.avatar.clone(),
                    pending: false,
                    error: true,
                },
            }
        })
        .collect()
}
