# Desktop Companion App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a lightweight native desktop app (macOS menubar / Windows system tray / Linux tray) that provides quick-access chat, notifications, and always-on availability for Auxiora.

**Architecture:** Tauri 2.x app (Rust backend, web frontend) that embeds the existing dashboard React UI in a webview, connects to the local gateway via WebSocket, and provides system tray + global hotkey for a quick-chat popup. ~5MB binary vs Electron's 150MB+.

**Tech Stack:** Tauri 2.x, Rust, existing React dashboard (`packages/dashboard/ui/`), WebSocket, existing gateway API

---

## Background

The existing dashboard is a React SPA served by the gateway at `http://localhost:18800/dashboard`. It connects via WebSocket for real-time chat. The desktop app wraps this in a native window with tray integration.

### Key files to understand:
- `packages/gateway/src/server.ts` — HTTP/WS server, serves dashboard
- `packages/dashboard/ui/src/` — React UI with Chat, DesktopShell components
- `packages/updater/` — existing self-update system (can be adapted for desktop auto-update)

---

### Task 1: Scaffold Tauri Package

**Files:**
- Create: `packages/desktop/package.json`
- Create: `packages/desktop/src-tauri/Cargo.toml`
- Create: `packages/desktop/src-tauri/tauri.conf.json`
- Create: `packages/desktop/src-tauri/src/main.rs`
- Create: `packages/desktop/src-tauri/capabilities/default.json`

**Step 1: Initialize package**

```bash
cd packages && mkdir desktop && cd desktop
pnpm init
```

**Step 2: Install Tauri CLI & dependencies**

```bash
pnpm add -D @tauri-apps/cli@^2
pnpm add @tauri-apps/api@^2
```

**Step 3: Configure `tauri.conf.json`**

```json
{
  "$schema": "https://raw.githubusercontent.com/nicegui/nicegui/main/nicegui/elements/tauri.conf.json",
  "productName": "Auxiora",
  "version": "1.0.0",
  "identifier": "dev.auxiora.desktop",
  "build": {
    "frontendDist": "../dashboard/ui/dist",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "pnpm --filter @auxiora/dashboard-ui build",
    "beforeDevCommand": "pnpm --filter @auxiora/dashboard-ui dev"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [],
    "trayIcon": {
      "iconPath": "icons/tray-icon.png",
      "iconAsTemplate": true
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "nsis", "appimage"],
    "icon": ["icons/icon.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```

**Step 4: Create Rust entry point**

```rust
// packages/desktop/src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    Manager,
    tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent},
    menu::{Menu, MenuItem},
    WebviewUrl, WebviewWindowBuilder,
};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Create system tray
            let quit = MenuItem::with_id(app, "quit", "Quit Auxiora", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Open Chat", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Create main window (hidden by default — tray app)
            let _window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("http://localhost:18800/dashboard".parse().unwrap()),
            )
            .title("Auxiora")
            .inner_size(900.0, 700.0)
            .visible(false)
            .build()?;

            Ok(())
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .run(tauri::generate_context!())
        .expect("error while running Auxiora desktop");
}
```

**Step 5: Commit**

```bash
git add packages/desktop/
git commit -m "feat(desktop): scaffold Tauri 2.x desktop companion app"
```

---

### Task 2: Global Hotkey for Quick Chat

**Files:**
- Modify: `packages/desktop/src-tauri/src/main.rs` — add global shortcut handler
- Create: `packages/desktop/src-tauri/src/commands.rs` — Tauri commands

Register `Cmd+Shift+A` (macOS) / `Ctrl+Shift+A` (Windows/Linux) to toggle the chat window.

```rust
// In setup(), after window creation:
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyA);
app.global_shortcut().on_shortcut(shortcut, |app, _shortcut, _event| {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
})?;
```

```bash
git commit -m "feat(desktop): add global hotkey Cmd+Shift+A to toggle chat window"
```

---

### Task 3: System Notifications

**Files:**
- Create: `packages/desktop/src/notifications.ts` — TypeScript bridge for notifications
- Modify: `packages/dashboard/ui/src/pages/Chat.tsx` — emit notification when window hidden + new message

Use `@tauri-apps/plugin-notification` to show native OS notifications when a new message arrives while the app is in the background.

```typescript
// packages/desktop/src/notifications.ts
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

export async function notifyNewMessage(title: string, body: string): Promise<void> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const result = await requestPermission();
    granted = result === 'granted';
  }
  if (granted) {
    sendNotification({ title, body });
  }
}
```

```bash
git commit -m "feat(desktop): add native notifications for background messages"
```

---

### Task 4: Auto-Start on Login

**Files:**
- Modify: `packages/desktop/src-tauri/src/main.rs` — already included `autostart` plugin
- Create: `packages/desktop/src/settings.ts` — settings UI bridge

Uses `tauri-plugin-autostart` (already added in Task 1). Expose a toggle in the tray menu.

```bash
git commit -m "feat(desktop): add auto-start on login via tray menu toggle"
```

---

### Task 5: Gateway Connection Health Check

**Files:**
- Create: `packages/desktop/src/health.ts` — connection monitor
- Modify: tray icon to show connected/disconnected state

The app should detect if the Auxiora gateway is running and show status in the tray icon. If not running, show "Start Auxiora" option that launches the server.

```typescript
// packages/desktop/src/health.ts
export async function checkGateway(url = 'http://localhost:18800/api/v1/health'): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
```

```bash
git commit -m "feat(desktop): add gateway health check and tray status indicator"
```

---

### Task 6: Build & Package Configuration

**Files:**
- Modify: `packages/desktop/src-tauri/tauri.conf.json` — finalize bundle config
- Create: `packages/desktop/scripts/build.sh` — cross-platform build script
- Modify: root `package.json` — add `desktop:dev` and `desktop:build` scripts

**Build targets:**
- macOS: `.dmg` + `.app` (universal binary for Apple Silicon + Intel)
- Windows: `.msi` + portable `.exe` via NSIS
- Linux: `.AppImage` + `.deb`

```bash
# Build for current platform
cd packages/desktop && pnpm tauri build

# Dev mode with hot reload
cd packages/desktop && pnpm tauri dev
```

```bash
git commit -m "feat(desktop): configure build targets for macOS, Windows, Linux"
```

---

### Task 7: Integration Test

**Files:**
- Create: `packages/desktop/tests/health.test.ts`
- Create: `packages/desktop/tests/notifications.test.ts`

Unit tests for the TypeScript bridge modules (health check, notifications). Tauri UI testing uses `@tauri-apps/api/test`.

```bash
git commit -m "test(desktop): add unit tests for health check and notification modules"
```
