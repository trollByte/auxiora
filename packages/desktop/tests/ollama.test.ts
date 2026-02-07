import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaBundleManager } from '../src/ollama.js';
import type { TauriBridge } from '../src/app.js';

function mockBridge(): TauriBridge {
  return {
    showWindow: vi.fn().mockResolvedValue(undefined),
    hideWindow: vi.fn().mockResolvedValue(undefined),
    setWindowTitle: vi.fn().mockResolvedValue(undefined),
    showTray: vi.fn().mockResolvedValue(undefined),
    hideTray: vi.fn().mockResolvedValue(undefined),
    setTrayBadge: vi.fn().mockResolvedValue(undefined),
    sendQuickReply: vi.fn().mockResolvedValue(undefined),
    registerHotkey: vi.fn().mockResolvedValue(undefined),
    unregisterHotkey: vi.fn().mockResolvedValue(undefined),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    checkForUpdate: vi.fn().mockResolvedValue({ version: '1.0.0', available: false }),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    promptRestart: vi.fn().mockResolvedValue(false),
    rollbackUpdate: vi.fn().mockResolvedValue(undefined),
    detectOllama: vi.fn().mockResolvedValue(true),
    startOllama: vi.fn().mockResolvedValue(undefined),
    stopOllama: vi.fn().mockResolvedValue(undefined),
    listOllamaModels: vi.fn().mockResolvedValue(['llama3', 'mistral']),
    setAutoStart: vi.fn().mockResolvedValue(undefined),
  };
}

describe('OllamaBundleManager', () => {
  let ollama: OllamaBundleManager;
  let bridge: TauriBridge;

  beforeEach(() => {
    bridge = mockBridge();
    ollama = new OllamaBundleManager(bridge, 11434);
  });

  it('should detect Ollama', async () => {
    const found = await ollama.detect();
    expect(found).toBe(true);
    expect(bridge.detectOllama).toHaveBeenCalled();
  });

  it('should start Ollama', async () => {
    await ollama.start();
    expect(ollama.getStatus()).toBe('running');
    expect(bridge.startOllama).toHaveBeenCalledWith(11434);
  });

  it('should reject starting when already running', async () => {
    await ollama.start();
    await expect(ollama.start()).rejects.toThrow('already running');
  });

  it('should stop Ollama', async () => {
    await ollama.start();
    await ollama.stop();
    expect(ollama.getStatus()).toBe('stopped');
    expect(bridge.stopOllama).toHaveBeenCalled();
  });

  it('should no-op when stopping already stopped Ollama', async () => {
    await ollama.stop();
    expect(bridge.stopOllama).not.toHaveBeenCalled();
  });

  it('should list models when running', async () => {
    await ollama.start();
    const models = await ollama.listModels();
    expect(models).toEqual(['llama3', 'mistral']);
  });

  it('should return empty models when not running', async () => {
    const models = await ollama.listModels();
    expect(models).toEqual([]);
  });

  it('should set error status on start failure', async () => {
    (bridge.startOllama as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('port in use'));
    await expect(ollama.start()).rejects.toThrow('port in use');
    expect(ollama.getStatus()).toBe('error');
  });

  it('should report port', () => {
    expect(ollama.getPort()).toBe(11434);
  });
});
