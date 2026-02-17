# Liquid Glass Desktop UI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the sidebar-based dashboard layout with a macOS-like desktop environment featuring a bottom dock, floating windows, and Apple Liquid Glass styling.

**Architecture:** A `<DesktopShell>` replaces the current `<Layout>` as the wrapper for authenticated routes. It renders a glass mesh background, a `<TopBar>`, and a `<Dock>`. Each page component opens inside a `<Window>` managed by a `<WindowManager>` that tracks drag/resize/z-index state. Existing page components render unchanged inside windows — zero page rewrites in Phase 1.

**Tech Stack:** React 19 (existing), CSS `backdrop-filter` for glass, `requestAnimationFrame` for drag/resize, localStorage for window persistence, vitest + testing-library for tests.

**Design Doc:** `docs/plans/2026-02-17-liquid-glass-desktop-design.md`

---

## Task 1: Glass CSS Foundation

Create the Liquid Glass CSS custom properties and utility classes that all subsequent components depend on.

**Files:**
- Create: `packages/dashboard/ui/src/styles/glass.css`
- Modify: `packages/dashboard/ui/src/styles/global.css:1-3` (add import)

**Step 1: Create glass.css**

Create `packages/dashboard/ui/src/styles/glass.css`:

```css
/* glass.css — Liquid Glass Design System
 *
 * Three depth tiers: far (dock/widgets), mid (windows), near (modals/tooltips).
 * All glass surfaces use backdrop-filter + translucent backgrounds.
 * Theme-aware via --surface-rgb from each theme's :root variables.
 */

/* ── Glass tokens ─────────────────────────────────────────────────────────── */

:root {
  /* Surface RGB extracted from theme bg — default dark */
  --surface-rgb: 10, 10, 10;

  /* Tier 1: Far — dock, desktop widgets */
  --glass-blur-far: 40px;
  --glass-bg-far: rgba(var(--surface-rgb), 0.12);

  /* Tier 2: Mid — windows, panels */
  --glass-blur-mid: 30px;
  --glass-bg-mid: rgba(var(--surface-rgb), 0.18);

  /* Tier 3: Near — modals, dropdowns, tooltips */
  --glass-blur-near: 20px;
  --glass-bg-near: rgba(var(--surface-rgb), 0.25);

  /* Shared glass effects */
  --glass-border-top: rgba(255, 255, 255, 0.2);
  --glass-border-bottom: rgba(255, 255, 255, 0.05);
  --glass-shadow-inner: inset 0 1px 1px rgba(255, 255, 255, 0.08);
  --glass-shadow-outer: 0 8px 32px rgba(0, 0, 0, 0.12);
  --glass-specular: linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, transparent 50%);

  /* Animation */
  --glass-transition: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --glass-spring: 350ms cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Desktop dimensions */
  --dock-height: 68px;
  --topbar-height: 32px;
  --window-min-width: 360px;
  --window-min-height: 240px;
}

/* ── Glass mixins (as utility classes) ────────────────────────────────────── */

.glass-far {
  background: var(--glass-bg-far);
  backdrop-filter: blur(var(--glass-blur-far)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--glass-blur-far)) saturate(180%);
  border: 1px solid;
  border-image: linear-gradient(
    to bottom,
    var(--glass-border-top),
    var(--glass-border-bottom)
  ) 1;
  box-shadow: var(--glass-shadow-inner), var(--glass-shadow-outer);
}

.glass-mid {
  background: var(--glass-bg-mid);
  backdrop-filter: blur(var(--glass-blur-mid)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--glass-blur-mid)) saturate(180%);
  border: 1px solid;
  border-image: linear-gradient(
    to bottom,
    var(--glass-border-top),
    var(--glass-border-bottom)
  ) 1;
  box-shadow: var(--glass-shadow-inner), var(--glass-shadow-outer);
}

.glass-near {
  background: var(--glass-bg-near);
  backdrop-filter: blur(var(--glass-blur-near)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--glass-blur-near)) saturate(180%);
  border: 1px solid;
  border-image: linear-gradient(
    to bottom,
    var(--glass-border-top),
    var(--glass-border-bottom)
  ) 1;
  box-shadow: var(--glass-shadow-inner), var(--glass-shadow-outer);
}

/* ── Fallback for no backdrop-filter support ──────────────────────────────── */

@supports not (backdrop-filter: blur(1px)) {
  .glass-far { background: rgba(var(--surface-rgb), 0.85); }
  .glass-mid { background: rgba(var(--surface-rgb), 0.9); }
  .glass-near { background: rgba(var(--surface-rgb), 0.92); }
}

/* ── Reduced motion ───────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  :root {
    --glass-transition: 0ms;
    --glass-spring: 0ms;
  }
}

/* ── Theme overrides for --surface-rgb ────────────────────────────────────── */

[data-theme="nebula"]    { --surface-rgb: 8, 11, 22; }
[data-theme="monolith"]  { --surface-rgb: 18, 18, 18; }
[data-theme="signal"]    { --surface-rgb: 10, 15, 20; }
[data-theme="polar"]     { --surface-rgb: 240, 245, 250; --glass-border-top: rgba(0, 0, 0, 0.1); --glass-border-bottom: rgba(0, 0, 0, 0.03); }
[data-theme="neon"]      { --surface-rgb: 5, 5, 15; }
[data-theme="terra"]     { --surface-rgb: 20, 18, 15; }

/* ── Desktop shell ────────────────────────────────────────────────────────── */

.desktop-shell {
  position: fixed;
  inset: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.desktop-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--bg-primary);
  background-image:
    radial-gradient(ellipse 900px 700px at 80% 10%, rgba(var(--accent-rgb, 124, 58, 237), 0.10) 0%, transparent 70%),
    radial-gradient(ellipse 600px 500px at 20% 80%, rgba(var(--accent-rgb, 124, 58, 237), 0.06) 0%, transparent 60%),
    radial-gradient(ellipse 400px 400px at 50% 50%, rgba(var(--accent-rgb, 124, 58, 237), 0.03) 0%, transparent 50%);
}

/* ── Top bar ──────────────────────────────────────────────────────────────── */

.topbar {
  position: relative;
  z-index: 9999;
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(var(--surface-rgb), 0.4);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  border-bottom: 1px solid var(--border);
  user-select: none;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.topbar-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-weight: 500;
  color: var(--text-secondary);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ── Window chrome ────────────────────────────────────────────────────────── */

.window {
  position: absolute;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: box-shadow var(--glass-transition);
}

.window.focused {
  box-shadow: var(--glass-shadow-inner), 0 12px 48px rgba(0, 0, 0, 0.2);
}

.window-titlebar {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  gap: 8px;
  cursor: grab;
  user-select: none;
  background: rgba(var(--surface-rgb), 0.3);
  border-bottom: 1px solid var(--border);
}

.window-titlebar:active {
  cursor: grabbing;
}

.window-traffic-lights {
  display: flex;
  gap: 6px;
}

.window-traffic-light {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: filter 120ms ease;
}

.window-traffic-light:hover {
  filter: brightness(1.2);
}

.window-traffic-light.close { background: #ff5f57; }
.window-traffic-light.minimize { background: #febc2e; }
.window-traffic-light.maximize { background: #28c840; }

.window-title {
  flex: 1;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.window-body {
  flex: 1;
  overflow: auto;
  position: relative;
}

/* Remove page <h2> titles when inside a window (title bar replaces them) */
.window-body > .page > h2:first-child {
  display: none;
}

/* ── Resize handles ───────────────────────────────────────────────────────── */

.window-resize {
  position: absolute;
  z-index: 1;
}

.window-resize-n  { top: -3px; left: 8px; right: 8px; height: 6px; cursor: n-resize; }
.window-resize-s  { bottom: -3px; left: 8px; right: 8px; height: 6px; cursor: s-resize; }
.window-resize-e  { top: 8px; right: -3px; bottom: 8px; width: 6px; cursor: e-resize; }
.window-resize-w  { top: 8px; left: -3px; bottom: 8px; width: 6px; cursor: w-resize; }
.window-resize-ne { top: -3px; right: -3px; width: 12px; height: 12px; cursor: ne-resize; }
.window-resize-nw { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nw-resize; }
.window-resize-se { bottom: -3px; right: -3px; width: 12px; height: 12px; cursor: se-resize; }
.window-resize-sw { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: sw-resize; }

/* ── Window animations ────────────────────────────────────────────────────── */

.window-enter {
  animation: windowOpen var(--glass-transition) forwards;
}

.window-exit {
  animation: windowClose 200ms forwards;
}

@keyframes windowOpen {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes windowClose {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.95); }
}

/* ── Maximized window ─────────────────────────────────────────────────────── */

.window.maximized {
  border-radius: 0;
  transition: all var(--glass-transition);
}

/* ── Dock ─────────────────────────────────────────────────────────────────── */

.dock-container {
  position: fixed;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9998;
  display: flex;
  align-items: flex-end;
  padding: 4px 8px;
  border-radius: 18px;
  background: var(--glass-bg-far);
  backdrop-filter: blur(var(--glass-blur-far)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--glass-blur-far)) saturate(180%);
  border: 1px solid var(--glass-border-top);
  box-shadow: var(--glass-shadow-inner), var(--glass-shadow-outer);
}

.dock-icon-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 2px;
  position: relative;
}

.dock-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  cursor: pointer;
  transition: transform 150ms ease;
  font-size: 22px;
  color: var(--text-primary);
  background: rgba(var(--surface-rgb), 0.3);
  border: 1px solid var(--border);
}

.dock-icon:hover {
  background: rgba(var(--surface-rgb), 0.5);
}

.dock-icon-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-secondary);
  margin-top: 2px;
  opacity: 0;
  transition: opacity 150ms ease;
}

.dock-icon-dot.active {
  opacity: 1;
}

.dock-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-primary);
  background: rgba(var(--surface-rgb), 0.8);
  backdrop-filter: blur(12px);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease;
}

.dock-icon-wrapper:hover .dock-tooltip {
  opacity: 1;
}

/* ── Responsive: tablets (no floating windows) ────────────────────────────── */

@media (max-width: 1023px) and (min-width: 768px) {
  .window {
    position: fixed !important;
    inset: var(--topbar-height) 0 calc(var(--dock-height) + 16px) 0 !important;
    width: auto !important;
    height: auto !important;
    border-radius: 0 !important;
  }
  .window-resize { display: none; }
}

/* ── Responsive: mobile (tab bar, no windows) ─────────────────────────────── */

@media (max-width: 767px) {
  .desktop-shell { display: none; }
  /* Fall back to existing sidebar layout on mobile */
}
```

