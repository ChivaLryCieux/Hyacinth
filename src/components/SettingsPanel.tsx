import { AppSettings } from "../types/chat";
import { Field } from "./Field";

type SettingsPanelProps = {
  settings: AppSettings;
  onClear: () => void;
  onChangeUserName: (value: string) => void;
};

export function SettingsPanel({ settings, onClear, onChangeUserName }: SettingsPanelProps) {
  return (
    <div className="panel-content">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>应用设置</h2>
        </div>
      </div>

      <section className="profile-card">
        <Field label="你的名称" value={settings.userName} onChange={onChangeUserName} />
        <button className="danger full" onClick={onClear}>
          清空本机聊天记录
        </button>
        <p className="hint">API Key 保存在本机应用配置目录中。群聊会把其他 AI 的发言作为上下文发给当前 AI。</p>
      </section>
    </div>
  );
}
