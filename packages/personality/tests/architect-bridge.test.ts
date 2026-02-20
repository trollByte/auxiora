import { describe, it, expect, vi } from 'vitest';
import { ArchitectBridge } from '../src/architect-bridge.js';
import { ArchitectAwarenessCollector } from '../src/architect-awareness-collector.js';

function createMockArchitect() {
  return {
    getConversationSummary: vi.fn().mockReturnValue({ theme: 'testing', messageCount: 5 }),
    loadConversationState: vi.fn(),
  };
}

function createMockVault() {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => store.get(key)),
    add: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    has: vi.fn((key: string) => store.has(key)),
    _store: store,
  };
}

describe('ArchitectBridge', () => {
  describe('maybeRestore', () => {
    it('applies stored conversation state on first message per chat', () => {
      const architect = createMockArchitect();
      const vault = createMockVault();
      const collector = new ArchitectAwarenessCollector();
      const bridge = new ArchitectBridge(architect, collector, vault);

      vault._store.set('architect:chat:chat-1', JSON.stringify({
        theme: 'technology',
        messageCount: 10,
        lastUpdated: Date.now(),
      }));

      bridge.afterPrompt(
        { domain: 'general', emotionalRegister: 'neutral', stakes: 'moderate', complexity: 'moderate' },
        'stable',
        false,
        'chat-1',
      );

      expect(vault.get).toHaveBeenCalledWith('architect:chat:chat-1');
      expect(architect.loadConversationState).toHaveBeenCalledWith({
        theme: 'technology',
        messageCount: 10,
      });
    });

    it('does not restore on subsequent messages for same chat', () => {
      const architect = createMockArchitect();
      const vault = createMockVault();
      const collector = new ArchitectAwarenessCollector();
      const bridge = new ArchitectBridge(architect, collector, vault);

      vault._store.set('architect:chat:chat-1', JSON.stringify({ theme: 'tech', messageCount: 3, lastUpdated: Date.now() }));

      bridge.afterPrompt({ domain: 'general' }, 'stable', false, 'chat-1');
      bridge.afterPrompt({ domain: 'general' }, 'stable', false, 'chat-1');

      expect(architect.loadConversationState).toHaveBeenCalledOnce();
    });

    it('handles corrupt vault data gracefully', () => {
      const architect = createMockArchitect();
      const vault = createMockVault();
      const collector = new ArchitectAwarenessCollector();
      const bridge = new ArchitectBridge(architect, collector, vault);

      vault._store.set('architect:chat:bad', 'not-valid-json{{{');

      // Should not throw
      bridge.afterPrompt({ domain: 'general' }, 'stable', false, 'bad');
      expect(architect.loadConversationState).not.toHaveBeenCalled();
    });

    it('handles missing vault entry gracefully', () => {
      const architect = createMockArchitect();
      const vault = createMockVault();
      const collector = new ArchitectAwarenessCollector();
      const bridge = new ArchitectBridge(architect, collector, vault);

      // No vault entry for this chat
      bridge.afterPrompt({ domain: 'general' }, 'stable', false, 'empty-chat');
      expect(architect.loadConversationState).not.toHaveBeenCalled();
    });
  });

  describe('afterPrompt', () => {
    it('feeds snapshot to awareness collector', () => {
      const architect = createMockArchitect();
      const vault = createMockVault();
      const collector = new ArchitectAwarenessCollector();
      const bridge = new ArchitectBridge(architect, collector, vault);

      bridge.afterPrompt(
        { domain: 'technology', emotionalRegister: 'enthusiastic', stakes: 'high', complexity: 'complex', detectionConfidence: 0.9 },
        'escalating',
        true,
        'chat-2',
      );

      // Verify collector was updated (it should have a snapshot)
      // We can check by calling collect and seeing signals
    });

    it('persists conversation state to vault', () => {
      const architect = createMockArchitect();
      const vault = createMockVault();
      const collector = new ArchitectAwarenessCollector();
      const bridge = new ArchitectBridge(architect, collector, vault);

      bridge.afterPrompt({ domain: 'general' }, 'stable', false, 'chat-3');

      expect(vault.add).toHaveBeenCalled();
      const callArgs = vault.add.mock.calls[0];
      expect(callArgs[0]).toBe('architect:chat:chat-3');
      const parsed = JSON.parse(callArgs[1] as string);
      expect(parsed).toHaveProperty('theme');
      expect(parsed).toHaveProperty('messageCount');
      expect(parsed).toHaveProperty('lastUpdated');
    });

    it('fires escalation callback when alert is present', () => {
      const architect = createMockArchitect();
      const vault = createMockVault();
      const collector = new ArchitectAwarenessCollector();
      const onEscalation = vi.fn();
      const bridge = new ArchitectBridge(architect, collector, vault, { onEscalation });

      bridge.afterPrompt(
        { domain: 'personal', emotionalRegister: 'distressed', stakes: 'high', complexity: 'moderate' },
        'escalating',
        true,
        'chat-4',
      );

      expect(onEscalation).toHaveBeenCalledOnce();
      expect(onEscalation).toHaveBeenCalledWith(
        'Emotional escalation detected',
        expect.objectContaining({ domain: 'personal' }),
      );
    });
  });
});
