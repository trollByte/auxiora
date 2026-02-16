/**
 * Numeric trait value constrained to the range [0.0, 1.0].
 * 0.0 means the trait is completely suppressed; 1.0 means it dominates.
 */
export type TraitValue = number;
/**
 * The operational domain that shapes which traits are amplified or suppressed.
 */
export type ContextDomain = 'security_review' | 'code_engineering' | 'architecture_design' | 'debugging' | 'team_leadership' | 'one_on_one' | 'sales_pitch' | 'negotiation' | 'marketing_content' | 'strategic_planning' | 'crisis_management' | 'creative_work' | 'writing_content' | 'decision_making' | 'learning_research' | 'personal_development' | 'general';
/**
 * The emotional register detected in the user's message, used to modulate
 * tone and trait selection so the response meets the user where they are.
 */
export type EmotionalRegister = 'neutral' | 'stressed' | 'excited' | 'frustrated' | 'uncertain' | 'celebratory';
/**
 * The full trait vector that defines a personality at a given moment.
 *
 * Every value is a float in [0.0, 1.0]. A base personality sets defaults;
 * context detection then dials individual traits up or down before the
 * prompt is assembled. The trait names encode *how* to think, not *what*
 * to think — each is grounded in a specific historical mind's documented
 * methodology.
 */
export interface TraitMix {
    /** Charlie Munger — define failure first, then avoid it. Invert, always invert. */
    inversion: TraitValue;
    /** Elon Musk / Isaac Newton — decompose to irreducible fundamentals before reasoning up. */
    firstPrinciples: TraitValue;
    /** Nikola Tesla — build and run the full model in your head before touching reality. */
    mentalSimulation: TraitValue;
    /** Andy Grove / Sun Tzu — assume intelligent adversaries; think like the attacker. */
    adversarialThinking: TraitValue;
    /** Howard Marks — always ask "and then what?" to surface cascading consequences. */
    secondOrder: TraitValue;
    /** Buckminster Fuller / Claude Shannon — see the whole system, not just the parts. */
    systemsView: TraitValue;
    /** Steve Jobs / Claude Shannon — ruthless clarity; remove until only the essential remains. */
    simplification: TraitValue;
    /** Robert Cialdini — lead with narrative and analogy, not raw argument. */
    storytelling: TraitValue;
    /** Chris Voss — label emotions, mirror language, use calibrated questions. */
    tacticalEmpathy: TraitValue;
    /** Dale Carnegie — ask questions and genuinely care about the answers. */
    genuineCuriosity: TraitValue;
    /** Kim Scott — care personally while challenging directly. */
    radicalCandor: TraitValue;
    /** John Wooden / Bill Walsh — culture is built through behavioral standards, not slogans. */
    standardSetting: TraitValue;
    /** John Wooden — grow people through high expectations and specific, caring feedback. */
    developmentalCoaching: TraitValue;
    /** Adam Grant / Benjamin Franklin — give first; generosity is a long-term strategy. */
    strategicGenerosity: TraitValue;
    /** Marcus Aurelius — the obstacle is the way; respond, don't react. */
    stoicCalm: TraitValue;
    /** Andy Grove — only the paranoid survive; complacency kills. */
    paranoidVigilance: TraitValue;
    /** Alex Hormozi — maximize perceived value, minimize time/effort/sacrifice/risk. */
    valueEquation: TraitValue;
    /** John Boyd — observe-orient-decide-act; cycle faster than the competition. */
    ooda: TraitValue;
    /** Martin Fowler / Kent Beck — optimize for adaptability; embrace change, don't fight it. */
    buildForChange: TraitValue;
    /** Don Norman — design for the human; understand the user before the system. */
    humanCenteredDesign: TraitValue;
    /** Charles & Ray Eames — limitations are creative fuel, not obstacles. */
    constraintCreativity: TraitValue;
    /** Jeff Bezos — decide from your 80-year-old self looking back; minimize future regret. */
    regretMinimization: TraitValue;
    /** Jeff Bezos — classify as one-way (irreversible, go slow) or two-way (reversible, go fast). */
    doorClassification: TraitValue;
    /** Annie Duke — assign probabilities, update beliefs with new evidence, embrace uncertainty. */
    probabilistic: TraitValue;
    /** Peter Drucker — systematically stop what is no longer working; don't cling. */
    plannedAbandonment: TraitValue;
    /** 0 = pure analytical machine, 1 = deeply empathetic and warm. */
    warmth: TraitValue;
    /** 0 = patient and contemplative, 1 = act now, urgency in every sentence. */
    urgency: TraitValue;
    /** 0 = dead serious, 1 = wry humor woven throughout. */
    humor: TraitValue;
    /** 0 = terse and tactical, 1 = expansive and strategic. */
    verbosity: TraitValue;
}
/**
 * The detected task context that drives trait modulation.
 *
 * Context is inferred from the user's message, active tools, file types,
 * and conversation history. The engine uses this to decide which traits
 * to amplify and which to suppress.
 */
export interface TaskContext {
    /** The operational domain of the current task. */
    domain: ContextDomain;
    /** The emotional register detected in the user's message. */
    emotionalRegister: EmotionalRegister;
    /** How deep the response needs to go. */
    complexity: 'quick_answer' | 'moderate' | 'deep_analysis' | 'crisis';
    /** Who the work is for — shapes formality and collaboration style. */
    mode: 'solo_work' | 'team_context' | 'external_facing' | 'personal';
    /** How much rides on getting this right. */
    stakes: 'low' | 'moderate' | 'high' | 'critical';
}
/**
 * Signals used by the context detector to infer a TaskContext from
 * raw input. Each signal type contributes evidence toward a domain
 * or emotional register classification.
 */
export interface ContextSignal {
    /** Words that strongly indicate this context (e.g., "vulnerability", "CVE"). */
    keywords: string[];
    /** Regex patterns matched against the full message. */
    patterns: string[];
    /** Active tool names that suggest this context (e.g., "bash", "web_browser"). */
    toolContext?: string[];
    /** File extensions being discussed (e.g., ".tf", ".yaml", ".tsx"). */
    fileExtensions?: string[];
    /** Phrases indicating emotional state (e.g., "I'm stuck", "this is broken"). */
    emotionalSignals?: string[];
    /** Minimum confidence (0.0–1.0) before this signal triggers a context switch. */
    confidence_threshold: number;
}
/**
 * Links a trait back to its intellectual source so the engine can explain
 * *why* it's behaving a certain way and the prompt can include the right
 * behavioral instruction.
 */
export interface TraitSource {
    /** The key in TraitMix (e.g., "inversion", "stoicCalm"). */
    traitKey: string;
    /** The historical mind this trait is modeled after (e.g., "Charlie Munger"). */
    sourceName: string;
    /** The primary work or principle (e.g., "Poor Charlie's Almanack"). */
    sourceWork: string;
    /** One-sentence summary of the evidence for this approach. */
    evidenceSummary: string;
    /** The concrete instruction injected into the prompt when this trait is active. */
    behavioralInstruction: string;
}
/**
 * The final output of the personality engine: a fully assembled prompt
 * along with metadata about what traits are active and why.
 */
export interface PromptOutput {
    /** The base personality prompt before context modulation. */
    basePrompt: string;
    /** The context-specific modifier layered on top. */
    contextModifier: string;
    /** The complete prompt ready for the provider (basePrompt + contextModifier). */
    fullPrompt: string;
    /** The traits that are actively shaping this prompt, with provenance. */
    activeTraits: TraitSource[];
    /** The context that was detected and used for trait modulation. */
    detectedContext: TaskContext;
}
//# sourceMappingURL=schema.d.ts.map