**Step 2: Add glass.css import to global.css**

In `packages/dashboard/ui/src/styles/global.css`, add after line 2 (`@import './themes/index.css';`):

```css
@import './glass.css';
```

**Step 3: Run the build to verify CSS parses**

Run: `cd /home/ai-work/git/auxiora && pnpm --filter dashboard run build:ui 2>&1 | tail -20`
Expected: Build completes without CSS errors.

**Step 4: Commit**

```bash
git add packages/dashboard/ui/src/styles/glass.css packages/dashboard/ui/src/styles/global.css
git commit -m "feat(dashboard): add Liquid Glass CSS design system"
```

---

## Task 2: useWindowState Hook

A React hook that manages window positions/sizes in localStorage.

**Files:**
- Create: `packages/dashboard/ui/src/hooks/useWindowState.ts`
- Test: `packages/dashboard/ui/src/hooks/__tests__/useWindowState.test.ts`

**Step 1: Write the failing test**

Create `packages/dashboard/ui/src/hooks/__tests__/useWindowState.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWindowState } from '../useWindowState.js';
import type { WindowState } from '../useWindowState.js';

beforeEach(() => {
  localStorage.clear();
});

describe('useWindowState', () => {
  it('returns empty map when no state saved', () => {
    const { result } = renderHook(() => useWindowState());
    expect(result.current.windows.size).toBe(0);
  });

  it('openWindow adds a window with default position', () => {
    const { result } = renderHook(() => useWindowState());
    act(() => { result.current.openWindow('chat', 'Chat'); });
    const w = result.current.windows.get('chat');
    expect(w).toBeTruthy();
    expect(w!.id).toBe('chat');
    expect(w!.title).toBe('Chat');
    expect(w!.minimized).toBe(false);
    expect(w!.maximized).toBe(false);
    expect(w!.width).toBeGreaterThanOrEqual(360);
  });

  it('closeWindow removes a window', () => {
    const { result } = renderHook(() => useWindowState());
    act(() => { result.current.openWindow('chat', 'Chat'); });
    act(() => { result.current.closeWindow('chat'); });
    expect(result.current.windows.has('chat')).toBe(false);
  });

  it('focusWindow brings window to top z-index', () => {
    const { result } = renderHook(() => useWindowState());
    act(() => { result.current.openWindow('chat', 'Chat'); });
    act(() => { result.current.openWindow('settings', 'Settings'); });
    const z1 = result.current.windows.get('settings')!.zIndex;
    act(() => { result.current.focusWindow('chat'); });
    const z2 = result.current.windows.get('chat')!.zIndex;
    expect(z2).toBeGreaterThan(z1);
  });

  it('moveWindow updates x and y', () => {
    const { result } = renderHook(() => useWindowState());
    act(() => { result.current.openWindow('chat', 'Chat'); });
    act(() => { result.current.moveWindow('chat', 100, 200); });
    const w = result.current.windows.get('chat')!;
    expect(w.x).toBe(100);
    expect(w.y).toBe(200);
  });

  it('resizeWindow updates width and height', () => {
    const { result } = renderHook(() => useWindowState());
    act(() => { result.current.openWindow('chat', 'Chat'); });
    act(() => { result.current.resizeWindow('chat', 500, 400); });
    const w = result.current.windows.get('chat')!;
    expect(w.width).toBe(500);
    expect(w.height).toBe(400);
  });

  it('resizeWindow clamps to minimum', () => {
    const { result } = renderHook(() => useWindowState());
    act(() => { result.current.openWindow('chat', 'Chat'); });
    act(() => { result.current.resizeWindow('chat', 100, 100); });
    const w = result.current.windows.get('chat')!;
    expect(w.width).toBeGreaterThanOrEqual(360);
    expect(w.height).toBeGreaterThanOrEqual(240);
  });

  it('toggleMinimize sets minimized true/false', () => {
    const { result } = renderHook(() => useWindowState());
    act(() => { result.current.openWindow('chat', 'Chat'); });
    act(() => { result.current.toggleMinimize('chat'); });
    expect(result.current.windows.get('chat')!.minimized).toBe(true);
    act(() => { result.current.toggleMinimize('chat'); });
    expect(result.current.windows.get('chat')!.minimized).toBe(false);
  });

  it('toggleMaximize sets maximized true/false', () => {
    const { result } = renderHook(() => useWindowState());
    act(() => { result.current.openWindow('chat', 'Chat'); });
    act(() => { result.current.toggleMaximize('chat'); });
    expect(result.current.windows.get('chat')!.maximized).toBe(true);
    act(() => { result.current.toggleMaximize('chat'); });
    expect(result.current.windows.get('chat')!.maximized).toBe(false);
  });

  it('persists state to localStorage', () => {
    const { result } = renderHook(() => useWindowState());
    act(() => { result.current.openWindow('chat', 'Chat'); });
    const stored = localStorage.getItem('auxiora-windows');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.chat).toBeTruthy();
    expect(parsed.chat.id).toBe('chat');
  });

  it('restores state from localStorage on mount', () => {
    const saved: Record<string, WindowState> = {
      chat: {
        id: 'chat', title: 'Chat',
        x: 50, y: 60, width: 500, height: 400,
        zIndex: 1, minimized: false, maximized: false,
      },
    };
    localStorage.setItem('auxiora-windows', JSON.stringify(saved));
    const { result } = renderHook(() => useWindowState());
    expect(result.current.windows.get('chat')?.x).toBe(50);
  });

  it('activeWindowId returns the window with highest z-index', () => {
    const { result } = renderHook(() => useWindowState());
    act(() => { result.current.openWindow('chat', 'Chat'); });
    act(() => { result.current.openWindow('settings', 'Settings'); });
    expect(result.current.activeWindowId).toBe('settings');
    act(() => { result.current.focusWindow('chat'); });
    expect(result.current.activeWindowId).toBe('chat');
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/dashboard/ui/src/hooks/__tests__/useWindowState.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/dashboard/ui/src/hooks/useWindowState.ts`:

