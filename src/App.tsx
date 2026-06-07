import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import AgentPanel from "./components/AgentPanel";
import { Avatar } from "./components/Avatar";
import { SettingsPanel } from "./components/SettingsPanel";
import { createUserMessage } from "./constants/defaults";
import { AiProfile, AppSettings, ChatMessage, OrchestrationMode, OrchestrationStage } from "./types/chat";
import { createPendingMessages } from "./utils/messages";
import { OrchestrationProgressEvent } from "./types/chat";

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [activePanel, setActivePanel] = useState<"chat" | "agents" | "settings">("chat");
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("正在加载设置");
  const [isSending, setIsSending] = useState(false);
  const [orchestrationStages, setOrchestrationStages] = useState<OrchestrationStage[]>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Initialize: load settings and chat history from backend ──

  useEffect(() => {
    invoke<AppSettings>("load_settings")
      .then((loaded) => {
        setSettings(loaded);
        setActiveIds([loaded.aiProfiles[0].id]);
        setStatus("您的智能体清醒着");
      })
      .catch((error) => {
        console.error(error);
        setStatus(String(error));
      });

    invoke<ChatMessage[]>("load_history")
      .then((cached) => {
        if (cached.length > 0) setMessages(cached);
      })
      .catch(console.error);
  }, []);

  // ── Persist chat history to backend (debounced) ──────────────

  useEffect(() => {
    if (!settings) return;
    if (saveTimeoutRef.current !== undefined) {
      clearTimeout(saveTimeoutRef.current);
    }
    const timeoutId = setTimeout(() => {
      if (messages.length > 0) {
        invoke("save_history", { messages }).catch(console.error);
      }
    }, 500);
    saveTimeoutRef.current = timeoutId;
  }, [messages, settings]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== undefined) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // ── Fetch orchestration stages from backend ──────────────────

  useEffect(() => {
    if (activeProfiles.length === 0) {
      setOrchestrationStages([]);
      return;
    }
    invoke<OrchestrationStage[]>("build_orchestration", { profiles: activeProfiles })
      .then(setOrchestrationStages)
      .catch(console.error);
  }, [settings, activeIds]);

  // ── Derived state ────────────────────────────────────────────

  const activeProfiles = useMemo(
    () =>
      activeIds
        .map((id) => settings?.aiProfiles.find((profile) => profile.id === id))
        .filter((profile): profile is AiProfile => Boolean(profile)),
    [activeIds, settings],
  );

  const canSend = draft.trim().length > 0 && activeProfiles.length > 0 && !isSending && settings !== null;

  // ── Settings persistence ─────────────────────────────────────

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
    if (!settings) return;
    void persist({
      ...settings,
      aiProfiles: settings.aiProfiles.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)),
    });
  }

  async function addProfile() {
    if (!settings) return;
    const profile = await invoke<AiProfile>("create_profile");
    void persist({ ...settings, aiProfiles: [...settings.aiProfiles, profile] });
    setActiveIds((ids) => [...ids, profile.id]);
  }

  function removeProfile(id: string) {
    if (!settings) return;
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

  // ── Send message — delegates all orchestration to backend ────

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!canSend || !settings) return;

    const userMessage = createUserMessage(draft.trim(), settings.userName);
    const baseMessages = [...messages, userMessage];
    const pendingMessages = createPendingMessages(activeProfiles).map((message, index) => ({
      ...message,
      content:
        settings.orchestrationMode === "dag"
          ? `${orchestrationStages[index]?.title ?? activeProfiles[index].name} 等待执行...`
          : "思考中...",
    }));

    setDraft("");
    setIsSending(true);
    setMessages([...baseMessages, ...pendingMessages]);
    setStatus(settings.orchestrationMode === "dag" && activeProfiles.length > 1 ? "DAG 编排执行中" : "正在发送");

    // Map stage.id → pending message id for progress event matching
    const stageToPending = new Map<string, string>();
    orchestrationStages.forEach((stage, index) => {
      if (pendingMessages[index]) {
        stageToPending.set(stage.id, pendingMessages[index].id);
      }
    });

    try {
      // Listen for progress events (DAG mode emits these per stage)
      const unlisten = await listen<OrchestrationProgressEvent>("orchestration-progress", (event) => {
        const { stageId, stageTitle, profileName, status: eventStatus, content } = event.payload;
        const pendingId = stageToPending.get(stageId);

        if (eventStatus === "running") {
          setStatus(`${stageTitle}: ${profileName} 执行中`);
          if (pendingId) {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === pendingId ? { ...msg, content: `${stageTitle} 正在处理...` } : msg)),
            );
          }
        }
      });

      const finalMessages = await invoke<ChatMessage[]>("execute_orchestration", {
        request: {
          profiles: activeProfiles,
          messages: baseMessages,
          mode: settings.orchestrationMode,
        },
      });

      unlisten();

      // Replace pending messages with final results
      setMessages([...baseMessages, ...finalMessages]);
    } catch (error) {
      // Mark all pending messages as errors
      setMessages((prev) =>
        prev.map((msg) =>
          msg.pending ? { ...msg, content: String(error), pending: false, error: true } : msg,
        ),
      );
    } finally {
      setIsSending(false);
      setStatus("您的智能体清醒着");
    }
  }

  // ── Clear history ────────────────────────────────────────────

  async function handleClearHistory() {
    setMessages([]);
    try {
      await invoke("clear_history");
    } catch (error) {
      console.error(error);
    }
  }

  // ── Guard: don't render until settings are loaded ────────────

  if (!settings) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Hyacinth</p>
            <h1>WITH YOU</h1>
          </div>
          <div className="status-pill">{status}</div>
        </header>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────

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
              onClear={handleClearHistory}
              onChangeUserName={(userName) => void persist({ ...settings, userName })}
              onChangeOrchestrationMode={(orchestrationMode) =>
                void persist({ ...settings, orchestrationMode: orchestrationMode as OrchestrationMode })
              }
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
