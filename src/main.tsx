import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

type AiProfile = {
  id: string;
  name: string;
  avatar: string;
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
};

type AppSettings = {
  userName: string;
  aiProfiles: AiProfile[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  speakerId?: string;
  speakerName: string;
  avatar: string;
  pending?: boolean;
  error?: boolean;
};

type ApiMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  name?: string;
};

const historyKey = "hyacinth.chatHistory.v1";

const emptyProfile = (): AiProfile => ({
  id: crypto.randomUUID(),
  name: "新 AI",
  avatar: "AI",
  endpoint: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "gpt-4o-mini",
  systemPrompt: "你是一个简洁、可靠的 AI 助手。",
  temperature: 0.7,
});

const fallbackSettings: AppSettings = {
  userName: "我",
  aiProfiles: [emptyProfile()],
};

const createUserMessage = (content: string, userName: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  content,
  speakerName: userName || "我",
  avatar: "我",
});

function toApiMessages(messages: ChatMessage[], target?: AiProfile): ApiMessage[] {
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

function App() {
  const [settings, setSettings] = useState<AppSettings>(fallbackSettings);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [activePanel, setActivePanel] = useState<"chat" | "agents" | "settings">("chat");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("正在加载设置");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    invoke<AppSettings>("load_settings")
      .then((loaded) => {
        const normalized = loaded.aiProfiles.length ? loaded : fallbackSettings;
        setSettings(normalized);
        setActiveIds([normalized.aiProfiles[0].id]);
        setStatus("就绪");
      })
      .catch((error) => {
        console.error(error);
        setStatus(String(error));
      });

    const cached = localStorage.getItem(historyKey);
    if (cached) {
      try {
        setMessages(JSON.parse(cached));
      } catch {
        localStorage.removeItem(historyKey);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(historyKey, JSON.stringify(messages));
  }, [messages]);

  const activeProfiles = useMemo(
    () => settings.aiProfiles.filter((profile) => activeIds.includes(profile.id)),
    [activeIds, settings.aiProfiles],
  );

  const canSend = draft.trim().length > 0 && activeProfiles.length > 0 && !isSending;

  async function persist(nextSettings: AppSettings) {
    setSettings(nextSettings);
    try {
      await invoke("save_settings", { settings: nextSettings });
      setStatus("设置已保存");
    } catch (error) {
      setStatus(String(error));
    }
  }

  function updateProfile(id: string, patch: Partial<AiProfile>) {
    const nextSettings = {
      ...settings,
      aiProfiles: settings.aiProfiles.map((profile) =>
        profile.id === id ? { ...profile, ...patch } : profile,
      ),
    };
    void persist(nextSettings);
  }

  function addProfile() {
    const profile = emptyProfile();
    void persist({ ...settings, aiProfiles: [...settings.aiProfiles, profile] });
    setActiveIds((ids) => [...ids, profile.id]);
  }

  function removeProfile(id: string) {
    if (settings.aiProfiles.length <= 1) {
      setStatus("至少保留一个 AI");
      return;
    }
    void persist({
      ...settings,
      aiProfiles: settings.aiProfiles.filter((profile) => profile.id !== id),
    });
    setActiveIds((ids) => ids.filter((activeId) => activeId !== id));
  }

  function toggleActive(id: string) {
    setActiveIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;

    const userMessage = createUserMessage(draft.trim(), settings.userName);
    const profiles = activeProfiles;
    const baseMessages = [...messages, userMessage];
    const pendingMessages = profiles.map((profile) => ({
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: "思考中...",
      speakerId: profile.id,
      speakerName: profile.name,
      avatar: profile.avatar,
      pending: true,
    }));

    setDraft("");
    setIsSending(true);
    setMessages([...baseMessages, ...pendingMessages]);
    setStatus(profiles.length > 1 ? "群聊响应中" : "正在发送");

    const replies = await Promise.all(
      profiles.map(async (profile, index) => {
        try {
          const response = await invoke<{ content: string }>("send_chat", {
            request: {
              profile,
              messages: toApiMessages(baseMessages, profile),
            },
          });
          return {
            ...pendingMessages[index],
            content: response.content,
            pending: false,
          };
        } catch (error) {
          return {
            ...pendingMessages[index],
            content: String(error),
            pending: false,
            error: true,
          };
        }
      }),
    );

    setMessages([...baseMessages, ...replies]);
    setIsSending(false);
    setStatus("就绪");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Hyacinth</p>
          <h1>AI 对话</h1>
        </div>
        <div className="status-pill">{status}</div>
      </header>

      <main className="workspace">
        <section className="chat-area" aria-label="聊天">
          <div className="mode-strip">
            <button className={activePanel === "chat" ? "active" : ""} onClick={() => setActivePanel("chat")}>
              对话
            </button>
            <button className={activePanel === "agents" ? "active" : ""} onClick={() => setActivePanel("agents")}>
              AI
            </button>
            <button className={activePanel === "settings" ? "active" : ""} onClick={() => setActivePanel("settings")}>
              设置
            </button>
          </div>

          <div className="agent-row">
            {settings.aiProfiles.map((profile) => (
              <button
                key={profile.id}
                className={`agent-chip ${activeIds.includes(profile.id) ? "selected" : ""}`}
                onClick={() => toggleActive(profile.id)}
              >
                <Avatar value={profile.avatar} fallback={profile.name} />
                {profile.name}
              </button>
            ))}
          </div>

          <div className="message-list">
            {messages.length === 0 ? (
              <div className="empty-state">
                <h2>开始一次对话</h2>
                <p>选择一个或多个 AI，填写 API Key 后发送消息。选中多个 AI 时会进入群聊。</p>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`message ${message.role === "user" ? "from-user" : "from-ai"} ${
                    message.error ? "error" : ""
                  }`}
                >
                  <Avatar value={message.avatar} fallback={message.speakerName} />
                  <div className="bubble">
                    <div className="speaker">{message.speakerName}</div>
                    <p>{message.content}</p>
                  </div>
                </article>
              ))
            )}
          </div>

          <form className="composer" onSubmit={sendMessage}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={activeProfiles.length ? "输入消息" : "先选择至少一个 AI"}
              rows={2}
            />
            <button disabled={!canSend}>发送</button>
          </form>
        </section>

        <aside className={`side-panel ${activePanel === "chat" ? "" : "open"}`}>
          {(activePanel === "agents" || activePanel === "chat") && (
            <AgentPanel
              profiles={settings.aiProfiles}
              activeIds={activeIds}
              onAdd={addProfile}
              onRemove={removeProfile}
              onToggle={toggleActive}
              onUpdate={updateProfile}
            />
          )}
          {activePanel === "settings" && (
            <SettingsPanel
              settings={settings}
              onClear={() => setMessages([])}
              onChangeUserName={(userName) => void persist({ ...settings, userName })}
            />
          )}
        </aside>
      </main>
    </div>
  );
}

