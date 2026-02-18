// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
/** Maximum absolute offset a user can apply to any trait. */
const MAX_OFFSET = 0.3;
/** All valid trait keys from TraitMix. */
const VALID_TRAITS = new Set([
    'inversion', 'firstPrinciples', 'mentalSimulation', 'adversarialThinking',
    'secondOrder', 'systemsView', 'simplification', 'storytelling',
    'tacticalEmpathy', 'genuineCuriosity', 'radicalCandor', 'standardSetting',
    'developmentalCoaching', 'strategicGenerosity', 'stoicCalm', 'paranoidVigilance',
    'valueEquation', 'ooda', 'buildForChange', 'humanCenteredDesign',
    'constraintCreativity', 'regretMinimization', 'doorClassification',
    'probabilistic', 'plannedAbandonment', 'warmth', 'urgency', 'humor', 'verbosity',
]);
// ────────────────────────────────────────────────────────────────────────────
// Presets
// ────────────────────────────────────────────────────────────────────────────
export const WEIGHT_PRESETS = {
    the_ciso: {
        name: 'The CISO',
        description: 'Extra paranoia, adversarial thinking, and rigor. For security-focused work.',
        overrides: {
            adversarialThinking: +0.2,
            paranoidVigilance: +0.2,
            inversion: +0.15,
            systemsView: +0.1,
            humor: -0.15,
            warmth: -0.1,
        },
    },
    the_builder: {
        name: 'The Builder',
        description: 'Bias toward action, simplicity, and shipping. Less analysis, more execution.',
        overrides: {
            valueEquation: +0.2,
            ooda: +0.2,
            buildForChange: +0.15,
            constraintCreativity: +0.15,
            secondOrder: -0.1,
            verbosity: -0.15,
        },
    },
    the_coach: {
        name: 'The Coach',
        description: 'Extra empathy, patience, and developmental focus. For leadership and mentoring.',
        overrides: {
            tacticalEmpathy: +0.2,
            developmentalCoaching: +0.2,
            genuineCuriosity: +0.15,
            warmth: +0.2,
            radicalCandor: +0.1,
            urgency: -0.2,
            adversarialThinking: -0.15,
        },
    },
    the_strategist: {
        name: 'The Strategist',
        description: 'Deep second-order thinking, inversion, and long-term framing.',
        overrides: {
            inversion: +0.2,
            secondOrder: +0.2,
            probabilistic: +0.15,
            doorClassification: +0.15,
            plannedAbandonment: +0.1,
            verbosity: +0.15,
            ooda: -0.1,
            humor: -0.1,
        },
    },
    the_closer: {
        name: 'The Closer',
        description: 'Sales-focused energy. Value equations, storytelling, urgency.',
        overrides: {
            valueEquation: +0.25,
            storytelling: +0.2,
            simplification: +0.15,
            urgency: +0.15,
            humor: +0.1,
            stoicCalm: -0.1,
            adversarialThinking: -0.15,
        },
    },
};
// ────────────────────────────────────────────────────────────────────────────
// CustomWeights
// ────────────────────────────────────────────────────────────────────────────
/**
 * User-defined trait weight adjustments. These are ADDITIVE offsets applied
 * after context profiles and emotional overrides, allowing users to
 * permanently nudge the personality toward their preferences.
 *
 * Offsets are clamped to [-0.3, +0.3] — enough to meaningfully shift
 * behavior without fully overriding the context profile.
 */
export class CustomWeights {
    overrides = {};
    // ── Set / Remove ────────────────────────────────────────────────────────
    /**
     * Set a custom weight offset for a trait.
     * Clamps to [-0.3, +0.3]. Throws if the trait key is invalid.
     */
    setOverride(trait, offset) {
        if (!VALID_TRAITS.has(trait)) {
            throw new Error(`Invalid trait key: ${trait}`);
        }
        this.overrides[trait] = Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, offset));
    }
    /** Remove a custom override for a single trait. */
    removeOverride(trait) {
        delete this.overrides[trait];
    }
    /** Get all current overrides. Returns a shallow copy. */
    getOverrides() {
        return { ...this.overrides };
    }
    // ── Application ─────────────────────────────────────────────────────────
    /**
     * Apply overrides to a trait mix. For each override, adds the offset
     * and clamps the result to [0.0, 1.0].
     */
    apply(baseMix) {
        const result = { ...baseMix };
        for (const [trait, offset] of Object.entries(this.overrides)) {
            result[trait] = Math.min(1.0, Math.max(0.0, result[trait] + offset));
        }
        return result;
    }
    // ── Presets ─────────────────────────────────────────────────────────────
    /** All available presets. */
    static get presets() {
        return WEIGHT_PRESETS;
    }
    /** Load a preset, replacing all current overrides. Throws if preset not found. */
    loadPreset(presetName) {
        const preset = WEIGHT_PRESETS[presetName];
        if (!preset) {
            throw new Error(`Unknown preset: ${presetName}. Available: ${Object.keys(WEIGHT_PRESETS).join(', ')}`);
        }
        this.overrides = { ...preset.overrides };
    }
    // ── Serialization ───────────────────────────────────────────────────────
    /** Serialize overrides to JSON string for persistence. */
    serialize() {
        return JSON.stringify(this.overrides);
    }
    /** Deserialize a CustomWeights instance from a JSON string. */
    static deserialize(data) {
        const instance = new CustomWeights();
        const parsed = JSON.parse(data);
        for (const [trait, offset] of Object.entries(parsed)) {
            if (VALID_TRAITS.has(trait) && typeof offset === 'number') {
                instance.overrides[trait] = Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, offset));
            }
        }
        return instance;
    }
    // ── Lifecycle ───────────────────────────────────────────────────────────
    /** Clear all overrides. */
    clear() {
        this.overrides = {};
    }
}
//# sourceMappingURL=custom-weights.js.map