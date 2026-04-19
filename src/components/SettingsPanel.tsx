import { AppSettings } from "../types/chat";
import { Field } from "./Field";

type SettingsPanelProps = {
  settings: AppSettings;
  onClear: () => void;
  onChangeUserName: (value: string) => void;
  onChangeOrchestrationMode: (value: AppSettings["orchestrationMode"]) => void;
};

export function SettingsPanel({ settings, onClear, onChangeUserName, onChangeOrchestrationMode }: SettingsPanelProps) {
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

        <label className="field">
          <span>默认协作模式</span>
          <select
            value={settings.orchestrationMode}
            onChange={(event) => onChangeOrchestrationMode(event.target.value as AppSettings["orchestrationMode"])}
          >
            <option value="dag">DAG 编排</option>
            <option value="parallel">并行群聊</option>
          </select>
        </label>

        <button className="danger full" onClick={onClear}>
          清空本机聊天记录
        </button>
        <p className="hint">
          API Key 保存在本机应用配置目录中。DAG 编排会按选中顺序执行 AI1 简答、AI2 拓展、AI3 评价，并把前序输出作为后续节点上下文。
        </p>
      </section>
    </div>
  );
}
