import { AiProfile } from "../types/chat";
import { Field } from "./Field";

type AgentPanelProps = {
  profiles: AiProfile[];
  activeIds: string[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, patch: Partial<AiProfile>) => void;
};

export function AgentPanel({ profiles, activeIds, onAdd, onRemove, onToggle, onUpdate }: AgentPanelProps) {
  return (
    <div className="panel-content">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Agents</p>
          <h2>AI 管理</h2>
        </div>
        <button className="secondary" onClick={onAdd}>
          添加
        </button>
      </div>

      {profiles.map((profile) => (
        <section className="profile-card" key={profile.id}>
          <div className="profile-card-head">
            <label className="toggle-row">
              <input type="checkbox" checked={activeIds.includes(profile.id)} onChange={() => onToggle(profile.id)} />
              参与当前对话
            </label>
            <button className="danger" onClick={() => onRemove(profile.id)}>
              删除
            </button>
          </div>

          <Field label="名称" value={profile.name} onChange={(name) => onUpdate(profile.id, { name })} />
          <Field label="头像文字或图片地址" value={profile.avatar} onChange={(avatar) => onUpdate(profile.id, { avatar })} />

          <label className="field">
            <span>上传头像图片</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => onUpdate(profile.id, { avatar: String(reader.result) });
                reader.readAsDataURL(file);
              }}
            />
          </label>

          <Field label="API 地址" value={profile.endpoint} onChange={(endpoint) => onUpdate(profile.id, { endpoint })} />
          <Field label="API Key" type="password" value={profile.apiKey} onChange={(apiKey) => onUpdate(profile.id, { apiKey })} />
          <Field label="模型" value={profile.model} onChange={(model) => onUpdate(profile.id, { model })} />

          <label className="field">
            <span>系统提示词</span>
            <textarea
              value={profile.systemPrompt}
              onChange={(event) => onUpdate(profile.id, { systemPrompt: event.target.value })}
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
              onChange={(event) => onUpdate(profile.id, { temperature: Number(event.target.value) })}
            />
          </label>
        </section>
      ))}
    </div>
  );
}
