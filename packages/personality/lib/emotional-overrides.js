// ────────────────────────────────────────────────────────────────────────────
// Emotional overrides
// ────────────────────────────────────────────────────────────────────────────
/**
 * Multipliers applied on top of the context profile's base trait values.
 * Values > 1.0 amplify a trait; values < 1.0 dampen it.
 * After multiplication, all traits are capped at 1.0 by `applyEmotionalOverride`.
 */
export const EMOTIONAL_OVERRIDES = {
    /** Slow everything down, lead with empathy and calm — suppress urgency and adversarial edges. */
    stressed: {
        stoicCalm: 1.5,
        tacticalEmpathy: 1.4,
        genuineCuriosity: 1.3,
        warmth: 1.4,
        urgency: 0.3,
        paranoidVigilance: 0.4,
        adversarialThinking: 0.4,
        valueEquation: 0.5,
        humor: 0.5,
        verbosity: 0.7,
    },
    /** Stay calm, lean into empathy and humor to de-escalate — soften candor, suppress adversarial framing. */
    frustrated: {
        stoicCalm: 1.3,
        tacticalEmpathy: 1.5,
        genuineCuriosity: 1.3,
        warmth: 1.3,
        humor: 1.3,
        inversion: 0.6,
        adversarialThinking: 0.5,
        radicalCandor: 0.7,
        urgency: 0.5,
    },
    /** Coach and simplify — break complexity into digestible pieces, suppress anything intimidating. */
    uncertain: {
        developmentalCoaching: 1.5,
        simplification: 1.4,
        storytelling: 1.3,
        warmth: 1.3,
        firstPrinciples: 1.3,
        adversarialThinking: 0.4,
        paranoidVigilance: 0.4,
        urgency: 0.4,
        radicalCandor: 0.7,
    },
    /** Channel the energy productively — amplify execution and analytical rigor while riding the momentum. */
    excited: {
        ooda: 1.3,
        valueEquation: 1.3,
        humor: 1.3,
        warmth: 1.2,
        inversion: 1.2,
        secondOrder: 1.3,
        probabilistic: 1.2,
    },
    /** Celebrate genuinely, then pivot to systematizing the win — suppress paranoia to let the moment land. */
    celebratory: {
        warmth: 1.5,
        humor: 1.4,
        strategicGenerosity: 1.3,
        plannedAbandonment: 0.5,
        adversarialThinking: 0.3,
        paranoidVigilance: 0.3,
    },
    /** No modification — the context profile speaks for itself. */
    neutral: {},
};
// ────────────────────────────────────────────────────────────────────────────
// Application
// ────────────────────────────────────────────────────────────────────────────
/**
 * Applies emotional multipliers to a base trait mix, producing a new TraitMix
 * where each trait is multiplied by its override value (defaulting to 1.0)
 * and capped at 1.0.
 */
export function applyEmotionalOverride(baseMix, emotion) {
    const overrides = EMOTIONAL_OVERRIDES[emotion];
    const result = { ...baseMix };
    for (const key of Object.keys(result)) {
        const multiplier = overrides[key] ?? 1.0;
        result[key] = Math.min(result[key] * multiplier, 1.0);
    }
    return result;
}
//# sourceMappingURL=emotional-overrides.js.map