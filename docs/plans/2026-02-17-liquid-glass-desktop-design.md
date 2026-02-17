# Liquid Glass Desktop UI — Design Document

**Date:** 2026-02-17
**Status:** Approved

## Goal

Replace the current sidebar-based dashboard layout with a macOS-like desktop environment featuring Apple Liquid Glass (2025+) aesthetics, a bottom dock with ~15 app icons, and floating/draggable/resizable windows for each page.

## Architecture

A `<DesktopShell>` wraps the entire viewport, rendering an animated glass mesh background, a minimal top bar, and a bottom `<Dock>`. Each dashboard page (Chat, Settings, Providers, etc.) opens inside a `<Window>` managed by a `<WindowManager>` that handles drag, resize, minimize, maximize, z-index, and localStorage persistence. Existing page components render unchanged inside windows — no page rewrites needed in Phase 1.

## Tech Stack

- React 19 (existing), no new frameworks
- CSS `backdrop-filter` + layered transparency for Liquid Glass
- `requestAnimationFrame` for drag/resize (no library)
- localStorage for window state persistence
- Existing 6 theme system extended with glass CSS custom properties

---

## Section 1: Desktop Shell & Window Manager

### Desktop Shell
- Full-viewport container (`100dvh x 100dvw`), replaces current sidebar + content layout
- Background: animated glass mesh gradient using existing theme CSS custom properties
- No traditional navigation — dock and windows handle all navigation
- Minimal top bar: current time, notification bell, user avatar, active window title

### Window Manager (`<WindowManager>`)
- Each page opens as a floating window
- Window state: `Map<string, WindowState>` where `WindowState = { x, y, width, height, zIndex, minimized, maximized }`
- **Drag**: mousedown on title bar, `requestAnimationFrame` loop
- **Resize**: 8-point handles (corners + edges), min size 320x240
- **z-index**: global counter, clicking/focusing brings window to front
- **Minimize**: scale + translate animation into dock icon position
- **Maximize**: fills viewport minus dock height, smooth transition
- **Close**: slide out + fade, preserves scroll position for reopening
- **Snap zones**: drag to screen edges for half-screen tiling

### State Persistence
- Window positions/sizes saved to `localStorage`
- Active windows list persisted — restores layout on reload

---

## Section 2: The Dock

### Layout & Position
- Fixed at bottom center, floating (not edge-to-edge)
- Pill-shaped with Liquid Glass treatment (`backdrop-filter: blur` + translucent bg)
- Auto-hides when a window is maximized, reappears on hover near bottom edge

### Icons (~15 items)

| Icon | App | Route |
|------|-----|-------|
| Chat bubble | Chat | `/chat` |
| Brain | Architect | `/architect` |
| Shield | Vault | `/vault` |
| Plug | Providers | `/providers` |
| Radio | Channels | `/channels` |
| Users | Sessions | `/sessions` |
| Compass | Browser | `/browser` |
| Puzzle | Behaviors | `/behaviors` |
| Link | Connectors | `/connectors` |
| Globe | Web Search | `/web-search` |
| Gear | Settings | `/settings` |
| Activity | Logs | `/logs` |
| Heart | Health | `/health` |
| Terminal | Setup | `/setup` |
| Info | About | `/about` |

### Interactions
- **Hover magnification**: 1.0 to 1.5x with gaussian falloff to neighbors (macOS-style)
- **Click**: Opens/focuses app window
- **Indicator dot**: Below icon when window is open
- **Bounce**: When app is loading/streaming
- **Tooltip**: App name after 300ms hover delay
- **Right-click**: Context menu (Close, Minimize, New Window for Chat)
- **Drag reorder**: Saved to localStorage

### Responsive
- Screens < 768px: becomes bottom tab bar (5 icons + "more" grid, no magnification)

---

## Section 3: Liquid Glass Styling System

### Core Layers
```
Layer 1: backdrop-filter: blur(40px) saturate(180%)
Layer 2: Semi-transparent background (rgba, 0.12-0.25 alpha)
Layer 3: 1px gradient border (white 20% top, 5% bottom)
Layer 4: Inset box-shadow for inner glow (white 8%)
Layer 5: Drop shadow for depth
```

