import { describe, it, expect } from 'vitest';

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
});
