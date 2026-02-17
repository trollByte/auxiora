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
