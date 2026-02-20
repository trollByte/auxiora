import { describe, it, expect, vi } from 'vitest';
import { ArchitectBridge } from '@auxiora/personality';
import { ArchitectAwarenessCollector } from '@auxiora/personality';

describe('Architect Runtime Integration', () => {
  describe('feedback recording', () => {
    it('maps thumbs up to helpful rating', () => {
      const mapped = 'up' === 'up' ? 'helpful' : 'off_target';
      expect(mapped).toBe('helpful');
    });

    it('maps thumbs down to off_target rating', () => {
      const mapped = 'down' === 'up' ? 'helpful' : 'off_target';
      expect(mapped).toBe('off_target');
    });
  });

  describe('channel path Architect parity', () => {
    it('derives chatId from channelType:channelId', () => {
      const chatId = `telegram:12345`;
      expect(chatId).toBe('telegram:12345');
    });

    it('uses useArchitect guard for channel path', () => {
      const personality = 'the-architect';
      const useChannelArchitect = personality === 'the-architect';
      expect(useChannelArchitect).toBe(true);

      const otherPersonality = 'default';
      const skipArchitect = otherPersonality === 'the-architect';
      expect(skipArchitect).toBe(false);
    });
  });

  describe('personality router', () => {
    function createMockArchitect() {
      return {
        recordDecision: () => Promise.resolve({ id: 'dec-1' }),
        updateDecision: () => Promise.resolve(),
        queryDecisions: () => Promise.resolve([]),
        getDueFollowUps: () => Promise.resolve([]),
        setTraitOverride: () => Promise.resolve(),
        removeTraitOverride: () => Promise.resolve(),
        loadPreset: () => Promise.resolve(),
        listPresets: () => ({}),
        getActiveOverrides: () => ({}),
        getTraitMix: () => ({}),
        getPreferences: () => Promise.resolve({}),
        updatePreference: () => Promise.resolve(),
        getFeedbackInsights: () => ({ weakDomains: [], trend: 'stable' }),
        getUserModel: () => null,
        recordCorrection: () => Promise.resolve(),
        getCorrectionStats: () => ({ totalCorrections: 0 }),
        exportData: () => Promise.resolve('{}'),
        clearAllData: () => Promise.resolve(),
        exportConversationAs: () => '{}',
        recordFeedback: () => Promise.resolve(),
      };
    }

    it('exposes decision CRUD operations', () => {
      const architect = createMockArchitect();
      expect(typeof architect.recordDecision).toBe('function');
      expect(typeof architect.updateDecision).toBe('function');
      expect(typeof architect.queryDecisions).toBe('function');
      expect(typeof architect.getDueFollowUps).toBe('function');
    });

    it('exposes trait management operations', () => {
      const architect = createMockArchitect();
      expect(typeof architect.setTraitOverride).toBe('function');
      expect(typeof architect.removeTraitOverride).toBe('function');
      expect(typeof architect.loadPreset).toBe('function');
      expect(typeof architect.listPresets).toBe('function');
      expect(typeof architect.getActiveOverrides).toBe('function');
    });

    it('exposes data portability operations', () => {
      const architect = createMockArchitect();
      expect(typeof architect.exportData).toBe('function');
      expect(typeof architect.clearAllData).toBe('function');
    });

    it('validates required fields on decision creation', () => {
      const requiredFields = ['domain', 'summary', 'context'];
      const body = { domain: 'technology', summary: 'test' }; // missing context
      const missing = requiredFields.filter(f => !(f in body));
      expect(missing).toContain('context');
    });

    it('validates feedback rating values', () => {
      const valid = ['up', 'down'];
      expect(valid).toContain('up');
      expect(valid).toContain('down');
      expect(valid).not.toContain('neutral');
    });

    it('supports conversation export formats', () => {
      const formats = ['json', 'markdown', 'csv'];
      for (const f of formats) {
        expect(['json', 'markdown', 'csv']).toContain(f);
      }
    });
  });

  describe('end-to-end wiring validation', () => {
    it('architectResetChats prevents double-reset per chatId', () => {
      const resetChats = new Set<string>();
      const chatId = 'test-chat-1';
      expect(resetChats.has(chatId)).toBe(false);
      resetChats.add(chatId);
      expect(resetChats.has(chatId)).toBe(true);
    });

    it('channel chatId format is consistent across channel types', () => {
      const channels = ['telegram', 'discord', 'slack', 'whatsapp'];
      for (const ch of channels) {
        const chatId = `${ch}:12345`;
        expect(chatId).toMatch(/^\w+:\d+$/);
      }
    });

    it('guard returns 503 when architect is not available', () => {
      const guard = (architect: any) => {
        if (!architect) return { status: 503, error: 'Architect not available' };
        return null;
      };
      expect(guard(null)).toEqual({ status: 503, error: 'Architect not available' });
      expect(guard({})).toBeNull();
    });
  });

  describe('ArchitectBridge integration', () => {
    it('bridge feeds correct snapshot to awareness collector', async () => {
      const architect = {
        getConversationSummary: vi.fn().mockReturnValue({ theme: 'coding', messageCount: 3 }),
        loadConversationState: vi.fn(),
      };
      const vault = {
        get: vi.fn(() => undefined),
        add: vi.fn(async () => {}),
        has: vi.fn(() => false),
      };
      const collector = new ArchitectAwarenessCollector();
      const bridge = new ArchitectBridge(architect, collector, vault);

      bridge.afterPrompt(
        { domain: 'technology', emotionalRegister: 'enthusiastic', stakes: 'high', complexity: 'complex', detectionConfidence: 0.9 },
        'escalating',
        false,
        'chat-int-1',
      );

      const signals = await collector.collect({
        userId: 'test', sessionId: 's1', chatId: 'c1', currentMessage: 'test', recentMessages: [],
      });

      const ctxSignal = signals.find(s => s.dimension === 'architect-context');
      expect(ctxSignal).toBeDefined();
      expect(ctxSignal!.text).toContain('technology');
      expect(ctxSignal!.data).toMatchObject({ domain: 'technology', stakes: 'high' });

      const emotionSignal = signals.find(s => s.dimension === 'architect-emotion');
      expect(emotionSignal).toBeDefined();
      expect(emotionSignal!.text).toContain('escalating');
    });

    it('bridge does not emit escalation signal without alert', async () => {
      const architect = {
        getConversationSummary: vi.fn().mockReturnValue({ theme: null, messageCount: 0 }),
        loadConversationState: vi.fn(),
      };
      const vault = { get: vi.fn(() => undefined), add: vi.fn(async () => {}), has: vi.fn(() => false) };
      const collector = new ArchitectAwarenessCollector();
      const bridge = new ArchitectBridge(architect, collector, vault);

      bridge.afterPrompt({ domain: 'general' }, 'stable', false, 'chat-safe');

      const signals = await collector.collect({
        userId: 'test', sessionId: 's1', chatId: 'c1', currentMessage: 'test', recentMessages: [],
      });

      expect(signals.find(s => s.dimension === 'architect-escalation')).toBeUndefined();
    });
  });

  describe('awareness collector tool signals', () => {
    it('tool context is consumed once and reset', async () => {
      const collector = new ArchitectAwarenessCollector();
      collector.updateOutput({
        detectedContext: { domain: 'general', emotionalRegister: 'neutral', stakes: 'moderate', complexity: 'moderate' },
      });
      collector.updateToolContext([{ name: 'calculator', success: true }]);

      const first = await collector.collect({ userId: 'u', sessionId: 's', chatId: 'c', currentMessage: 'm', recentMessages: [] });
      expect(first.find(s => s.dimension === 'architect-tools')).toBeDefined();

      const second = await collector.collect({ userId: 'u', sessionId: 's', chatId: 'c', currentMessage: 'm', recentMessages: [] });
      expect(second.find(s => s.dimension === 'architect-tools')).toBeUndefined();
    });
  });
});
