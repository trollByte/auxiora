import { describe, it, expect, vi } from 'vitest';
import { ArchitectBridge } from '../architect-bridge.js';
import { ArchitectAwarenessCollector } from '../architect-awareness-collector.js';

function mockArchitect() {
  return {
    generatePrompt: vi.fn().mockReturnValue({
      basePrompt: 'base',
      contextModifier: '## Context\nSecurity mode',
      fullPrompt: 'base\n\n## Context\nSecurity mode',
      activeTraits: [],
      detectedContext: {
        domain: 'security_review',
        emotionalRegister: 'neutral',
        stakes: 'high',
        complexity: 'moderate',
        detectionConfidence: 0.85,
        conversationTheme: 'security_review',
      },
      emotionalTrajectory: 'stable',
    }),
    getTraitMix: vi.fn().mockReturnValue({ warmth: 0.5 }),
    getConversationSummary: vi.fn().mockReturnValue({
      theme: 'security_review',
      messageCount: 3,
      domainDistribution: {},
      currentStreak: { domain: 'security_review', count: 3 },
    }),
  };
}

function mockVault() {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => store.get(key)),
    set: vi.fn((key: string, value: string) => { store.set(key, value); }),
    has: vi.fn((key: string) => store.has(key)),
    store, // expose for test setup
  };
}

describe('ArchitectBridge', () => {
  it('should call architect.generatePrompt and return output', () => {
    const architect = mockArchitect();
    const bridge = new ArchitectBridge(architect as any, new ArchitectAwarenessCollector(), mockVault() as any);
    const result = bridge.processMessage('check the firewall', 'chat-1');
    expect(architect.generatePrompt).toHaveBeenCalledWith('check the firewall');
    expect(result.detectedContext.domain).toBe('security_review');
  });

  it('should persist conversation state to vault', () => {
    const architect = mockArchitect();
    const vault = mockVault();
    const bridge = new ArchitectBridge(architect as any, new ArchitectAwarenessCollector(), vault as any);
    bridge.processMessage('msg1', 'chat-42');
    expect(vault.set).toHaveBeenCalledWith('architect:chat:chat-42', expect.any(String));
  });

  it('should fire escalation callback when alert present', () => {
    const architect = mockArchitect();
    architect.generatePrompt.mockReturnValueOnce({
      basePrompt: 'base', contextModifier: 'ctx', fullPrompt: 'full', activeTraits: [],
      detectedContext: { domain: 'crisis_management', emotionalRegister: 'stressed', stakes: 'critical', complexity: 'high', detectionConfidence: 0.95 },
      emotionalTrajectory: 'escalating',
      escalationAlert: 'User is in distress',
    });
    const onEscalation = vi.fn();
    const bridge = new ArchitectBridge(architect as any, new ArchitectAwarenessCollector(), mockVault() as any, { onEscalation });
    bridge.processMessage('everything is on fire', 'chat-1');
    expect(onEscalation).toHaveBeenCalledWith('User is in distress', expect.objectContaining({ domain: 'crisis_management' }));
  });

  it('should NOT fire escalation callback when no alert', () => {
    const architect = mockArchitect();
    const onEscalation = vi.fn();
    const bridge = new ArchitectBridge(architect as any, new ArchitectAwarenessCollector(), mockVault() as any, { onEscalation });
    bridge.processMessage('normal message', 'chat-1');
    expect(onEscalation).not.toHaveBeenCalled();
  });

  it('should read vault on first message per chat', () => {
    const architect = mockArchitect();
    const vault = mockVault();
    vault.store.set('architect:chat:chat-99', JSON.stringify({ theme: 'security_review', messageCount: 3, lastUpdated: Date.now() }));
    const bridge = new ArchitectBridge(architect as any, new ArchitectAwarenessCollector(), vault as any);
    bridge.processMessage('continue', 'chat-99');
    expect(vault.get).toHaveBeenCalledWith('architect:chat:chat-99');
    // Second message should NOT re-read
    bridge.processMessage('another', 'chat-99');
    expect(vault.get).toHaveBeenCalledTimes(1);
  });
});
