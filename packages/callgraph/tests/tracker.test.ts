import { describe, it, expect } from 'vitest';
import { CallgraphTracker } from '../src/tracker.js';
import type { AgentNode } from '../src/types.js';

describe('CallgraphTracker', () => {
  it('tracks root agent with no parent', () => {
    const tracker = new CallgraphTracker({ maxDepth: 10 });
    tracker.addAgent({ id: 'root', name: 'orchestrator', startedAt: Date.now() });

    const nodes = tracker.getNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('root');
    expect(nodes[0].depth).toBe(0);
  });

  it('tracks parent-child edges', () => {
    const tracker = new CallgraphTracker({ maxDepth: 10 });
    tracker.addAgent({ id: 'root', name: 'supervisor', startedAt: Date.now() });
    tracker.addAgent({ id: 'worker-1', name: 'coder', startedAt: Date.now(), parentId: 'root' });
    tracker.addAgent({ id: 'worker-2', name: 'reviewer', startedAt: Date.now(), parentId: 'root' });

    const edges = tracker.getEdges();
    expect(edges).toHaveLength(2);
    expect(edges[0]).toEqual({ parentId: 'root', childId: 'worker-1' });
    expect(edges[1]).toEqual({ parentId: 'root', childId: 'worker-2' });

    const children = tracker.getChildren('root');
    expect(children.map((c) => c.id)).toEqual(['worker-1', 'worker-2']);
  });

  it('computes depth correctly for nested agents', () => {
    const tracker = new CallgraphTracker({ maxDepth: 10 });
    tracker.addAgent({ id: 'a', name: 'root', startedAt: Date.now() });
    tracker.addAgent({ id: 'b', name: 'mid', startedAt: Date.now(), parentId: 'a' });
    tracker.addAgent({ id: 'c', name: 'leaf', startedAt: Date.now(), parentId: 'b' });

    const leaf = tracker.getNode('c');
    expect(leaf?.depth).toBe(2);
    expect(tracker.getMaxDepth()).toBe(2);
  });

  it('rejects agents exceeding max depth', () => {
    const tracker = new CallgraphTracker({ maxDepth: 2 });
    tracker.addAgent({ id: 'a', name: 'root', startedAt: Date.now() });
    tracker.addAgent({ id: 'b', name: 'mid', startedAt: Date.now(), parentId: 'a' });
    tracker.addAgent({ id: 'c', name: 'leaf', startedAt: Date.now(), parentId: 'b' });

    expect(() =>
      tracker.addAgent({ id: 'd', name: 'too-deep', startedAt: Date.now(), parentId: 'c' }),
    ).toThrow('depth limit');
  });

  it('updates agent status and token usage', () => {
    const tracker = new CallgraphTracker({ maxDepth: 10 });
    tracker.addAgent({ id: 'a', name: 'worker', startedAt: Date.now() });
    tracker.updateAgent('a', { status: 'completed', tokenUsage: 1500, completedAt: Date.now() });

    const node = tracker.getNode('a');
    expect(node?.status).toBe('completed');
    expect(node?.tokenUsage).toBe(1500);
  });

  it('returns topological order', () => {
    const tracker = new CallgraphTracker({ maxDepth: 10 });
    tracker.addAgent({ id: 'root', name: 'root', startedAt: Date.now() });
    tracker.addAgent({ id: 'child-1', name: 'c1', startedAt: Date.now(), parentId: 'root' });
    tracker.addAgent({ id: 'child-2', name: 'c2', startedAt: Date.now(), parentId: 'root' });
    tracker.addAgent({ id: 'grandchild', name: 'gc', startedAt: Date.now(), parentId: 'child-1' });

    const order = tracker.topologicalOrder();
    const rootIdx = order.indexOf('root');
    const c1Idx = order.indexOf('child-1');
    const gcIdx = order.indexOf('grandchild');
    expect(rootIdx).toBeLessThan(c1Idx);
    expect(c1Idx).toBeLessThan(gcIdx);
  });

  it('computes aggregate token usage for subtree', () => {
    const tracker = new CallgraphTracker({ maxDepth: 10 });
    tracker.addAgent({ id: 'root', name: 'root', startedAt: Date.now() });
    tracker.addAgent({ id: 'c1', name: 'c1', startedAt: Date.now(), parentId: 'root' });
    tracker.addAgent({ id: 'c2', name: 'c2', startedAt: Date.now(), parentId: 'root' });
    tracker.updateAgent('root', { tokenUsage: 100 });
    tracker.updateAgent('c1', { tokenUsage: 200 });
    tracker.updateAgent('c2', { tokenUsage: 300 });

    expect(tracker.getSubtreeTokenUsage('root')).toBe(600);
    expect(tracker.getSubtreeTokenUsage('c1')).toBe(200);
  });
});
