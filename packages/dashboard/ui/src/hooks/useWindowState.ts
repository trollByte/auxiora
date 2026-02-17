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
