import { describe, it, expect } from 'vitest';
import { ConversationContext } from '../conversation-context.js';

describe('ConversationContext persistence', () => {
  it('should round-trip serialize and restore', () => {
    const ctx = new ConversationContext();
    ctx.recordDetection('check the firewall rules', 'security_review', 0.85);
    ctx.recordDetection('audit the access controls', 'security_review', 0.9);
    ctx.recordDetection('review the encryption setup', 'security_review', 0.88);
    const summaryBefore = ctx.getSummary();
    expect(summaryBefore.theme).toBe('security_review');

    const serialized = ctx.serialize();
    const restored = ConversationContext.restore(serialized);
    const summaryAfter = restored.getSummary();

    expect(summaryAfter.theme).toBe(summaryBefore.theme);
    expect(summaryAfter.messageCount).toBe(summaryBefore.messageCount);
    expect(summaryAfter.currentStreak).toEqual(summaryBefore.currentStreak);
    expect(summaryAfter.domainDistribution).toEqual(summaryBefore.domainDistribution);
  });

  it('should restore effective domain behavior', () => {
    const ctx = new ConversationContext();
    ctx.recordDetection('msg1', 'security_review', 0.85);
    ctx.recordDetection('msg2', 'security_review', 0.9);
    ctx.recordDetection('msg3', 'security_review', 0.88);

    const restored = ConversationContext.restore(ctx.serialize());
    const effective = restored.getEffectiveDomain('general', 0.3);
    expect(effective).toBe('security_review');
  });

  it('should cap history at 50 records', () => {
    const ctx = new ConversationContext();
    for (let i = 0; i < 60; i++) {
      ctx.recordDetection(`msg${i}`, 'code_engineering', 0.8);
    }
    const serialized = ctx.serialize();
    expect(serialized.history.length).toBe(50);
  });

  it('should handle empty context', () => {
    const ctx = new ConversationContext();
    const serialized = ctx.serialize();
    const restored = ConversationContext.restore(serialized);
    expect(restored.getSummary().theme).toBeNull();
    expect(restored.getSummary().messageCount).toBe(0);
  });
});
