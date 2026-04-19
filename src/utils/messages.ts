import { AppSettings, ApiMessage, ChatMessage, PendingMessage, AiProfile, OrchestrationMode } from "../types/chat";
import { fallbackSettings } from "../constants/defaults";

export function normalizeSettings(settings: AppSettings): AppSettings {
  const aiProfiles = settings.aiProfiles.length > 0 ? settings.aiProfiles : fallbackSettings.aiProfiles;
  const orchestrationMode = normalizeOrchestrationMode(settings.orchestrationMode);

  return {
    ...fallbackSettings,
    ...settings,
    aiProfiles,
    orchestrationMode,
  };
}

export function toApiMessages(messages: ChatMessage[], target?: AiProfile): ApiMessage[] {
  return messages
    .filter((message) => !message.pending && !message.error)
    .map((message) => {
      if (message.role === "assistant" && target && message.speakerId !== target.id) {
        return {
          role: "user",
          content: `${message.speakerName}: ${message.content}`,
          name: message.speakerName,
        };
      }

      return {
        role: message.role,
        content: message.content,
        name: message.speakerName,
      };
    });
}

export function createPendingMessages(profiles: AiProfile[]): PendingMessage[] {
  return profiles.map((profile) => ({
    id: crypto.randomUUID(),
    role: "assistant",
    content: "思考中...",
    speakerId: profile.id,
    speakerName: profile.name,
    avatar: profile.avatar,
    pending: true,
  }));
}

export function normalizeOrchestrationMode(mode: unknown): OrchestrationMode {
  return mode === "parallel" || mode === "dag" ? mode : fallbackSettings.orchestrationMode;
}