```typescript
import { useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'auxiora-windows';
const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 500;
const CASCADE_OFFSET = 30;

export interface WindowState {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
}

function loadWindows(): Map<string, WindowState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, WindowState>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveWindows(windows: Map<string, WindowState>): void {
  const obj = Object.fromEntries(windows);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function nextZIndex(windows: Map<string, WindowState>): number {
  let max = 0;
  for (const w of windows.values()) {
    if (w.zIndex > max) max = w.zIndex;
  }
  return max + 1;
}

export function useWindowState() {
  const [windows, setWindows] = useState<Map<string, WindowState>>(loadWindows);

  const update = useCallback((fn: (prev: Map<string, WindowState>) => Map<string, WindowState>) => {
    setWindows(prev => {
      const next = fn(prev);
      saveWindows(next);
      return next;
    });
  }, []);

  const openWindow = useCallback((id: string, title: string) => {
    update(prev => {
      if (prev.has(id)) {
        // Already open — focus it
        const next = new Map(prev);
        const w = next.get(id)!;
        next.set(id, { ...w, zIndex: nextZIndex(next), minimized: false });
        return next;
      }
      const next = new Map(prev);
      const cascadeCount = next.size;
      next.set(id, {
        id,
        title,
        x: 80 + (cascadeCount % 8) * CASCADE_OFFSET,
        y: 60 + (cascadeCount % 8) * CASCADE_OFFSET,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        zIndex: nextZIndex(next),
        minimized: false,
        maximized: false,
      });
      return next;
    });
  }, [update]);

  const closeWindow = useCallback((id: string) => {
    update(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, [update]);

  const focusWindow = useCallback((id: string) => {
    update(prev => {
      const w = prev.get(id);
      if (!w) return prev;
      const next = new Map(prev);
      next.set(id, { ...w, zIndex: nextZIndex(next) });
      return next;
    });
  }, [update]);

  const moveWindow = useCallback((id: string, x: number, y: number) => {
    update(prev => {
      const w = prev.get(id);
      if (!w) return prev;
      const next = new Map(prev);
      next.set(id, { ...w, x, y });
      return next;
    });
  }, [update]);

  const resizeWindow = useCallback((id: string, width: number, height: number) => {
    update(prev => {
      const w = prev.get(id);
      if (!w) return prev;
      const next = new Map(prev);
      next.set(id, {
        ...w,
        width: Math.max(MIN_WIDTH, width),
        height: Math.max(MIN_HEIGHT, height),
      });
      return next;
    });
  }, [update]);

  const toggleMinimize = useCallback((id: string) => {
    update(prev => {
      const w = prev.get(id);
      if (!w) return prev;
      const next = new Map(prev);
      next.set(id, { ...w, minimized: !w.minimized });
      return next;
    });
  }, [update]);

  const toggleMaximize = useCallback((id: string) => {
    update(prev => {
      const w = prev.get(id);
      if (!w) return prev;
      const next = new Map(prev);
      next.set(id, { ...w, maximized: !w.maximized });
      return next;
    });
  }, [update]);

  const activeWindowId = useMemo(() => {
    let maxZ = -1;
    let activeId: string | null = null;
    for (const w of windows.values()) {
      if (!w.minimized && w.zIndex > maxZ) {
        maxZ = w.zIndex;
        activeId = w.id;
      }
    }
    return activeId;
  }, [windows]);

  return {
    windows,
    activeWindowId,
    openWindow,
    closeWindow,
    focusWindow,
    moveWindow,
    resizeWindow,
    toggleMinimize,
    toggleMaximize,
  };
}
```

