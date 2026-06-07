import { ChatMessage } from "../types/chat";

export const createUserMessage = (content: string, userName: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  content,
  speakerName: userName || "我",
  avatar: "我",
});
