import { AiProfile, PendingMessage } from "../types/chat";

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