**Step 4: Run the test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/dashboard/ui/src/hooks/__tests__/useWindowState.test.ts 2>&1 | tail -15`
Expected: All 11 tests PASS

**Step 5: Commit**

```bash
git add packages/dashboard/ui/src/hooks/useWindowState.ts packages/dashboard/ui/src/hooks/__tests__/useWindowState.test.ts
git commit -m "feat(dashboard): add useWindowState hook with localStorage persistence"
```

---

## Task 3: Window Component

A draggable, resizable window with title bar, traffic lights, and body slot.

**Files:**
- Create: `packages/dashboard/ui/src/components/Window.tsx`
- Test: `packages/dashboard/ui/src/components/__tests__/Window.test.tsx`

**Step 1: Write the failing test**

Create `packages/dashboard/ui/src/components/__tests__/Window.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Window } from '../Window.js';

const defaults = {
  id: 'test-window',
  title: 'Test Window',
  x: 100,
  y: 50,
  width: 600,
  height: 400,
  zIndex: 1,
  minimized: false,
  maximized: false,
  focused: true,
  onClose: vi.fn(),
  onFocus: vi.fn(),
  onMinimize: vi.fn(),
  onMaximize: vi.fn(),
  onMove: vi.fn(),
  onResize: vi.fn(),
};

