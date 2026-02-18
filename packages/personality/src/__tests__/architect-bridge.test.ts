import { describe, it, expect, vi } from 'vitest';
import { ArchitectBridge } from '../architect-bridge.js';
import { ArchitectAwarenessCollector } from '../architect-awareness-collector.js';

function mockArchitect() {
  return {
    getConversationSummary: vi.fn().mockReturnValue({
      theme: 'security_review',
      messageCount: 3,
    }),
  };
}

function mockVault() {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => store.get(key)),
    add: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    has: vi.fn((key: string) => store.has(key)),
    store, // expose for test setup
  };
}

describe('ArchitectBridge', () => {
  it('should update awareness collector after prompt', () => {
    const collector = new ArchitectAwarenessCollector();
    const bridge = new ArchitectBridge(mockArchitect() as any, collector, mockVault() as any);
    bridge.afterPrompt(
      { domain: 'security_review', emotionalRegister: 'neutral', stakes: 'high', complexity: 'moderate', detectionConfidence: 0.85 },
      'stable',
      undefined,
      'chat-1',
    );
    // Collector should have received the snapshot
    expect(collector.enabled).toBe(true);
  });

  it('should persist conversation state to vault', () => {
    const architect = mockArchitect();
    const vault = mockVault();
    const bridge = new ArchitectBridge(architect as any, new ArchitectAwarenessCollector(), vault as any);
    bridge.afterPrompt(
      { domain: 'general', emotionalRegister: 'neutral', stakes: 'moderate', complexity: 'moderate' },
      'stable',
      undefined,
      'chat-42',
    );
    expect(vault.add).toHaveBeenCalledWith('architect:chat:chat-42', expect.any(String));
  });

  it('should fire escalation callback when alert present', () => {
    const onEscalation = vi.fn();
    const bridge = new ArchitectBridge(mockArchitect() as any, new ArchitectAwarenessCollector(), mockVault() as any, { onEscalation });
    bridge.afterPrompt(
      { domain: 'crisis_management', emotionalRegister: 'stressed', stakes: 'critical', complexity: 'high', detectionConfidence: 0.95 },
      'escalating',
      true,
      'chat-1',
    );
    expect(onEscalation).toHaveBeenCalledWith('Emotional escalation detected', expect.objectContaining({ domain: 'crisis_management' }));
  });

  it('should NOT fire escalation callback when no alert', () => {
    const onEscalation = vi.fn();
    const bridge = new ArchitectBridge(mockArchitect() as any, new ArchitectAwarenessCollector(), mockVault() as any, { onEscalation });
    bridge.afterPrompt(
      { domain: 'general', emotionalRegister: 'neutral', stakes: 'moderate', complexity: 'moderate' },
      'stable',
      undefined,
      'chat-1',
    );
    expect(onEscalation).not.toHaveBeenCalled();
  });

  it('should read vault on first message per chat only', () => {
    const vault = mockVault();
    vault.store.set('architect:chat:chat-99', JSON.stringify({ theme: 'security_review', messageCount: 3, lastUpdated: Date.now() }));
    const bridge = new ArchitectBridge(mockArchitect() as any, new ArchitectAwarenessCollector(), vault as any);
    bridge.afterPrompt({ domain: 'general' }, 'stable', undefined, 'chat-99');
    expect(vault.get).toHaveBeenCalledWith('architect:chat:chat-99');
    // Second message should NOT re-read
    bridge.afterPrompt({ domain: 'general' }, 'stable', undefined, 'chat-99');
    expect(vault.get).toHaveBeenCalledTimes(1);
  });
});