### CSS Custom Properties (extending themes)
```css
--glass-blur: 40px;
--glass-bg: rgba(var(--surface-rgb), 0.15);
--glass-border: rgba(255, 255, 255, 0.2);
--glass-shadow-inner: inset 0 1px 1px rgba(255, 255, 255, 0.08);
--glass-shadow-outer: 0 8px 32px rgba(0, 0, 0, 0.12);
--glass-specular: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 50%);
```

Each theme provides `--surface-rgb`, so glass adapts to all 6 themes.

### Depth Tiers

| Tier | Use | Blur | BG Alpha |
|------|-----|------|----------|
| Tier 1 (far) | Desktop widgets, dock | 40px | 0.12 |
| Tier 2 (mid) | Windows, panels | 30px | 0.18 |
| Tier 3 (near) | Modals, dropdowns, tooltips | 20px | 0.25 |

### Animation
- Window open: `scale(0.95) opacity(0)` to `scale(1) opacity(1)`, 250ms ease-out
- Window close: reverse, 200ms
- Minimize: scale + translate to dock position, 350ms spring
- `will-change: transform` only during active animation

### Fallback
- `@supports not (backdrop-filter: blur(1px))` — solid semi-transparent, no blur
- `prefers-reduced-motion` — instant show/hide, no animations

---

## Section 4: Chat as a Floating Window

### Window Behavior
- Standard window (drag, resize, minimize)
- Default: 480x600
- Multiple chat windows supported (each thread can be its own window)
- Min size: 360x400

### Internal Layout
```
┌─────────────────────────────────┐
│ ◉ ◉ ◉  Chat — Luna        ▾ ▢ │  Title bar
├────────┬────────────────────────┤
│ Threads│  Message area          │  Sidebar + content
│ ● Work │  🧠 Debugging          │  Context badge
│ ● Ideas│  [messages scroll]     │
│ + New  ├────────────────────────┤
│        │ ⌨ Type a message...  ⮐ │  Input bar
└────────┴────────────────────────┘
```

- Thread sidebar: 200px, collapsible
- Context badge + Sources: unchanged from current
- Auto-scroll with "scroll to bottom" pill
- Narrow mode (< 520px width): sidebar auto-collapses

### Multi-window Chat
- Each window has its own WebSocket (existing chatId pattern)
- Window title shows thread name
- Dock icon shows unread dot for background chat windows

---

## Section 5: Responsive Strategy & Migration Path

### Breakpoints

| Viewport | Experience |
|----------|-----------|
| >= 1024px | Full desktop — dock, floating windows, glass |
| 768-1023px | Simplified — dock at bottom, windows auto-maximize, glass |
| < 768px | Mobile — bottom tab bar, full-screen pages, reduced glass |

### Phased Migration
1. **Phase 1**: Build `DesktopShell`, `WindowManager`, `Dock`, glass CSS. Existing pages render inside windows unchanged.
2. **Phase 2**: Refine pages for window life — remove redundant headers, flex-based internal layouts.
3. **Phase 3**: Polish — snap zones, multi-chat windows, dock customization, animation tuning.

### Unchanged
- All 30 page components (initially)
- React Router (URLs map to windows)
- API layer
- Theme system (extended, not replaced)
- All existing tests

### New Components

| Component | Purpose | ~Lines |
|-----------|---------|--------|
| `DesktopShell` | Viewport, background, top bar | 80 |
| `WindowManager` | State, z-index, persistence | 200 |
| `Window` | Chrome, title bar, controls, resize | 250 |
| `Dock` | Icon bar, magnification, indicators | 180 |
| `DockIcon` | Icon, tooltip, context menu | 60 |
| `GlassLayer` | Reusable glass surface wrapper | 30 |
| `useWindowState` | localStorage persistence hook | 50 |

Total: ~850 lines new code + ~200 lines glass CSS.