function AgentPanel(props: {
  profiles: AiProfile[];
  activeIds: string[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, patch: Partial<AiProfile>) => void;
}) {
  return (
    <div className="panel-content">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Agents</p>
          <h2>AI 管理</h2>
        </div>
        <button className="secondary" onClick={props.onAdd}>
          添加
        </button>
      </div>

      {props.profiles.map((profile) => (
        <section className="profile-card" key={profile.id}>
          <div className="profile-card-head">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={props.activeIds.includes(profile.id)}
                onChange={() => props.onToggle(profile.id)}
              />
              参与当前对话
            </label>
            <button className="danger" onClick={() => props.onRemove(profile.id)}>
              删除
            </button>
          </div>
          <Field label="名称" value={profile.name} onChange={(name) => props.onUpdate(profile.id, { name })} />
          <Field
            label="头像文字或图片地址"
            value={profile.avatar}
            onChange={(avatar) => props.onUpdate(profile.id, { avatar })}
          />
          <label className="field">
            <span>上传头像图片</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => props.onUpdate(profile.id, { avatar: String(reader.result) });
                reader.readAsDataURL(file);
              }}
            />
          </label>
          <Field label="API 地址" value={profile.endpoint} onChange={(endpoint) => props.onUpdate(profile.id, { endpoint })} />
          <Field
            label="API Key"
            type="password"
            value={profile.apiKey}
            onChange={(apiKey) => props.onUpdate(profile.id, { apiKey })}
          />
          <Field label="模型" value={profile.model} onChange={(model) => props.onUpdate(profile.id, { model })} />
          <label className="field">
            <span>系统提示词</span>
            <textarea
              value={profile.systemPrompt}
              onChange={(event) => props.onUpdate(profile.id, { systemPrompt: event.target.value })}
              rows={4}
            />
          </label>
          <label className="field">
            <span>温度 {profile.temperature.toFixed(1)}</span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={profile.temperature}
              onChange={(event) => props.onUpdate(profile.id, { temperature: Number(event.target.value) })}
            />
          </label>
        </section>
      ))}
    </div>
  );
}

function SettingsPanel(props: {
  settings: AppSettings;
  onClear: () => void;
  onChangeUserName: (value: string) => void;
}) {
  return (
    <div className="panel-content">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>应用设置</h2>
        </div>
      </div>
      <section className="profile-card">
        <Field label="你的名称" value={props.settings.userName} onChange={props.onChangeUserName} />
        <button className="danger full" onClick={props.onClear}>
          清空本机聊天记录
        </button>
        <p className="hint">API Key 保存在本机应用配置目录中。群聊会把其他 AI 的发言作为上下文发给当前 AI。</p>
      </section>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type={props.type || "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function Avatar(props: { value: string; fallback: string }) {
  const value = props.value.trim();
  const isImage = value.startsWith("data:image/") || value.startsWith("http://") || value.startsWith("https://");
  return (
    <span className="avatar">
      {isImage ? <img src={value} alt="" /> : value || props.fallback.slice(0, 2).toUpperCase()}
    </span>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
