import type { TaskContext, ContextDomain } from '../schema.js';
import type { CorrectionStore } from './correction-store.js';
/**
 * Returns all domain scores for debugging and transparency.
 * Useful for understanding why a particular domain was selected.
 */
export declare function scoreAllDomains(message: string): Record<ContextDomain, number>;
/**
 * Detects the full task context from a user message and optional conversation
 * history. Combines domain detection, emotional register analysis, complexity
 * inference, stakes assessment, and mode classification into a single
 * TaskContext object that drives trait modulation.
 *
 * When a `correctionStore` is provided, the auto-detected domain is checked
 * against learned correction patterns. If a high-confidence correction is
 * found, it overrides the detection and the `corrected` / `originalDomain`
 * fields are set on the returned context.
 */
export declare function detectContext(userMessage: string, history?: Array<{
    role: string;
    content: string;
}>, correctionStore?: CorrectionStore): TaskContext;
//# sourceMappingURL=context-detector.d.ts.map