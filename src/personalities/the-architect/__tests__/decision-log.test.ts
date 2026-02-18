import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DecisionLog } from '../decision-log.js';
import type { ContextDomain } from '../../schema.js';
import type { Decision, DecisionStatus } from '../decision-log.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDecisionInput(overrides: Partial<Omit<Decision, 'id' | 'timestamp' | 'tags'>> = {}) {
  return {
    domain: overrides.domain ?? ('architecture_design' as ContextDomain),
    summary: overrides.summary ?? 'Going with microservices architecture',
    context: overrides.context ?? 'We need to scale the backend independently',
    status: overrides.status ?? ('active' as DecisionStatus),
    followUpDate: overrides.followUpDate,
    outcome: overrides.outcome,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DecisionLog', () => {
  let log: DecisionLog;

  beforeEach(() => {
    log = new DecisionLog();
  });

  // ── addDecision ──────────────────────────────────────────────────────────

  describe('addDecision', () => {
    it('generates id, timestamp, and tags automatically', () => {
      const result = log.addDecision(makeDecisionInput());

      expect(result.id).toMatch(/^[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+$/);
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.timestamp).toBeLessThanOrEqual(Date.now());
      expect(result.tags).toBeInstanceOf(Array);
      expect(result.tags.length).toBeGreaterThan(0);
    });

    it('preserves all provided fields', () => {
      const input = makeDecisionInput({
        domain: 'security_review' as ContextDomain,
        summary: 'Implementing zero-trust networking',
        context: 'Customer requires strict security compliance',
        status: 'active',
        followUpDate: 1700000000000,
        outcome: 'pending review',
      });

      const result = log.addDecision(input);

      expect(result.domain).toBe('security_review');
      expect(result.summary).toBe('Implementing zero-trust networking');
      expect(result.context).toBe('Customer requires strict security compliance');
      expect(result.status).toBe('active');
      expect(result.followUpDate).toBe(1700000000000);
      expect(result.outcome).toBe('pending review');
    });

    it('extracts tags from summary and context', () => {
      const result = log.addDecision(makeDecisionInput({
        summary: 'Kubernetes deployment strategy',
        context: 'Production environment requires rolling updates',
      }));

      // Tags should include meaningful words (>= 4 chars, non-stopwords)
      expect(result.tags).toContain('kubernetes');
      expect(result.tags).toContain('deployment');
      expect(result.tags).toContain('strategy');
      expect(result.tags).toContain('production');
      expect(result.tags).toContain('environment');
      expect(result.tags).toContain('requires');
      expect(result.tags).toContain('rolling');
      expect(result.tags).toContain('updates');
    });

    it('deduplicates tags', () => {
      const result = log.addDecision(makeDecisionInput({
        summary: 'deploy deploy deploy',
        context: 'deploy again',
      }));

      const deployCount = result.tags.filter(t => t === 'deploy').length;
      expect(deployCount).toBe(1);
    });

    it('filters out short words and stopwords from tags', () => {
      const result = log.addDecision(makeDecisionInput({
        summary: 'the big api is very good',
        context: 'we should make it work now',
      }));

      // Short words (< 4 chars) excluded
      expect(result.tags).not.toContain('the');
      expect(result.tags).not.toContain('big');
      expect(result.tags).not.toContain('api');
      // Stopwords excluded
      expect(result.tags).not.toContain('very');
      expect(result.tags).not.toContain('good');
      expect(result.tags).not.toContain('make');
      expect(result.tags).not.toContain('work');
    });

    it('returns the created Decision object', () => {
      const result = log.addDecision(makeDecisionInput());
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('tags');
      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('summary');
    });
  });

  // ── updateDecision ───────────────────────────────────────────────────────

  describe('updateDecision', () => {
    it('updates status', () => {
      const decision = log.addDecision(makeDecisionInput());
      log.updateDecision(decision.id, { status: 'completed' });

      const results = log.query({});
      expect(results[0].status).toBe('completed');
    });

    it('updates outcome', () => {
      const decision = log.addDecision(makeDecisionInput());
      log.updateDecision(decision.id, { outcome: 'Worked great, 50% latency reduction' });

      const results = log.query({});
      expect(results[0].outcome).toBe('Worked great, 50% latency reduction');
    });

    it('updates followUpDate', () => {
      const decision = log.addDecision(makeDecisionInput());
      const futureDate = Date.now() + 86400000;
      log.updateDecision(decision.id, { followUpDate: futureDate });

      const results = log.query({});
      expect(results[0].followUpDate).toBe(futureDate);
    });

    it('updates multiple fields at once', () => {
      const decision = log.addDecision(makeDecisionInput());
      log.updateDecision(decision.id, {
        status: 'abandoned',
        outcome: 'Requirements changed',
      });

      const results = log.query({});
      expect(results[0].status).toBe('abandoned');
      expect(results[0].outcome).toBe('Requirements changed');
    });

    it('throws for unknown id', () => {
      expect(() => log.updateDecision('nonexistent-id', { status: 'completed' }))
        .toThrow('Decision not found: nonexistent-id');
    });
  });

  // ── query ────────────────────────────────────────────────────────────────

  describe('query', () => {
    it('returns all decisions when no filters', () => {
      log.addDecision(makeDecisionInput());
      log.addDecision(makeDecisionInput({ summary: 'Another decision' }));

      const results = log.query({});
      expect(results).toHaveLength(2);
    });

    it('filters by domain', () => {
      log.addDecision(makeDecisionInput({ domain: 'security_review' as ContextDomain }));
      log.addDecision(makeDecisionInput({ domain: 'code_engineering' as ContextDomain }));
      log.addDecision(makeDecisionInput({ domain: 'security_review' as ContextDomain }));

      const results = log.query({ domain: 'security_review' as ContextDomain });
      expect(results).toHaveLength(2);
      expect(results.every(d => d.domain === 'security_review')).toBe(true);
    });

    it('filters by status', () => {
      const d1 = log.addDecision(makeDecisionInput());
      log.addDecision(makeDecisionInput());
      log.updateDecision(d1.id, { status: 'completed' });

      const results = log.query({ status: 'completed' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(d1.id);
    });

    it('filters by since timestamp', () => {
      const before = Date.now();
      log.addDecision(makeDecisionInput());

      // Small delay to ensure different timestamps
      const midpoint = Date.now() + 1;
      vi.spyOn(Date, 'now').mockReturnValue(midpoint + 100);
      log.addDecision(makeDecisionInput({ summary: 'Later decision' }));
      vi.restoreAllMocks();

      const results = log.query({ since: midpoint });
      expect(results).toHaveLength(1);
      expect(results[0].summary).toBe('Later decision');
    });

    it('filters by search (case-insensitive substring)', () => {
      log.addDecision(makeDecisionInput({ summary: 'Kubernetes deployment strategy' }));
      log.addDecision(makeDecisionInput({ summary: 'Database migration plan' }));

      const results = log.query({ search: 'kubernetes' });
      expect(results).toHaveLength(1);
      expect(results[0].summary).toBe('Kubernetes deployment strategy');
    });

    it('search matches across summary, context, and tags', () => {
      log.addDecision(makeDecisionInput({
        summary: 'plain summary',
        context: 'Kubernetes is mentioned here',
      }));

      const results = log.query({ search: 'kubernetes' });
      expect(results).toHaveLength(1);
    });

    it('applies limit', () => {
      for (let i = 0; i < 10; i++) {
        log.addDecision(makeDecisionInput({ summary: `Decision ${i}` }));
      }

      const results = log.query({ limit: 3 });
      expect(results).toHaveLength(3);
    });

    it('combines filters with AND logic', () => {
      log.addDecision(makeDecisionInput({
        domain: 'security_review' as ContextDomain,
        summary: 'Zero trust networking',
        status: 'active',
      }));
      log.addDecision(makeDecisionInput({
        domain: 'security_review' as ContextDomain,
        summary: 'Firewall rules update',
        status: 'completed',
      }));
      log.addDecision(makeDecisionInput({
        domain: 'code_engineering' as ContextDomain,
        summary: 'Zero trust implementation',
        status: 'active',
      }));

      const results = log.query({
        domain: 'security_review' as ContextDomain,
        status: 'active',
        search: 'zero',
      });
      expect(results).toHaveLength(1);
      expect(results[0].summary).toBe('Zero trust networking');
    });

    it('returns results sorted by timestamp descending', () => {
      const now = Date.now();

      vi.spyOn(Date, 'now').mockReturnValue(now - 2000);
      log.addDecision(makeDecisionInput({ summary: 'Oldest' }));

      vi.spyOn(Date, 'now').mockReturnValue(now - 1000);
      log.addDecision(makeDecisionInput({ summary: 'Middle' }));

      vi.spyOn(Date, 'now').mockReturnValue(now);
      log.addDecision(makeDecisionInput({ summary: 'Newest' }));

      vi.restoreAllMocks();

      const results = log.query({});
      expect(results[0].summary).toBe('Newest');
      expect(results[1].summary).toBe('Middle');
      expect(results[2].summary).toBe('Oldest');
    });
  });

  // ── getDueFollowUps ─────────────────────────────────────────────────────

  describe('getDueFollowUps', () => {
    it('returns decisions with followUpDate <= now', () => {
      const past = Date.now() - 86400000;
      const future = Date.now() + 86400000;

      log.addDecision(makeDecisionInput({ followUpDate: past, summary: 'Overdue' }));
      log.addDecision(makeDecisionInput({ followUpDate: future, summary: 'Future' }));
      log.addDecision(makeDecisionInput({ summary: 'No follow-up' }));

      const due = log.getDueFollowUps();
      expect(due).toHaveLength(1);
      expect(due[0].summary).toBe('Overdue');
    });

    it('includes decisions with followUpDate exactly now', () => {
      const now = Date.now();
      log.addDecision(makeDecisionInput({ followUpDate: now }));

      const due = log.getDueFollowUps();
      expect(due).toHaveLength(1);
    });

    it('returns empty array when no follow-ups are due', () => {
      const future = Date.now() + 86400000;
      log.addDecision(makeDecisionInput({ followUpDate: future }));

      const due = log.getDueFollowUps();
      expect(due).toHaveLength(0);
    });
  });

  // ── getRecentForDomain ──────────────────────────────────────────────────

  describe('getRecentForDomain', () => {
    it('returns decisions filtered by domain', () => {
      log.addDecision(makeDecisionInput({ domain: 'security_review' as ContextDomain }));
      log.addDecision(makeDecisionInput({ domain: 'code_engineering' as ContextDomain }));
      log.addDecision(makeDecisionInput({ domain: 'security_review' as ContextDomain }));

      const results = log.getRecentForDomain('security_review' as ContextDomain);
      expect(results).toHaveLength(2);
      expect(results.every(d => d.domain === 'security_review')).toBe(true);
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        log.addDecision(makeDecisionInput({ domain: 'debugging' as ContextDomain }));
      }

      const results = log.getRecentForDomain('debugging' as ContextDomain, 3);
      expect(results).toHaveLength(3);
    });

    it('defaults to limit of 10', () => {
      for (let i = 0; i < 15; i++) {
        log.addDecision(makeDecisionInput({ domain: 'debugging' as ContextDomain }));
      }

      const results = log.getRecentForDomain('debugging' as ContextDomain);
      expect(results).toHaveLength(10);
    });

    it('returns results sorted by timestamp descending', () => {
      const now = Date.now();

      vi.spyOn(Date, 'now').mockReturnValue(now - 1000);
      log.addDecision(makeDecisionInput({ domain: 'debugging' as ContextDomain, summary: 'Older' }));

      vi.spyOn(Date, 'now').mockReturnValue(now);
      log.addDecision(makeDecisionInput({ domain: 'debugging' as ContextDomain, summary: 'Newer' }));

      vi.restoreAllMocks();

      const results = log.getRecentForDomain('debugging' as ContextDomain);
      expect(results[0].summary).toBe('Newer');
      expect(results[1].summary).toBe('Older');
    });
  });

  // ── maxDecisions capacity ────────────────────────────────────────────────

  describe('maxDecisions capacity', () => {
    it('drops oldest decisions when exceeding 500', () => {
      // Add 502 decisions
      for (let i = 0; i < 502; i++) {
        log.addDecision(makeDecisionInput({ summary: `Decision ${i}` }));
      }

      const results = log.query({});
      expect(results).toHaveLength(500);

      // Oldest two (0 and 1) should have been dropped
      const summaries = results.map(d => d.summary);
      expect(summaries).not.toContain('Decision 0');
      expect(summaries).not.toContain('Decision 1');
      expect(summaries).toContain('Decision 2');
      expect(summaries).toContain('Decision 501');
    });
  });

  // ── Serialization ────────────────────────────────────────────────────────

  describe('serialization', () => {
    it('round-trips through serialize/deserialize', () => {
      const now = Date.now();

      vi.spyOn(Date, 'now').mockReturnValue(now - 1000);
      log.addDecision(makeDecisionInput({ summary: 'First decision' }));

      vi.spyOn(Date, 'now').mockReturnValue(now);
      log.addDecision(makeDecisionInput({
        summary: 'Second decision',
        status: 'completed',
        outcome: 'It worked',
      }));
      vi.restoreAllMocks();

      const serialized = log.serialize();
      const restored = DecisionLog.deserialize(serialized);
      const results = restored.query({});

      expect(results).toHaveLength(2);
      expect(results[0].summary).toBe('Second decision');
      expect(results[0].status).toBe('completed');
      expect(results[0].outcome).toBe('It worked');
      expect(results[1].summary).toBe('First decision');
    });

    it('deserialize of empty JSON object returns empty log', () => {
      const restored = DecisionLog.deserialize('{}');
      expect(restored.query({})).toHaveLength(0);
    });

    it('deserialize of corrupt data returns empty log', () => {
      const restored = DecisionLog.deserialize('not valid json!!!');
      expect(restored.query({})).toHaveLength(0);
    });

    it('deserialize of empty string returns empty log', () => {
      const restored = DecisionLog.deserialize('');
      expect(restored.query({})).toHaveLength(0);
    });
  });

  // ── clear ────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('resets state completely', () => {
      log.addDecision(makeDecisionInput());
      log.addDecision(makeDecisionInput());
      expect(log.query({})).toHaveLength(2);

      log.clear();
      expect(log.query({})).toHaveLength(0);
    });

    it('allows adding decisions after clearing', () => {
      log.addDecision(makeDecisionInput());
      log.clear();
      log.addDecision(makeDecisionInput({ summary: 'After clear' }));

      const results = log.query({});
      expect(results).toHaveLength(1);
      expect(results[0].summary).toBe('After clear');
    });
  });
});
