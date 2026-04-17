import { FormEvent, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AgentPanel } from "./components/AgentPanel";
import { Avatar } from "./components/Avatar";
import { SettingsPanel } from "./components/SettingsPanel";
import { createEmptyProfile, createUserMessage, fallbackSettings, historyKey } from "./constants/defaults";
import { AiProfile, AppSettings, ChatMessage } from "./types/chat";
import { createPendingMessages, normalizeSettings, toApiMessages } from "./utils/messages";

export function App() {
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
        const normalized = normalizeSettings(loaded);
        setSettings(normalized);
        setActiveIds([normalized.aiProfiles[0].id]);
        setStatus("就绪");
      })
      .catch((error) => {
        console.error(error);
        setStatus(String(error));
      });

    const cached = localStorage.getItem(historyKey);
    if (!cached) return;

    try {
      const parsed: ChatMessage[] = JSON.parse(cached);
      setMessages(parsed);
    } catch {
      localStorage.removeItem(historyKey);
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
      aiProfiles: settings.aiProfiles.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)),
    };
    void persist(nextSettings);
  }

  function addProfile() {
    const profile = createEmptyProfile();
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
    const pendingMessages = createPendingMessages(profiles);

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
                  className={`message ${message.role === "user" ? "from-user" : "from-ai"} ${message.error ? "error" : ""}`}
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
