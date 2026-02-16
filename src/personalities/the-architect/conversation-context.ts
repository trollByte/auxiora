import type { ContextDomain } from '../schema.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface DetectionRecord {
  message: string;
  domain: ContextDomain;
  confidence: number;
  timestamp: number;
}

export interface ConversationSummary {
  theme: ContextDomain | null;
  messageCount: number;
  domainDistribution: Record<ContextDomain, number>;
  currentStreak: { domain: ContextDomain; count: number };
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** Number of consecutive same-domain detections required to establish a theme. */
const THEME_LOCK_THRESHOLD = 3;

/** Confidence threshold for a new domain to override an existing theme. */
const THEME_OVERRIDE_CONFIDENCE = 0.7;

/** Crisis always takes over — no theme can suppress it. */
const CRISIS_DOMAIN: ContextDomain = 'crisis_management';

// ────────────────────────────────────────────────────────────────────────────
// ConversationContext
// ────────────────────────────────────────────────────────────────────────────

/**
 * Maintains context awareness across a full conversation, not just per-message.
 *
 * If the conversation is about security architecture, a brief tangent about
 * lunch shouldn't reset the context to "general." The class tracks a
 * conversation *theme* that locks after 3+ consistent detections and only
 * shifts when a new domain arrives with high confidence.
 *
 * CRITICAL: Crisis context (`crisis_management`) ALWAYS overrides the
 * conversation theme. If the user suddenly says "we just got breached,"
 * crisis takes over immediately regardless of theme.
 */
export class ConversationContext {
  private history: DetectionRecord[] = [];
  private dominantDomain: ContextDomain = 'general';
  private domainStreak = 0;
  private conversationTheme: ContextDomain | null = null;

  // ── Recording ───────────────────────────────────────────────────────────

  /**
   * Record a new context detection. Updates streak tracking and may
   * auto-establish a conversation theme after enough consistent detections.
   */
  recordDetection(message: string, domain: ContextDomain, confidence: number): void {
    this.history.push({
      message,
      domain,
      confidence,
      timestamp: Date.now(),
    });

    // Update streak tracking
    if (domain === this.dominantDomain) {
      this.domainStreak++;
    } else {
      this.dominantDomain = domain;
      this.domainStreak = 1;
    }

    // Auto-establish theme after THEME_LOCK_THRESHOLD consecutive detections
    if (
      this.conversationTheme === null &&
      this.domainStreak >= THEME_LOCK_THRESHOLD &&
      this.dominantDomain !== 'general'
    ) {
      this.conversationTheme = this.dominantDomain;
    }
  }

  // ── Effective domain ────────────────────────────────────────────────────

  /**
   * Get the effective domain considering conversation history.
   *
   * Rules:
   * 1. Crisis ALWAYS wins — bypasses any theme.
   * 2. If a theme is set and the new detection is 'general' or low confidence,
   *    return the theme (the tangent doesn't break it).
   * 3. If a theme is set and the new detection is a DIFFERENT specific domain
   *    with high confidence (> 0.7), update the theme to the new domain.
   * 4. If no theme is set, return the raw detection unchanged.
   */
  getEffectiveDomain(currentDetection: ContextDomain, currentConfidence: number): ContextDomain {
    // Rule 1: Crisis always overrides
    if (currentDetection === CRISIS_DOMAIN) {
      this.conversationTheme = CRISIS_DOMAIN;
      return CRISIS_DOMAIN;
    }

    // No theme → raw detection
    if (this.conversationTheme === null) {
      return currentDetection;
    }

    // Theme is set — evaluate the new detection
    if (currentDetection === 'general' || currentConfidence < THEME_OVERRIDE_CONFIDENCE) {
      // Low-signal message: theme holds
      return this.conversationTheme;
    }

    if (currentDetection !== this.conversationTheme) {
      // High-confidence different domain: shift the theme
      this.conversationTheme = currentDetection;
    }

    return this.conversationTheme;
  }

  // ── Manual control ──────────────────────────────────────────────────────

  /** Explicitly set conversation theme (user override). */
  setTheme(domain: ContextDomain): void {
    this.conversationTheme = domain;
  }

  /** Clear theme — returns to pure auto-detection. */
  clearTheme(): void {
    this.conversationTheme = null;
  }

  // ── Introspection ──────────────────────────────────────────────────────

  /** Get conversation summary with theme, distribution, and streak info. */
  getSummary(): ConversationSummary {
    const distribution = {} as Record<ContextDomain, number>;
    for (const record of this.history) {
      distribution[record.domain] = (distribution[record.domain] ?? 0) + 1;
    }

    return {
      theme: this.conversationTheme,
      messageCount: this.history.length,
      domainDistribution: distribution,
      currentStreak: {
        domain: this.dominantDomain,
        count: this.domainStreak,
      },
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /** Reset for a new conversation — clears all state. */
  reset(): void {
    this.history = [];
    this.dominantDomain = 'general';
    this.domainStreak = 0;
    this.conversationTheme = null;
  }
}
