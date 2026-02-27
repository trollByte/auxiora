import { useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'auxiora-windows';
const GRID_KEY = 'auxiora-snap-grid';
const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 500;
const CASCADE_OFFSET = 30;
/** Minimum pixels of the title bar that must stay visible on-screen */
const TITLE_BAR_HEIGHT = 36;
const VISIBLE_MARGIN = 100;
const GRID_SIZE = 40;

/** Round a value to the nearest grid increment */
function snapValue(v: number, grid: number): number {
  return Math.round(v / grid) * grid;
}

/** Clamp x/y so the window title bar stays reachable */
function clampPosition(x: number, y: number, width: number, _height: number): { x: number; y: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
  return {
    x: Math.max(VISIBLE_MARGIN - width, Math.min(x, vw - VISIBLE_MARGIN)),
    y: Math.max(0, Math.min(y, vh - TITLE_BAR_HEIGHT)),
  };
}

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
    const map = new Map(Object.entries(obj));
    // Clamp any persisted off-screen positions back into the viewport
    for (const [id, w] of map) {
      const clamped = clampPosition(w.x, w.y, w.width, w.height);
      if (clamped.x !== w.x || clamped.y !== w.y) {
        map.set(id, { ...w, x: clamped.x, y: clamped.y });
      }
    }
    return map;
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

function loadSnapEnabled(): boolean {
  try {
    return localStorage.getItem(GRID_KEY) === '1';
  } catch {
    return false;
  }
}

export function useWindowState() {
  const [windows, setWindows] = useState<Map<string, WindowState>>(loadWindows);
  const [snapEnabled, setSnapEnabled] = useState(loadSnapEnabled);

  const update = useCallback((fn: (prev: Map<string, WindowState>) => Map<string, WindowState>) => {
    setWindows(prev => {
      const next = fn(prev);
      saveWindows(next);
      return next;
    });
  }, []);

  const openWindow = useCallback((id: string, title: string, preferredWidth?: number, preferredHeight?: number) => {
    update(prev => {
      if (prev.has(id)) {
        const next = new Map(prev);
        const w = next.get(id)!;
        next.set(id, { ...w, zIndex: nextZIndex(next), minimized: false });
        return next;
      }
      const next = new Map(prev);
      const cascadeCount = next.size;
      const w = Math.max(MIN_WIDTH, preferredWidth ?? DEFAULT_WIDTH);
      const h = Math.max(MIN_HEIGHT, preferredHeight ?? DEFAULT_HEIGHT);
      const pos = clampPosition(
        80 + (cascadeCount % 8) * CASCADE_OFFSET,
        60 + (cascadeCount % 8) * CASCADE_OFFSET,
        w, h,
      );
      next.set(id, {
        id,
        title,
        x: pos.x,
        y: pos.y,
        width: w,
        height: h,
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

  const toggleSnap = useCallback(() => {
    setSnapEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem(GRID_KEY, next ? '1' : '0'); } catch { /* */ }
      return next;
    });
  }, []);

  const moveWindow = useCallback((id: string, x: number, y: number) => {
    update(prev => {
      const w = prev.get(id);
      if (!w) return prev;
      const sx = snapEnabled ? snapValue(x, GRID_SIZE) : x;
      const sy = snapEnabled ? snapValue(y, GRID_SIZE) : y;
      const clamped = clampPosition(sx, sy, w.width, w.height);
      const next = new Map(prev);
      next.set(id, { ...w, x: clamped.x, y: clamped.y });
      return next;
    });
  }, [update, snapEnabled]);

  const resizeWindow = useCallback((id: string, width: number, height: number) => {
    update(prev => {
      const w = prev.get(id);
      if (!w) return prev;
      const sw = snapEnabled ? snapValue(Math.max(MIN_WIDTH, width), GRID_SIZE) : Math.max(MIN_WIDTH, width);
      const sh = snapEnabled ? snapValue(Math.max(MIN_HEIGHT, height), GRID_SIZE) : Math.max(MIN_HEIGHT, height);
      const next = new Map(prev);
      next.set(id, { ...w, width: sw, height: sh });
      return next;
    });
  }, [update, snapEnabled]);

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
    snapEnabled,
    gridSize: GRID_SIZE,
    openWindow,
    closeWindow,
    focusWindow,
    moveWindow,
    resizeWindow,
    toggleMinimize,
    toggleMaximize,
    toggleSnap,
  };
}
