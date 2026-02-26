import { describe, it, expect, afterEach } from 'vitest';
import { EventStore } from '../src/event-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('EventStore', () => {
  let store: EventStore;
  let tmpDir: string;

  afterEach(() => {
    store?.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and retrieves events', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ebs-'));
    store = new EventStore(join(tmpDir, 'events.db'));

    store.record({ topic: 'agent.started', agentId: 'a1', payload: { name: 'coder' }, timestamp: 1000 });
    store.record({ topic: 'agent.completed', agentId: 'a1', payload: { result: 'done' }, timestamp: 2000 });

    const events = store.getByAgent('a1');
    expect(events).toHaveLength(2);
    expect(events[0].topic).toBe('agent.started');
    expect(events[1].topic).toBe('agent.completed');
  });

  it('filters by topic prefix', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ebs-'));
    store = new EventStore(join(tmpDir, 'events.db'));

    store.record({ topic: 'agent.started', agentId: 'a1', payload: {}, timestamp: 1000 });
    store.record({ topic: 'workflow.started', agentId: 'w1', payload: {}, timestamp: 2000 });
    store.record({ topic: 'agent.completed', agentId: 'a1', payload: {}, timestamp: 3000 });

    const agentEvents = store.getByTopicPrefix('agent.');
    expect(agentEvents).toHaveLength(2);
  });

  it('retrieves recent events with limit', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ebs-'));
    store = new EventStore(join(tmpDir, 'events.db'));

    for (let i = 0; i < 10; i++) {
      store.record({ topic: 'tick', agentId: 'a1', payload: { i }, timestamp: i * 1000 });
    }

    const recent = store.getRecent(3);
    expect(recent).toHaveLength(3);
    expect((recent[0].payload as Record<string, number>).i).toBe(9);
  });

  it('counts events by topic', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ebs-'));
    store = new EventStore(join(tmpDir, 'events.db'));

    store.record({ topic: 'agent.started', agentId: 'a1', payload: {}, timestamp: 1000 });
    store.record({ topic: 'agent.started', agentId: 'a2', payload: {}, timestamp: 2000 });
    store.record({ topic: 'agent.completed', agentId: 'a1', payload: {}, timestamp: 3000 });

    const counts = store.countByTopic();
    expect(counts).toContainEqual({ topic: 'agent.started', count: 2 });
    expect(counts).toContainEqual({ topic: 'agent.completed', count: 1 });
  });
});
