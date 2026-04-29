import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AgentPanel } from "./components/AgentPanel";
import { Avatar } from "./components/Avatar";
import { SettingsPanel } from "./components/SettingsPanel";
import { createEmptyProfile, createUserMessage, fallbackSettings, historyKey } from "./constants/defaults";
import { AiProfile, AppSettings, ChatMessage } from "./types/chat";
import { createPendingMessages, normalizeSettings, toApiMessages } from "./utils/messages";
import { buildOrchestrationStages, withStageInstruction } from "./utils/orchestration";

export function App() {
  const [settings, setSettings] = useState<AppSettings>(fallbackSettings);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [activePanel, setActivePanel] = useState<"chat" | "agents" | "settings">("chat");
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("正在加载设置");
  const [isSending, setIsSending] = useState(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveVersionRef = useRef(0);

  useEffect(() => {
    invoke<AppSettings>("load_settings")
      .then((loaded) => {
        const normalized = normalizeSettings(loaded);
        setSettings(normalized);
        setActiveIds([normalized.aiProfiles[0].id]);
        setStatus("您的智能体清醒着");
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
    () =>
      activeIds
        .map((id) => settings.aiProfiles.find((profile) => profile.id === id))
        .filter((profile): profile is AiProfile => Boolean(profile)),
    [activeIds, settings.aiProfiles],
  );
  const orchestrationStages = useMemo(() => buildOrchestrationStages(activeProfiles), [activeProfiles]);

  const canSend = draft.trim().length > 0 && activeProfiles.length > 0 && !isSending;

  async function persist(nextSettings: AppSettings) {
    const version = saveVersionRef.current + 1;
    saveVersionRef.current = version;
    setSettings(nextSettings);

    const write = saveQueueRef.current
      .catch(() => undefined)
      .then(() => invoke("save_settings", { settings: nextSettings }))
      .then(() => undefined);
    saveQueueRef.current = write.catch(() => undefined);

    try {
      await write;
      if (version === saveVersionRef.current) {
        setStatus("设置已保存");
      }
    } catch (error) {
      if (version === saveVersionRef.current) {
        setStatus(String(error));
      }
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
    const pendingMessages = createPendingMessages(profiles).map((message, index) => ({
      ...message,
      content:
        settings.orchestrationMode === "dag"
          ? `${orchestrationStages[index]?.title ?? profiles[index].name} 等待执行...`
          : "思考中...",
    }));

    setDraft("");
    setIsSending(true);
    setMessages([...baseMessages, ...pendingMessages]);
    setStatus(settings.orchestrationMode === "dag" && profiles.length > 1 ? "DAG 编排执行中" : "正在发送");

    try {
      if (settings.orchestrationMode === "dag") {
        let nextMessages: ChatMessage[] = [...baseMessages, ...pendingMessages];
        const completedReplies: ChatMessage[] = [];

        for (let index = 0; index < orchestrationStages.length; index += 1) {
          const stage = orchestrationStages[index];
          const pending = pendingMessages[index];
          setStatus(`${stage.title}: ${stage.profile.name} 执行中`);
          nextMessages = nextMessages.map((message) =>
            message.id === pending.id ? { ...message, content: `${stage.title} 正在处理...` } : message,
          );
          setMessages(nextMessages);

          try {
            const response = await invoke<{ content: string }>("send_chat", {
              request: {
                profile: withStageInstruction(stage.profile, stage),
                messages: toApiMessages([...baseMessages, ...completedReplies], stage.profile),
              },
            });

            const reply: ChatMessage = {
              ...pending,
              speakerName: `${stage.title} · ${stage.profile.name}`,
              content: response.content,
              pending: false,
            };

            completedReplies.push(reply);
            nextMessages = nextMessages.map((message) => (message.id === pending.id ? reply : message));
            setMessages(nextMessages);
          } catch (error) {
            const reply: ChatMessage = {
              ...pending,
              speakerName: `${stage.title} · ${stage.profile.name}`,
              content: String(error),
              pending: false,
              error: true,
            };
            completedReplies.push(reply);
            nextMessages = nextMessages.map((message) => (message.id === pending.id ? reply : message));
            setMessages(nextMessages);
          }
        }

        return;
      }

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
    } finally {
      setIsSending(false);
      setStatus("您的智能体清醒着");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Hyacinth</p>
          <h1>WITH YOU</h1>
        </div>
        <div className="status-pill">{status}</div>
      </header>

      <main className={`workspace ${isSidePanelCollapsed ? "side-panel-collapsed" : ""}`}>
        <aside className={`side-panel ${activePanel === "chat" ? "" : "open"} ${isSidePanelCollapsed ? "collapsed" : ""}`}>
          <button
            className="panel-collapse-button"
            type="button"
            aria-label={isSidePanelCollapsed ? "展开 AI 管理栏" : "收起 AI 管理栏"}
            aria-expanded={!isSidePanelCollapsed}
            onClick={() => setIsSidePanelCollapsed((collapsed) => !collapsed)}
          >
            {isSidePanelCollapsed ? ">" : "<"}
          </button>

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
              onChangeOrchestrationMode={(orchestrationMode) => void persist({ ...settings, orchestrationMode })}
            />
          )}
        </aside>

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

          <div className="orchestration-bar">
            <div>
              <p className="eyebrow">Orchestration</p>
              <strong>{settings.orchestrationMode === "dag" ? "DAG 编排" : "并行群聊"}</strong>
            </div>
            <div className="segmented">
              <button
                className={settings.orchestrationMode === "dag" ? "active" : ""}
                onClick={() => void persist({ ...settings, orchestrationMode: "dag" })}
              >
                DAG
              </button>
              <button
                className={settings.orchestrationMode === "parallel" ? "active" : ""}
                onClick={() => void persist({ ...settings, orchestrationMode: "parallel" })}
              >
                并行
              </button>
            </div>
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

          {settings.orchestrationMode === "dag" && activeProfiles.length > 1 && (
            <div className="dag-strip" aria-label="当前 DAG 编排">
              {orchestrationStages.map((stage, index) => (
                <div className="dag-node" key={stage.id}>
                  <span>{stage.title}</span>
                  <strong>{stage.profile.name}</strong>
                  {index > 0 && <small>依赖上游节点</small>}
                </div>
              ))}
            </div>
          )}

          <div className="message-list">
            {messages.length === 0 ? (
              <div className="empty-state">
                <h2>开始一次编排</h2>
                <p>选择多个 AI 后发送问题。DAG 模式会按顺序完成简答、拓展和评价；并行模式会让所有 AI 同时回复。</p>
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
      </main>
    </div>
  );
}
