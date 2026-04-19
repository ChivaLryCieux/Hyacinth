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

export type OrchestrationMode = "parallel" | "dag";

export type AppSettings = {
  userName: string;
  aiProfiles: AiProfile[];
  orchestrationMode: OrchestrationMode;
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

export type OrchestrationStage = {
  id: string;
  title: string;
  role: string;
  instruction: string;
  profile: AiProfile;
  dependsOn: string[];
};
