import { describe, it, expect, afterEach } from 'vitest';
import { CallgraphStore } from '../src/store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CallgraphStore', () => {
  let store: CallgraphStore;
  let tmpDir: string;

  afterEach(() => {
    store?.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and retrieves agent nodes', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-'));
    store = new CallgraphStore(join(tmpDir, 'callgraph.db'));

    store.recordNode({
      id: 'agent-1',
      workflowId: 'wf-1',
      name: 'supervisor',
      depth: 0,
      status: 'running',
      startedAt: Date.now(),
      tokenUsage: 0,
    });

    const nodes = store.getNodesByWorkflow('wf-1');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('supervisor');
    expect(nodes[0].depth).toBe(0);
  });

  it('stores and retrieves edges', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-'));
    store = new CallgraphStore(join(tmpDir, 'callgraph.db'));

    store.recordNode({ id: 'p', workflowId: 'wf-1', name: 'parent', depth: 0, status: 'running', startedAt: Date.now(), tokenUsage: 0 });
    store.recordNode({ id: 'c', workflowId: 'wf-1', name: 'child', depth: 1, status: 'running', startedAt: Date.now(), tokenUsage: 0, parentId: 'p' });
    store.recordEdge({ workflowId: 'wf-1', parentId: 'p', childId: 'c' });

    const edges = store.getEdgesByWorkflow('wf-1');
    expect(edges).toHaveLength(1);
    expect(edges[0].parentId).toBe('p');
    expect(edges[0].childId).toBe('c');
  });

  it('retrieves full snapshot for a workflow', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-'));
    store = new CallgraphStore(join(tmpDir, 'callgraph.db'));

    store.recordNode({ id: 'root', workflowId: 'wf-2', name: 'root', depth: 0, status: 'completed', startedAt: 1000, tokenUsage: 500 });
    store.recordNode({ id: 'w1', workflowId: 'wf-2', name: 'worker', depth: 1, status: 'completed', startedAt: 2000, tokenUsage: 300, parentId: 'root' });
    store.recordEdge({ workflowId: 'wf-2', parentId: 'root', childId: 'w1' });

    const snapshot = store.getSnapshot('wf-2');
    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.edges).toHaveLength(1);
    expect(snapshot.totalTokenUsage).toBe(800);
  });

  it('lists workflows with node counts', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-'));
    store = new CallgraphStore(join(tmpDir, 'callgraph.db'));

    store.recordNode({ id: 'a', workflowId: 'wf-1', name: 'a', depth: 0, status: 'completed', startedAt: 1000, tokenUsage: 0 });
    store.recordNode({ id: 'b', workflowId: 'wf-1', name: 'b', depth: 1, status: 'completed', startedAt: 2000, tokenUsage: 0, parentId: 'a' });
    store.recordNode({ id: 'c', workflowId: 'wf-2', name: 'c', depth: 0, status: 'running', startedAt: 3000, tokenUsage: 0 });

    const workflows = store.listWorkflows();
    expect(workflows).toHaveLength(2);
    const wf1 = workflows.find((w) => w.workflowId === 'wf-1');
    expect(wf1?.nodeCount).toBe(2);
  });
});
