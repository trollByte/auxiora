# Desktop Companion App

> Tauri-based native app with menu bar integration, global hotkeys, push-to-talk voice overlay, and health monitoring.

## Overview

The Desktop Companion is a lightweight native application built with **Tauri 2.x** that runs alongside the Auxiora gateway. It provides system-level integration that a browser tab cannot: global hotkeys that work from any application, a persistent menu bar/system tray presence, push-to-talk voice input, and native OS notifications.

The desktop app connects to the gateway at `http://localhost:18800` and monitors its health every 5 seconds. It does not replace the web dashboard -- it complements it with native OS capabilities.

## Features

### Menu Bar / System Tray

A persistent icon in your menu bar (macOS) or system tray (Windows/Linux) shows the current status of the Auxiora gateway:

| Status | Meaning |
|--------|---------|
| Running | Gateway is healthy and responding |
| Disconnected | Gateway is not reachable |
| Updating | A self-update is in progress |
| Error | Something needs attention |

The tray menu provides quick actions:

- **Show Auxiora** -- Bring the main window to the front.
- **Preferences** -- Open the settings panel.
- **Recent conversations** -- Jump back into up to 5 recent sessions.
- **Custom quick actions** -- Configurable shortcuts for common tasks.
- **Quit** -- Close the desktop app.

### Global Hotkeys

System-wide keyboard shortcuts that work from any application, even when Auxiora is not focused.

| Default Hotkey | Action |
|----------------|--------|
| `Ctrl+Shift+A` (or `Cmd+Shift+A` on macOS) | Open the Auxiora quick-input window |
| `Ctrl+Shift+Space` (or `Cmd+Shift+Space` on macOS) | Push-to-talk toggle |

Hotkeys are fully customizable. Register additional bindings for frequently used actions.

### Push-to-Talk Voice Overlay

A floating overlay for hands-free voice input:

1. Press the PTT hotkey (`Ctrl+Shift+Space` by default) to start recording.
2. A small overlay indicator appears on screen to show recording is active.
3. Press the hotkey again to stop recording and send the audio for transcription.
4. The transcribed text is sent to the assistant as a message.

The overlay indicator can be toggled on or off in settings. Voice processing uses the configured STT provider (see [Voice Mode](voice.md)).

### Native Notifications

OS-level notifications for assistant messages, behavior alerts, and system events. The app requests notification permission on first use and respects OS-level Do Not Disturb settings.

Notifications support:

- Title and body text
- Silent mode (no sound)
- Tags for grouping related notifications
- Reply actions (respond directly from the notification)

### Health Monitoring Bridge

The desktop app continuously monitors the gateway's health endpoint (`/api/v1/health`) with a configurable polling interval (default: 5 seconds). When the gateway becomes unreachable or recovers, the app:

- Updates the menu bar/tray icon status.
- Sends a native notification on status transitions (connected to disconnected, or vice versa).
- Exposes the current status via `GatewayMonitor.getStatus()` for other components.

### Auto-Start on Login

Uses the Tauri autostart plugin to register Auxiora as a login item on your operating system. When enabled, the desktop app launches automatically when you log in, minimized to the menu bar/system tray.

## Installation

### Download from Releases

Download the latest release for your platform from the [GitHub releases page](https://github.com/trollByte/auxiora/releases):

| Platform | Format |
|----------|--------|
| macOS | `.dmg` |
| Windows | `.msi` |
| Linux | `.deb`, `.AppImage` |

### Build from Source

```bash
# Prerequisites: Rust toolchain, Node.js 22+, pnpm
cd packages/desktop
pnpm install
pnpm tauri build
```

The built application will be in `packages/desktop/src-tauri/target/release/bundle/`.

## Configuration

All desktop settings are stored in the app's configuration file. Defaults are shown below:

| Setting | Default | Description |
|---------|---------|-------------|
| `autoStart` | `false` | Launch on login |
| `minimizeToTray` | `true` | Minimize to tray instead of closing |
| `hotkey` | `CommandOrControl+Shift+A` | Global hotkey to open Auxiora |
| `notificationsEnabled` | `true` | Enable native notifications |
| `updateChannel` | `stable` | Update channel: `stable`, `beta`, or `nightly` |
| `ollamaEnabled` | `false` | Manage a local Ollama instance |
| `ollamaPort` | `11434` | Port for the managed Ollama instance |
| `windowWidth` | `1024` | Default window width in pixels |
| `windowHeight` | `768` | Default window height in pixels |

### Push-to-Talk Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `ptt.enabled` | `false` | Enable push-to-talk |
| `ptt.hotkey` | `CmdOrCtrl+Shift+Space` | PTT toggle hotkey |
| `ptt.showOverlay` | `true` | Show the floating recording indicator |

### Menu Bar Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `menuBar.showStatusIcon` | `true` | Show the tray icon |
| `menuBar.showRecentConversations` | `true` | Show recent sessions in tray menu |
| `menuBar.maxRecentConversations` | `5` | Maximum recent sessions to show |

## Use Cases

### 1. Quick Capture

Press `Ctrl+Shift+A` from any application to open a quick-input window. Type a thought, ask a question, or send a command. The response appears in the same overlay or is routed to the full dashboard. Close the overlay and return to what you were doing without losing context.

### 2. Voice Assistant

Enable push-to-talk and use `Ctrl+Shift+Space` to talk to Auxiora from any application. Ask a question while reading code, dictate a message while your hands are busy, or give voice commands to control smart home devices through the Home Assistant connector. The floating overlay confirms recording status at a glance.

### 3. Status Monitor

Keep the menu bar icon visible as a passive health indicator for your Auxiora instance. A green status means the gateway is running normally. When the icon changes to indicate an error or disconnection, click it to see details and take action. Native notifications alert you to status transitions so you never miss a connectivity issue.

## Related Documentation

- [Voice Mode](voice.md) -- STT/TTS providers, wake-word detection, real-time conversation
- [Web Dashboard](dashboard.md) -- The full browser-based interface
- [CLI Reference](cli.md) -- `auxiora desktop` command for managing the app from the terminal
- [AI Providers](providers.md) -- Ollama setup for local model integration
