import { AiProfile, AppSettings, ChatMessage } from "../types/chat";

export const historyKey = "hyacinth.chatHistory.v1";

export const createEmptyProfile = (): AiProfile => ({
  id: crypto.randomUUID(),
  name: "新 AI",
  avatar: "AI",
  endpoint: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "gpt-4o-mini",
  systemPrompt: "你是一个简洁、可靠的 AI 助手。",
  temperature: 0.7,
});

export const fallbackSettings: AppSettings = {
  userName: "我",
  aiProfiles: [createEmptyProfile()],
};

export const createUserMessage = (content: string, userName: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  content,
  speakerName: userName || "我",
  avatar: "我",
});
