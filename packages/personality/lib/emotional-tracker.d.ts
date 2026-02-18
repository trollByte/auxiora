import type { EmotionalRegister } from '../schema.js';
export type EmotionalTrajectory = 'stable' | 'escalating' | 'de_escalating' | 'shifting' | 'volatile';
export interface EffectiveEmotion {
    emotion: EmotionalRegister;
    intensity: number;
    trajectory: EmotionalTrajectory;
    escalationAlert: boolean;
}
/**
 * Estimate emotional intensity from message text.
 *
 * Heuristic signals:
 * - Excessive punctuation (!! or ??)
 * - ALL CAPS segments
 * - Explicit intensity words ("extremely", "so", "really", "very")
 * - Profanity / frustration markers
 * - Message length (longer rants → higher intensity)
 */
export declare function estimateIntensity(message: string, emotion: EmotionalRegister): number;
/**
 * Tracks emotional state across multiple messages, detecting escalation
 * patterns that a single-message detector would miss.
 *
 * If a user is getting progressively more frustrated over 4-5 messages,
 * the engine should amplify empathy before they reach a breaking point.
 */
export declare class EmotionalTracker {
    private history;
    /** Record a detected emotion with its intensity and source message. */
    recordEmotion(emotion: EmotionalRegister, intensity: number, message: string): void;
    /**
     * Get the effective emotional state considering trajectory across the
     * conversation window.
     */
    getEffectiveEmotion(): EffectiveEmotion;
    private detectTrajectory;
    private mode;
    /** Reset for a new conversation — clears all history. */
    reset(): void;
}
//# sourceMappingURL=emotional-tracker.d.ts.map