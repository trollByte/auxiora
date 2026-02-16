import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationContext } from '../conversation-context.js';
import { createArchitect } from '../index.js';
import type { ContextDomain } from '../../schema.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

let ctx: ConversationContext;

beforeEach(() => {
  ctx = new ConversationContext();
});

/** Shorthand: record and get effective domain in one call. */
function recordAndGet(domain: ContextDomain, confidence: number, message = 'test'): ContextDomain {
  ctx.recordDetection(message, domain, confidence);
  return ctx.getEffectiveDomain(domain, confidence);
}

// ────────────────────────────────────────────────────────────────────────────
// Theme establishment
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationContext — theme establishment', () => {
  it('3 consecutive security messages establish security_review theme', () => {
    recordAndGet('security_review', 0.8);
    recordAndGet('security_review', 0.9);
    const third = recordAndGet('security_review', 0.85);

    expect(third).toBe('security_review');
    expect(ctx.getSummary().theme).toBe('security_review');
  });

  it('does not establish theme before 3 consecutive messages', () => {
    recordAndGet('security_review', 0.8);
    recordAndGet('security_review', 0.9);

    expect(ctx.getSummary().theme).toBeNull();
  });

  it('does not establish general as a theme', () => {
    recordAndGet('general', 0.3);
    recordAndGet('general', 0.2);
    recordAndGet('general', 0.1);

    expect(ctx.getSummary().theme).toBeNull();
  });

  it('interruption resets streak and prevents theme lock', () => {
    recordAndGet('security_review', 0.8);
    recordAndGet('security_review', 0.9);
    recordAndGet('code_engineering', 0.8); // breaks the streak
    recordAndGet('security_review', 0.8);

    expect(ctx.getSummary().theme).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Theme persistence through tangents
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationContext — theme holds through tangents', () => {
  beforeEach(() => {
    // Establish security_review theme
    recordAndGet('security_review', 0.8);
    recordAndGet('security_review', 0.9);
    recordAndGet('security_review', 0.85);
    expect(ctx.getSummary().theme).toBe('security_review');
  });

  it('general message still returns security_review when theme is set', () => {
    const effective = recordAndGet('general', 0.2);
    expect(effective).toBe('security_review');
  });

  it('low-confidence different domain does not break theme', () => {
    const effective = recordAndGet('writing_content', 0.4);
    expect(effective).toBe('security_review');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Theme shifting
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationContext — theme shifting', () => {
  beforeEach(() => {
    recordAndGet('security_review', 0.8);
    recordAndGet('security_review', 0.9);
    recordAndGet('security_review', 0.85);
  });

  it('high-confidence different domain (> 0.7) updates the theme', () => {
    const effective = recordAndGet('writing_content', 0.8);
    expect(effective).toBe('writing_content');
    expect(ctx.getSummary().theme).toBe('writing_content');
  });

  it('exact 0.7 confidence updates the theme', () => {
    const effective = recordAndGet('code_engineering', 0.7);
    expect(effective).toBe('code_engineering');
    expect(ctx.getSummary().theme).toBe('code_engineering');
  });

  it('same domain at high confidence keeps the theme', () => {
    const effective = recordAndGet('security_review', 0.9);
    expect(effective).toBe('security_review');
    expect(ctx.getSummary().theme).toBe('security_review');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Crisis override
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationContext — crisis ALWAYS overrides', () => {
  it('crisis overrides an established writing_content theme', () => {
    recordAndGet('writing_content', 0.8);
    recordAndGet('writing_content', 0.9);
    recordAndGet('writing_content', 0.85);
    expect(ctx.getSummary().theme).toBe('writing_content');

    const effective = recordAndGet('crisis_management', 0.5);
    expect(effective).toBe('crisis_management');
    expect(ctx.getSummary().theme).toBe('crisis_management');
  });

  it('crisis overrides even with low confidence', () => {
    recordAndGet('security_review', 0.8);
    recordAndGet('security_review', 0.9);
    recordAndGet('security_review', 0.85);

    // Crisis at very low confidence still wins
    const effective = recordAndGet('crisis_management', 0.2);
    expect(effective).toBe('crisis_management');
  });

  it('crisis overrides when no theme is set', () => {
    const effective = recordAndGet('crisis_management', 0.6);
    expect(effective).toBe('crisis_management');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Manual control
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationContext — setTheme / clearTheme', () => {
  it('setTheme manually establishes theme', () => {
    ctx.setTheme('debugging');
    expect(ctx.getSummary().theme).toBe('debugging');

    // General message should return the manual theme
    const effective = recordAndGet('general', 0.2);
    expect(effective).toBe('debugging');
  });

  it('clearTheme returns to pure auto-detection', () => {
    ctx.setTheme('debugging');
    ctx.clearTheme();
    expect(ctx.getSummary().theme).toBeNull();

    // Without theme, raw detection is returned
    const effective = recordAndGet('code_engineering', 0.5);
    expect(effective).toBe('code_engineering');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Reset
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationContext — reset', () => {
  it('reset clears all state', () => {
    recordAndGet('security_review', 0.8);
    recordAndGet('security_review', 0.9);
    recordAndGet('security_review', 0.85);
    expect(ctx.getSummary().theme).toBe('security_review');
    expect(ctx.getSummary().messageCount).toBe(3);

    ctx.reset();

    const summary = ctx.getSummary();
    expect(summary.theme).toBeNull();
    expect(summary.messageCount).toBe(0);
    expect(summary.currentStreak.count).toBe(0);
    expect(summary.currentStreak.domain).toBe('general');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Domain distribution
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationContext — domain distribution', () => {
  it('tracks domain counts correctly', () => {
    recordAndGet('security_review', 0.8);
    recordAndGet('security_review', 0.9);
    recordAndGet('code_engineering', 0.8);
    recordAndGet('general', 0.2);
    recordAndGet('security_review', 0.85);

    const dist = ctx.getSummary().domainDistribution;
    expect(dist['security_review']).toBe(3);
    expect(dist['code_engineering']).toBe(1);
    expect(dist['general']).toBe(1);
  });

  it('streak tracks the current consecutive run', () => {
    recordAndGet('security_review', 0.8);
    recordAndGet('security_review', 0.9);
    recordAndGet('code_engineering', 0.8);

    const streak = ctx.getSummary().currentStreak;
    expect(streak.domain).toBe('code_engineering');
    expect(streak.count).toBe(1);
  });

  it('streak accumulates for consecutive same-domain messages', () => {
    recordAndGet('debugging', 0.8);
    recordAndGet('debugging', 0.9);
    recordAndGet('debugging', 0.7);
    recordAndGet('debugging', 0.85);

    const streak = ctx.getSummary().currentStreak;
    expect(streak.domain).toBe('debugging');
    expect(streak.count).toBe(4);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Integration with TheArchitect
// ────────────────────────────────────────────────────────────────────────────

describe('TheArchitect — conversation context integration', () => {
  it('establishes theme after 3 consistent detections and applies it', () => {
    const architect = createArchitect();
    const securityMsg = 'Is this secure? Review for vulnerability, threat, exploit, firewall, and audit compliance — check attack vectors';

    // 3 security messages to establish theme
    architect.generatePrompt(securityMsg);
    architect.generatePrompt(securityMsg);
    const third = architect.generatePrompt(securityMsg);

    expect(third.detectedContext.conversationTheme).toBe('security_review');

    // A vague message should still get security_review due to theme
    const vague = architect.generatePrompt('What do you think about this?');
    expect(vague.detectedContext.domain).toBe('security_review');
    expect(vague.detectedContext.themeOverridden).toBe(true);
    expect(vague.detectedContext.rawDetectedDomain).toBe('general');
  });

  it('crisis overrides conversation theme in TheArchitect', () => {
    const architect = createArchitect();
    const securityMsg = 'Is this secure? Review for vulnerability, threat, exploit, firewall, and audit compliance — check attack vectors';

    // Establish security theme
    architect.generatePrompt(securityMsg);
    architect.generatePrompt(securityMsg);
    architect.generatePrompt(securityMsg);

    // Crisis message
    const crisis = architect.generatePrompt(
      'We just got breached — this is a P1 incident, escalation is underway and the outage is spreading',
    );
    expect(crisis.detectedContext.domain).toBe('crisis_management');
  });

  it('resetConversation clears the conversation context', () => {
    const architect = createArchitect();
    const securityMsg = 'Is this secure? Review for vulnerability, threat, exploit, firewall, and audit compliance — check attack vectors';

    architect.generatePrompt(securityMsg);
    architect.generatePrompt(securityMsg);
    architect.generatePrompt(securityMsg);

    architect.resetConversation();

    const summary = architect.getConversationSummary();
    expect(summary.theme).toBeNull();
    expect(summary.messageCount).toBe(0);
  });

  it('contextOverride takes precedence over conversation theme', () => {
    const architect = createArchitect();
    const securityMsg = 'Is this secure? Review for vulnerability, threat, exploit, firewall, and audit compliance — check attack vectors';

    architect.generatePrompt(securityMsg);
    architect.generatePrompt(securityMsg);
    architect.generatePrompt(securityMsg);

    architect.setContextOverride('debugging');
    const output = architect.generatePrompt('What do you think?');
    expect(output.detectedContext.domain).toBe('debugging');
    // themeOverridden should not be set when contextOverride is active
    expect(output.detectedContext.themeOverridden).toBeUndefined();
  });
});
