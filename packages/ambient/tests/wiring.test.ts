import { describe, it, expect } from 'vitest';

describe('Ambient package exports', () => {
  it('should export all public APIs', async () => {
    const mod = await import('../src/index.js');
    expect(mod.AmbientPatternEngine).toBeDefined();
    expect(mod.AnticipationEngine).toBeDefined();
    expect(mod.BriefingGenerator).toBeDefined();
    expect(mod.QuietNotificationManager).toBeDefined();
    expect(mod.DEFAULT_BRIEFING_CONFIG).toBeDefined();
  });
});
