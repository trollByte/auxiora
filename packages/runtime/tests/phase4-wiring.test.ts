import { describe, it, expect, vi } from 'vitest';
import { CallgraphTracker } from '@auxiora/callgraph';
import { EventBus } from '@auxiora/event-bus';
import { ActiveOverseer } from '@auxiora/overseer';
import { MetaImprovementStructure } from '@auxiora/reasoning';

describe('Phase 4 Integration Wiring', () => {
  it('callgraph events flow through event bus', () => {
    const bus = new EventBus();
    const tracker = new CallgraphTracker({ maxDepth: 5 });
    const received: unknown[] = [];

    bus.subscribe('callgraph.*', (event) => received.push(event));

    // Simulate: tracker adds agent then publishes event to bus
    tracker.addAgent({ id: 'root', name: 'supervisor', startedAt: Date.now() });
    bus.publish({ topic: 'callgraph.agent_added', agentId: 'root', payload: { name: 'supervisor', depth: 0 } });

    tracker.addAgent({ id: 'w1', name: 'coder', startedAt: Date.now(), parentId: 'root' });
    bus.publish({ topic: 'callgraph.edge_added', agentId: 'w1', payload: { parentId: 'root', childId: 'w1' } });

    expect(received).toHaveLength(2);
    expect(tracker.getNodes()).toHaveLength(2);
    expect(tracker.getEdges()).toHaveLength(1);
  });

  it('active overseer assessment triggers event bus notification', async () => {
    const bus = new EventBus();
    const notifications: unknown[] = [];
    bus.subscribe('overseer.*', (event) => notifications.push(event));

    const overseer = new ActiveOverseer({
      loopThreshold: 3,
      stallTimeoutMs: 30_000,
      maxTokenBudget: 50_000,
      checkIntervalMs: 5_000,
    });

    const result = await overseer.assess({
      agentId: 'agent-1',
      toolCalls: [
        { tool: 'read', timestamp: 1 },
        { tool: 'read', timestamp: 2 },
        { tool: 'read', timestamp: 3 },
      ],
      tokenUsage: 1000,
      lastActivityAt: Date.now(),
      startedAt: Date.now() - 5000,
    });

    if (result.action !== 'none') {
      bus.publish({
        topic: 'overseer.alert',
        agentId: result.agentId,
        payload: { action: result.action, alertCount: result.heuristicAlerts.length },
      });
    }

    expect(notifications).toHaveLength(1);
  });

  it('meta-improvement completes and produces storable proposal', () => {
    const meta = new MetaImprovementStructure();

    meta.completeStep('observe', { metrics: { accuracy: 0.85, error_rate: 0.15 } });
    meta.completeStep('reflect', { patterns: ['errors on long inputs'], rootCauses: ['context truncation'] });
    meta.completeStep('hypothesize', { proposals: [{ change: 'chunk inputs', confidence: 0.8 }] });
    meta.completeStep('validate', { testResults: [{ proposal: 'chunk inputs', passed: true, improvement: 0.12 }] });

    const proposal = meta.buildProposal();
    expect(proposal).toBeDefined();
    expect(proposal!.status).toBe('pending_review');

    // Verify proposal is JSON-serializable (required for ImprovementStore)
    const serialized = JSON.stringify(proposal);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.observations.metrics.accuracy).toBe(0.85);
    expect(deserialized.status).toBe('pending_review');
  });
});
