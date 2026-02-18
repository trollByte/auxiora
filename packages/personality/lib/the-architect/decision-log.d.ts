import type { ContextDomain } from '../schema.js';
export type DecisionStatus = 'active' | 'revisit' | 'completed' | 'abandoned';
export interface Decision {
    id: string;
    timestamp: number;
    domain: ContextDomain;
    summary: string;
    context: string;
    status: DecisionStatus;
    followUpDate?: number;
    outcome?: string;
    tags: string[];
}
export interface DecisionQuery {
    domain?: ContextDomain;
    status?: DecisionStatus;
    since?: number;
    search?: string;
    limit?: number;
}
export declare class DecisionLog {
    private decisions;
    private maxDecisions;
    /** Record a new decision. Auto-generates id, timestamp, and tags. */
    addDecision(decision: Omit<Decision, 'id' | 'timestamp' | 'tags'>): Decision;
    /** Update an existing decision's status or outcome. */
    updateDecision(id: string, updates: Partial<Pick<Decision, 'status' | 'outcome' | 'followUpDate'>>): void;
    /** Query decisions with filters. All filters are AND-combined. */
    query(q: DecisionQuery): Decision[];
    /** Get decisions due for follow-up (followUpDate <= now). */
    getDueFollowUps(): Decision[];
    /** Get recent decisions for a domain (for context in new conversations). */
    getRecentForDomain(domain: ContextDomain, limit?: number): Decision[];
    /** Serialize for encrypted storage. */
    serialize(): string;
    /** Deserialize from encrypted storage. */
    static deserialize(data: string): DecisionLog;
    /** Clear all decisions (user data deletion). */
    clear(): void;
}
//# sourceMappingURL=decision-log.d.ts.map