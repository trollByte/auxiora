import type { ContextDomain, EmotionalRegister, TraitSource } from '../schema.js';
import type { EmotionalTrajectory } from './emotional-tracker.js';
import type { ContextRecommendation } from './recommender.js';
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    /** Personality engine output attached to assistant messages. */
    metadata?: AssistantMetadata;
}
export interface AssistantMetadata {
    domain: ContextDomain;
    emotionalRegister: EmotionalRegister;
    emotionalTrajectory?: EmotionalTrajectory;
    conversationTheme?: ContextDomain;
    corrected?: boolean;
    originalDomain?: ContextDomain;
    confidence?: number;
    stakes: string;
    complexity: string;
    activeTraits: TraitSource[];
    customWeightsApplied?: Partial<Record<string, number>>;
    recommendation?: ContextRecommendation;
}
export interface ExportedMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    context?: {
        domain: ContextDomain;
        emotionalRegister: EmotionalRegister;
        emotionalTrajectory?: EmotionalTrajectory;
        conversationTheme?: ContextDomain;
        corrected?: boolean;
        originalDomain?: ContextDomain;
        confidence?: number;
        stakes: string;
        complexity: string;
    };
    activeTraits?: Array<{
        traitName: string;
        weight: number;
        sourceName: string;
    }>;
    customWeightsApplied?: Partial<Record<string, number>>;
    recommendation?: ContextRecommendation;
}
export interface ExportedConversation {
    id: string;
    title: string;
    exportedAt: number;
    messageCount: number;
    messages: ExportedMessage[];
    summary: {
        dominantContexts: Array<{
            domain: ContextDomain;
            percentage: number;
        }>;
        emotionalArc: EmotionalRegister[];
        correctionsApplied: number;
        uniqueSourcesReferenced: string[];
    };
}
export declare class ConversationExporter {
    /**
     * Build an export from conversation messages with their metadata.
     */
    export(messages: ChatMessage[], conversationId: string): ExportedConversation;
    /** Export to JSON string. */
    toJSON(conversation: ExportedConversation): string;
    /** Export to Markdown (human-readable report). */
    toMarkdown(conversation: ExportedConversation): string;
    /** Export to CSV (one row per assistant message for analysis). */
    toCSV(conversation: ExportedConversation): string;
    private buildSummary;
}
//# sourceMappingURL=conversation-export.d.ts.map