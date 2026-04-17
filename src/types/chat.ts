export type AiProfile = {
  id: string;
  name: string;
  avatar: string;
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
};

export type AppSettings = {
  userName: string;
  aiProfiles: AiProfile[];
};

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  speakerId?: string;
  speakerName: string;
  avatar: string;
  pending?: boolean;
  error?: boolean;
};

export type ApiMessage = {
  role: ChatRole;
  content: string;
  name?: string;
};

export type PendingMessage = ChatMessage & {
  role: "assistant";
  speakerId: string;
  pending: true;
};
