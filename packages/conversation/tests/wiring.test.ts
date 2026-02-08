import { describe, it, expect } from 'vitest';

describe('Conversation package exports', () => {
  it('should export all public APIs', async () => {
    const mod = await import('../src/index.js');
    expect(mod.ConversationEngine).toBeDefined();
    expect(mod.TurnManager).toBeDefined();
    expect(mod.VoicePersonalityAdapter).toBeDefined();
    expect(mod.AudioStreamManager).toBeDefined();
    expect(mod.DEFAULT_CONVERSATION_CONFIG).toBeDefined();
    expect(mod.DEFAULT_VOICE_PERSONALITY).toBeDefined();
  });
});
