import type { ContextDomain } from '../schema.js';
export interface DetectionRecord {
    message: string;
    domain: ContextDomain;
    confidence: number;
    timestamp: number;
}
export interface ConversationState {
    theme: ContextDomain | null;
    dominantDomain: ContextDomain;
    domainStreak: number;
    history: DetectionRecord[];
}
export interface ConversationSummary {
    theme: ContextDomain | null;
    messageCount: number;
    domainDistribution: Record<ContextDomain, number>;
    currentStreak: {
        domain: ContextDomain;
        count: number;
    };
}
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
export declare class ConversationContext {
    private history;
    private dominantDomain;
    private domainStreak;
    private conversationTheme;
    /**
     * Record a new context detection. Updates streak tracking and may
     * auto-establish a conversation theme after enough consistent detections.
     */
    recordDetection(message: string, domain: ContextDomain, confidence: number): void;
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
    getEffectiveDomain(currentDetection: ContextDomain, currentConfidence: number): ContextDomain;
    /** Explicitly set conversation theme (user override). */
    setTheme(domain: ContextDomain): void;
    /** Clear theme — returns to pure auto-detection. */
    clearTheme(): void;
    /** Get conversation summary with theme, distribution, and streak info. */
    getSummary(): ConversationSummary;
    /** Reset for a new conversation — clears all state. */
    reset(): void;
    /** Serialize state for vault persistence. Caps history at 50 records. */
    serialize(): ConversationState;
    /** Restore a ConversationContext from previously serialized state. */
    static restore(state: ConversationState): ConversationContext;
}
//# sourceMappingURL=conversation-context.d.ts.map