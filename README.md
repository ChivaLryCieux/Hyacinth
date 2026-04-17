# Hyacinth

Hyacinth 是一个基于 Rust、Tauri 2、React 和 Vite 的跨平台 AI 对话应用。项目优先面向 Android，同时也保留桌面端构建能力。

## 当前功能

- OpenAI 兼容 `chat/completions` 接口接入
- 每个 AI 独立配置名称、头像文字、API Key、接口地址、模型、系统提示词和温度
- 支持选中多个 AI 同时回复，形成群聊
- 设置由 Tauri 后端保存到本机应用配置目录
- 聊天记录保存在本机 `localStorage`
- 移动端优先布局，桌面端可直接使用右侧 AI 管理面板

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