describe('Window', () => {
  it('renders the title', () => {
    render(<Window {...defaults}>content</Window>);
    expect(screen.getByText('Test Window')).toBeTruthy();
  });

  it('renders children in the body', () => {
    render(<Window {...defaults}><p>Hello World</p></Window>);
    expect(screen.getByText('Hello World')).toBeTruthy();
  });

  it('has 3 traffic light buttons', () => {
    render(<Window {...defaults}>c</Window>);
    expect(screen.getByLabelText('Close window')).toBeTruthy();
    expect(screen.getByLabelText('Minimize window')).toBeTruthy();
    expect(screen.getByLabelText('Maximize window')).toBeTruthy();
  });

  it('calls onClose when close traffic light clicked', async () => {
    render(<Window {...defaults}>c</Window>);
    await userEvent.click(screen.getByLabelText('Close window'));
    expect(defaults.onClose).toHaveBeenCalledOnce();
  });

  it('calls onMinimize when minimize traffic light clicked', async () => {
    render(<Window {...defaults}>c</Window>);
    await userEvent.click(screen.getByLabelText('Minimize window'));
    expect(defaults.onMinimize).toHaveBeenCalledOnce();
  });

  it('calls onMaximize when maximize traffic light clicked', async () => {
    render(<Window {...defaults}>c</Window>);
    await userEvent.click(screen.getByLabelText('Maximize window'));
    expect(defaults.onMaximize).toHaveBeenCalledOnce();
  });

  it('does not render when minimized', () => {
    const { container } = render(<Window {...defaults} minimized={true}>c</Window>);
    expect(container.querySelector('.window')).toBeNull();
  });

  it('applies maximized class when maximized', () => {
    const { container } = render(<Window {...defaults} maximized={true}>c</Window>);
    expect(container.querySelector('.window.maximized')).toBeTruthy();
  });

  it('applies focused class when focused', () => {
    const { container } = render(<Window {...defaults} focused={true}>c</Window>);
    expect(container.querySelector('.window.focused')).toBeTruthy();
  });

  it('calls onFocus when window body is clicked', async () => {
    render(<Window {...defaults} focused={false}>content</Window>);
    await userEvent.click(screen.getByText('content'));
    expect(defaults.onFocus).toHaveBeenCalled();
  });

  it('positions window using inline styles', () => {
    const { container } = render(<Window {...defaults}>c</Window>);
    const el = container.querySelector('.window') as HTMLElement;
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('50px');
    expect(el.style.width).toBe('600px');
    expect(el.style.height).toBe('400px');
  });

  it('has 8 resize handles', () => {
    const { container } = render(<Window {...defaults}>c</Window>);
    const handles = container.querySelectorAll('.window-resize');
    expect(handles.length).toBe(8);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/dashboard/ui/src/components/__tests__/Window.test.tsx 2>&1 | tail -10`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/dashboard/ui/src/components/Window.tsx`:

```tsx
import { useRef, useCallback, type ReactNode, type MouseEvent } from 'react';

export interface WindowProps {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  focused: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  children: ReactNode;
}

const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;

export function Window({
  id,
  title,
  x, y, width, height, zIndex,
  minimized, maximized, focused,
  onClose, onFocus, onMinimize, onMaximize,
  onMove, onResize,
  children,
}: WindowProps) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{
    dir: string; startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
  } | null>(null);

  const handleTitleBarMouseDown = useCallback((e: MouseEvent) => {
    if (maximized) return;
    e.preventDefault();
    onFocus();
    const startX = e.clientX;
    const startY = e.clientY;
    dragRef.current = { startX, startY, origX: x, origY: y };

    const handleMouseMove = (ev: globalThis.MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      onMove(dragRef.current.origX + dx, dragRef.current.origY + dy);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [maximized, x, y, onFocus, onMove]);

  const handleResizeMouseDown = useCallback((dir: string, e: MouseEvent) => {
    if (maximized) return;
    e.preventDefault();
    e.stopPropagation();
    onFocus();
    resizeRef.current = {
      dir, startX: e.clientX, startY: e.clientY,
      origX: x, origY: y, origW: width, origH: height,
    };

    const handleMouseMove = (ev: globalThis.MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;
      let newX = r.origX, newY = r.origY, newW = r.origW, newH = r.origH;

      if (r.dir.includes('e')) newW = r.origW + dx;
      if (r.dir.includes('w')) { newW = r.origW - dx; newX = r.origX + dx; }
      if (r.dir.includes('s')) newH = r.origH + dy;
      if (r.dir.includes('n')) { newH = r.origH - dy; newY = r.origY + dy; }

      onResize(newW, newH);
      if (r.dir.includes('w') || r.dir.includes('n')) {
        onMove(newX, newY);
      }
    };

    const handleMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [maximized, x, y, width, height, onFocus, onResize, onMove]);

  if (minimized) return null;

  const style = maximized
    ? { zIndex, inset: '0', width: '100%', height: '100%' }
    : { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, zIndex };

  const classes = ['window', 'glass-mid'];
  if (focused) classes.push('focused');
  if (maximized) classes.push('maximized');

  return (
    <div
      className={classes.join(' ')}
      style={style}
      onMouseDown={onFocus}
      data-window-id={id}
    >
      {/* Resize handles */}
      {!maximized && RESIZE_DIRS.map(dir => (
        <div
          key={dir}
          className={`window-resize window-resize-${dir}`}
          onMouseDown={(e) => handleResizeMouseDown(dir, e)}
        />
      ))}

      {/* Title bar */}
      <div className="window-titlebar" onMouseDown={handleTitleBarMouseDown}>
        <div className="window-traffic-lights">
          <button
            type="button"
            className="window-traffic-light close"
            aria-label="Close window"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
          />
          <button
            type="button"
            className="window-traffic-light minimize"
            aria-label="Minimize window"
            onClick={(e) => { e.stopPropagation(); onMinimize(); }}
          />
          <button
            type="button"
            className="window-traffic-light maximize"
            aria-label="Maximize window"
            onClick={(e) => { e.stopPropagation(); onMaximize(); }}
          />
        </div>
        <span className="window-title">{title}</span>
      </div>

      {/* Body */}
      <div className="window-body">
        {children}
      </div>
    </div>
  );
}
```

**Step 4: Run the test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/dashboard/ui/src/components/__tests__/Window.test.tsx 2>&1 | tail -15`
Expected: All 12 tests PASS

**Step 5: Commit**

```bash
git add packages/dashboard/ui/src/components/Window.tsx packages/dashboard/ui/src/components/__tests__/Window.test.tsx
git commit -m "feat(dashboard): add Window component with drag, resize, and traffic lights"
```

---

## Task 4: Dock Component

The bottom dock with icons, tooltips, and active indicators.

**Files:**
- Create: `packages/dashboard/ui/src/components/Dock.tsx`
- Test: `packages/dashboard/ui/src/components/__tests__/Dock.test.tsx`

**Step 1: Write the failing test**

Create `packages/dashboard/ui/src/components/__tests__/Dock.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dock, type DockItem } from '../Dock.js';

const items: DockItem[] = [
  { id: 'chat', label: 'Chat', icon: '\u{1F4AC}' },
  { id: 'overview', label: 'Mission Control', icon: '\u{1F3AF}' },
  { id: 'settings', label: 'Settings', icon: '\u2699\uFE0F' },
];

const defaults = {
  items,
  openWindows: new Set<string>(),
  onOpen: vi.fn(),
};

describe('Dock', () => {
  it('renders all dock icons', () => {
    render(<Dock {...defaults} />);
    for (const item of items) {
      expect(screen.getByLabelText(`Open ${item.label}`)).toBeTruthy();
    }
  });

  it('shows tooltip text for each icon', () => {
    render(<Dock {...defaults} />);
    for (const item of items) {
      expect(screen.getByText(item.label)).toBeTruthy();
    }
  });

  it('calls onOpen with item id when icon clicked', async () => {
    const onOpen = vi.fn();
    render(<Dock {...defaults} onOpen={onOpen} />);
    await userEvent.click(screen.getByLabelText('Open Chat'));
    expect(onOpen).toHaveBeenCalledWith('chat');
  });

  it('shows active dot when window is open', () => {
    const { container } = render(
      <Dock {...defaults} openWindows={new Set(['chat'])} />,
    );
    const dots = container.querySelectorAll('.dock-icon-dot.active');
    expect(dots.length).toBe(1);
  });

  it('does not show active dot for closed windows', () => {
    const { container } = render(
      <Dock {...defaults} openWindows={new Set<string>()} />,
    );
    const dots = container.querySelectorAll('.dock-icon-dot.active');
    expect(dots.length).toBe(0);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/dashboard/ui/src/components/__tests__/Dock.test.tsx 2>&1 | tail -10`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/dashboard/ui/src/components/Dock.tsx`:

```tsx
export interface DockItem {
  id: string;
  label: string;
  icon: string;
}

export interface DockProps {
  items: DockItem[];
  openWindows: Set<string>;
  onOpen: (id: string) => void;
}

export function Dock({ items, openWindows, onOpen }: DockProps) {
  return (
    <div className="dock-container">
      {items.map(item => (
        <div key={item.id} className="dock-icon-wrapper">
          <div className="dock-tooltip">{item.label}</div>
          <button
            type="button"
            className="dock-icon"
            aria-label={`Open ${item.label}`}
            onClick={() => onOpen(item.id)}
          >
            {item.icon}
          </button>
          <div className={`dock-icon-dot ${openWindows.has(item.id) ? 'active' : ''}`} />
        </div>
      ))}
    </div>
  );
}
```

**Step 4: Run the test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/dashboard/ui/src/components/__tests__/Dock.test.tsx 2>&1 | tail -15`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add packages/dashboard/ui/src/components/Dock.tsx packages/dashboard/ui/src/components/__tests__/Dock.test.tsx
git commit -m "feat(dashboard): add Dock component with icons, tooltips, and indicators"
```

---

## Task 5: DesktopShell Component

The main shell that replaces `<Layout>`, composing TopBar + WindowManager + Dock.

**Files:**
- Create: `packages/dashboard/ui/src/components/DesktopShell.tsx`
- Test: `packages/dashboard/ui/src/components/__tests__/DesktopShell.test.tsx`

**Step 1: Write the failing test**

Create `packages/dashboard/ui/src/components/__tests__/DesktopShell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DesktopShell } from '../DesktopShell.js';

// Mock the api module
vi.mock('../../api.js', () => ({
  api: {
    getSetupStatus: vi.fn().mockResolvedValue({ vaultUnlocked: true, needsSetup: false, agentName: 'Luna' }),
    getStatus: vi.fn().mockResolvedValue({ data: {} }),
    getSessions: vi.fn().mockResolvedValue({ data: [] }),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <DesktopShell />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('DesktopShell', () => {
  it('renders the desktop shell container', async () => {
    const { container } = renderShell();
    // Wait for setup check to complete
    await screen.findByText('Luna');
    expect(container.querySelector('.desktop-shell')).toBeTruthy();
  });

  it('renders the top bar with agent name', async () => {
    renderShell();
    expect(await screen.findByText('Luna')).toBeTruthy();
  });

  it('renders the dock with app icons', async () => {
    renderShell();
    await screen.findByText('Luna');
    expect(screen.getByLabelText('Open Chat')).toBeTruthy();
    expect(screen.getByLabelText('Open Mission Control')).toBeTruthy();
  });

  it('opens a window when dock icon is clicked', async () => {
    const { container } = renderShell();
    await screen.findByText('Luna');
    await userEvent.click(screen.getByLabelText('Open Chat'));
    expect(container.querySelector('.window')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
  });

  it('shows active dot on dock icon when window is open', async () => {
    const { container } = renderShell();
    await screen.findByText('Luna');
    await userEvent.click(screen.getByLabelText('Open Chat'));
    const dots = container.querySelectorAll('.dock-icon-dot.active');
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/dashboard/ui/src/components/__tests__/DesktopShell.test.tsx 2>&1 | tail -10`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/dashboard/ui/src/components/DesktopShell.tsx`:

```tsx
import { useState, useEffect, type ReactElement } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useWindowState } from '../hooks/useWindowState.js';
import { Window } from './Window.js';
import { Dock, type DockItem } from './Dock.js';

/* ── Static page imports (same as App.tsx) ─────────────────────────────── */
import { Overview } from '../pages/Overview.js';
import { Chat } from '../pages/Chat.js';
import { Behaviors } from '../pages/Behaviors.js';
import { Webhooks } from '../pages/Webhooks.js';
import { PersonalityEditor } from '../pages/settings/PersonalityEditor.js';
import { SettingsProvider } from '../pages/settings/Provider.js';
import { SettingsChannels } from '../pages/settings/Channels.js';
import { SettingsSecurity } from '../pages/settings/Security.js';
import { SettingsAppearance } from '../pages/settings/Appearance.js';
import { SettingsConnections } from '../pages/SettingsConnections.js';
import { SettingsAmbient } from '../pages/SettingsAmbient.js';
import { SettingsArchitect } from '../pages/settings/Architect.js';
import { SettingsNotifications } from '../pages/SettingsNotifications.js';
import { AuditLog } from '../pages/AuditLog.js';

/* ── App registry: maps dock icon id → page component + metadata ─────── */

interface AppEntry {
  id: string;
  label: string;
  icon: string;
  component: () => ReactElement;
  defaultWidth?: number;
  defaultHeight?: number;
}

const APPS: AppEntry[] = [
  { id: 'chat', label: 'Chat', icon: '\u{1F4AC}', component: () => <Chat />, defaultWidth: 480, defaultHeight: 600 },
  { id: 'overview', label: 'Mission Control', icon: '\u{1F3AF}', component: () => <Overview /> },
  { id: 'architect', label: 'The Architect', icon: '\u{1F9E0}', component: () => <SettingsArchitect /> },
  { id: 'behaviors', label: 'Behaviors', icon: '\u{1F9E9}', component: () => <Behaviors /> },
  { id: 'webhooks', label: 'Webhooks', icon: '\u{1F517}', component: () => <Webhooks /> },
  { id: 'personality', label: 'Personality', icon: '\u{1F3AD}', component: () => <PersonalityEditor /> },
  { id: 'provider', label: 'Provider', icon: '\u{1F50C}', component: () => <SettingsProvider /> },
  { id: 'channels', label: 'Channels', icon: '\u{1F4E1}', component: () => <SettingsChannels /> },
  { id: 'connections', label: 'Connections', icon: '\u{1F310}', component: () => <SettingsConnections /> },
  { id: 'ambient', label: 'Ambient', icon: '\u{1F30A}', component: () => <SettingsAmbient /> },
  { id: 'appearance', label: 'Appearance', icon: '\u{1F3A8}', component: () => <SettingsAppearance /> },
  { id: 'notifications', label: 'Notifications', icon: '\u{1F514}', component: () => <SettingsNotifications /> },
  { id: 'security', label: 'Security', icon: '\u{1F6E1}\uFE0F', component: () => <SettingsSecurity /> },
  { id: 'audit', label: 'Audit Log', icon: '\u{1F4CB}', component: () => <AuditLog /> },
];

const DOCK_ITEMS: DockItem[] = APPS.map(a => ({ id: a.id, label: a.label, icon: a.icon }));
const APP_MAP = new Map(APPS.map(a => [a.id, a]));

/* ── Component ─────────────────────────────────────────────────────────── */

export function DesktopShell() {
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [agentName, setAgentName] = useState('Auxiora');
  const navigate = useNavigate();

  const {
    windows, activeWindowId,
    openWindow, closeWindow, focusWindow,
    moveWindow, resizeWindow,
    toggleMinimize, toggleMaximize,
  } = useWindowState();

  /* ── Setup / vault check (ported from Layout.tsx) ──────────────────── */
  useEffect(() => {
    api.getSetupStatus()
      .then(status => {
        if (status.agentName) setAgentName(status.agentName);
        if (status.needsSetup) {
          navigate('/setup', { replace: true });
        } else if (!status.vaultUnlocked) {
          navigate('/unlock', { replace: true });
        } else {
          setReady(true);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  if (checking) return null;

  const openWindowIds = new Set(Array.from(windows.keys()));

  function handleDockOpen(id: string) {
    const app = APP_MAP.get(id);
    if (!app) return;
    openWindow(id, app.label);
  }

  return (
    <div className="desktop-shell">
      {/* Background */}
      <div className="desktop-bg" />

      {/* Top bar */}
      <div className="topbar">
        <div className="topbar-left">
          <span>{agentName}</span>
        </div>
        <div className="topbar-center">
          {activeWindowId && APP_MAP.get(activeWindowId)?.label}
        </div>
        <div className="topbar-right">
          <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Windows */}
      <div style={{ position: 'relative', flex: 1 }}>
        {Array.from(windows.values()).map(w => {
          const app = APP_MAP.get(w.id);
          if (!app) return null;
          return (
            <Window
              key={w.id}
              id={w.id}
              title={w.title}
              x={w.x}
              y={w.y}
              width={w.width}
              height={w.height}
              zIndex={w.zIndex}
              minimized={w.minimized}
              maximized={w.maximized}
              focused={activeWindowId === w.id}
              onClose={() => closeWindow(w.id)}
              onFocus={() => focusWindow(w.id)}
              onMinimize={() => toggleMinimize(w.id)}
              onMaximize={() => toggleMaximize(w.id)}
              onMove={(x, y) => moveWindow(w.id, x, y)}
              onResize={(width, height) => resizeWindow(w.id, width, height)}
            >
              {app.component()}
            </Window>
          );
        })}
      </div>

      {/* Dock */}
      <Dock
        items={DOCK_ITEMS}
        openWindows={openWindowIds}
        onOpen={handleDockOpen}
      />
    </div>
  );
}
```

**Step 4: Run the test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/dashboard/ui/src/components/__tests__/DesktopShell.test.tsx 2>&1 | tail -15`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add packages/dashboard/ui/src/components/DesktopShell.tsx packages/dashboard/ui/src/components/__tests__/DesktopShell.test.tsx
git commit -m "feat(dashboard): add DesktopShell component composing TopBar + Windows + Dock"
```

---

## Task 6: Wire DesktopShell into App Router

Replace `<Layout>` with `<DesktopShell>` as the wrapper for authenticated routes.

**Files:**
- Modify: `packages/dashboard/ui/src/App.tsx:1-65`

**Step 1: Update App.tsx**

Replace the `<Layout>` import and route wrapper with `<DesktopShell>`. The key change: instead of nesting `<Route>` children inside `<Layout>` (which uses `<Outlet>`), we wrap all authenticated routes inside `<DesktopShell>` which manages its own windows. We still need a catch-all route inside the shell to handle direct URL navigation.

In `packages/dashboard/ui/src/App.tsx`, change line 2:

```typescript
// Old:
import { Layout } from './components/Layout';
// New:
import { DesktopShell } from './components/DesktopShell';
```

And change line 45:

```tsx
// Old:
<Route element={<Layout />}>
// New:
<Route element={<DesktopShell />}>
```

**Important:** The DesktopShell does NOT use `<Outlet>` — it renders page components inside windows directly. However, keeping the nested `<Route>` structure means React Router still handles URL matching. The DesktopShell just ignores the Outlet (it has its own rendering). This is fine for Phase 1; in Phase 2, we can wire URL ↔ window sync.

**Step 2: Verify existing tests still pass**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/dashboard/ui/ 2>&1 | tail -20`
Expected: All existing tests pass. The Layout tests (if any) may need updating — check for any `Layout` imports in test files first.

**Step 3: Verify UI build succeeds**

Run: `cd /home/ai-work/git/auxiora && pnpm --filter dashboard run build:ui 2>&1 | tail -10`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/dashboard/ui/src/App.tsx
git commit -m "feat(dashboard): wire DesktopShell into router, replacing Layout"
```

---

## Task 7: Dock Magnification Animation

Add the macOS-style hover magnification effect to dock icons using CSS + a small JS handler.

**Files:**
- Modify: `packages/dashboard/ui/src/components/Dock.tsx`
- Modify: `packages/dashboard/ui/src/styles/glass.css` (dock animation section)

**Step 1: Add magnification CSS to glass.css**

Append to the dock section in `packages/dashboard/ui/src/styles/glass.css`:

```css
/* ── Dock magnification ───────────────────────────────────────────────────── */

.dock-icon-wrapper {
  transition: transform 150ms ease;
}

/* Magnification classes applied by JS on hover */
.dock-icon-wrapper.mag-center { transform: scale(1.5) translateY(-8px); }
.dock-icon-wrapper.mag-near   { transform: scale(1.25) translateY(-4px); }
.dock-icon-wrapper.mag-far    { transform: scale(1.1) translateY(-2px); }
```

**Step 2: Add magnification handler to Dock.tsx**

In `packages/dashboard/ui/src/components/Dock.tsx`, add a `handleMouseMove` callback on the dock container that reads mouse position and applies `.mag-center`, `.mag-near`, `.mag-far` classes to icon wrappers based on distance from the hovered icon. Also add `handleMouseLeave` to clear all magnification classes.

Add `useRef` and `useCallback` imports, and a `ref` on the dock container:

```tsx
import { useRef, useCallback } from 'react';

export function Dock({ items, openWindows, onOpen }: DockProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const wrappers = container.querySelectorAll('.dock-icon-wrapper');
    const mouseX = e.clientX;

    wrappers.forEach(wrapper => {
      const rect = (wrapper as HTMLElement).getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const dist = Math.abs(mouseX - centerX);

      wrapper.classList.remove('mag-center', 'mag-near', 'mag-far');
      if (dist < 25) wrapper.classList.add('mag-center');
      else if (dist < 60) wrapper.classList.add('mag-near');
      else if (dist < 100) wrapper.classList.add('mag-far');
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll('.dock-icon-wrapper').forEach(w => {
      w.classList.remove('mag-center', 'mag-near', 'mag-far');
    });
  }, []);

  return (
    <div
      className="dock-container"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* ... existing icon rendering ... */}
    </div>
  );
}
```

**Step 3: Verify tests still pass**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/dashboard/ui/src/components/__tests__/Dock.test.tsx 2>&1 | tail -10`
Expected: All 5 tests PASS (magnification is visual-only, doesn't break existing assertions)

**Step 4: Build check**

Run: `cd /home/ai-work/git/auxiora && pnpm --filter dashboard run build:ui 2>&1 | tail -10`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add packages/dashboard/ui/src/components/Dock.tsx packages/dashboard/ui/src/styles/glass.css
git commit -m "feat(dashboard): add macOS-style dock magnification on hover"
```

---

## Task 8: Full Test Suite & Build Verification

Run the entire test suite and build to ensure nothing is broken.

**Step 1: Run all dashboard tests**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/dashboard/ 2>&1 | tail -30`
Expected: All tests pass (existing + new).

**Step 2: Run full project build**

Run: `cd /home/ai-work/git/auxiora && pnpm -r build 2>&1 | tail -20`
Expected: All packages build successfully.

**Step 3: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && pnpm -r test 2>&1 | tail -30`
Expected: All 2,700+ tests pass.

**Step 4: Commit any fixups if needed**

If any tests or builds fail, fix them and commit with:

```bash
git commit -m "fix(dashboard): resolve test/build issues from desktop shell integration"
```

---

## Summary

| Task | Component | New Files | Tests |
|------|-----------|-----------|-------|
| 1 | Glass CSS | glass.css | build check |
| 2 | useWindowState | hook + test | 11 tests |
| 3 | Window | component + test | 12 tests |
| 4 | Dock | component + test | 5 tests |
| 5 | DesktopShell | component + test | 5 tests |
| 6 | Router wiring | modify App.tsx | existing tests |
| 7 | Dock magnification | modify Dock + CSS | existing tests |
| 8 | Full verification | — | full suite |

Total: ~850 lines new TS/TSX, ~300 lines new CSS, 33+ new tests.
