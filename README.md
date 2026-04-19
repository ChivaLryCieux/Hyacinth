# Hyacinth

Hyacinth 是一个基于 Rust、Tauri 2、React 和 Vite 的跨平台多智能体编排应用。项目优先面向 Android，同时也保留桌面端构建能力。

## 当前功能

- OpenAI 兼容 `chat/completions` 接口接入
- 每个 AI 独立配置名称、头像文字、API Key、接口地址、模型、系统提示词和温度
- 支持 DAG 编排模式：用户发出问题后，AI1 先简要回答，AI2 基于前序输出拓展补充，AI3 评价与审校
- 支持并行群聊模式：选中的多个 AI 同时回复
- 编排模式会按选中 AI 的顺序生成节点，并在对话区展示当前 DAG 依赖关系
- 设置由 Tauri 后端保存到本机应用配置目录
- 聊天记录保存在本机 `localStorage`
- 移动端优先布局，桌面端可直接使用右侧 AI 管理面板

## 多智能体编排

应用提供两种协作模式，可在对话区顶部或设置页切换：

- `DAG 编排`：按选中的 AI 顺序串行执行。第一个节点负责简洁作答，第二个节点负责拓展补充，第三个节点负责评价审校，更多节点会作为专项补充节点接入。后续节点会收到用户问题和已完成节点的输出。
- `并行群聊`：保留原有群聊行为，所有选中的 AI 同时收到当前上下文并独立回复。

DAG 编排目前采用线性依赖链作为默认图结构：

```text
用户问题 -> AI1 简答 -> AI2 拓展 -> AI3 评价 -> AI4+ 专项补充
```

每个节点仍然使用自己的模型、API Key、温度和系统提示词。应用会在请求时追加节点角色说明，不会覆盖用户为该 AI 配置的原始系统提示词。

## 常用命令

```bash
npm install
npm run build
npm run tauri:dev
npm run tauri:build
npm run android:init
npm run android:dev
npm run android:build
```

## Android 前置条件

Tauri Android 需要 Android Studio 完成 SDK 配置。根据 Tauri 官方前置要求，需要安装：

- Android SDK Platform
- Android SDK Platform-Tools
- NDK (Side by side)
- Android SDK Build-Tools
- Android SDK Command-line Tools

Linux 下常用环境变量：

```bash
export JAVA_HOME=/opt/android-studio/jbr
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 $ANDROID_HOME/ndk | tail -1)"
```

还需要安装 Rust Android targets：

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

配置完成后执行：

```bash
npm run android:init
npm run android:dev
```

## Linux 桌面构建前置条件

如果要在 Linux 桌面端执行 `npm run tauri:dev` 或 `npm run tauri:build`，需要安装 WebKitGTK/GLib 等系统开发包。Debian/Ubuntu 系列通常需要：

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libglib2.0-dev libxdo-dev libssl-dev librsvg2-dev
```
