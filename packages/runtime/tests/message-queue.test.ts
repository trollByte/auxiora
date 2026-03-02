import { describe, it, expect, beforeEach } from 'vitest';

// Minimal types matching the runtime's internal structures
interface PendingMessage {
  content: string;
  enqueuedAt: number;
  inbound?: { channelType: string; channelId: string; senderId: string; content: string; id: string };
}

interface SessionRunState {
  running: boolean;
  queue: PendingMessage[];
  lastRunStartedAt: number;
}

// Extract the pure logic for unit testing
function acquireSessionRun(states: Map<string, SessionRunState>, sessionId: string): boolean {
  let state = states.get(sessionId);
  if (!state) {
    state = { running: false, queue: [], lastRunStartedAt: 0 };
    states.set(sessionId, state);
  }
  if (state.running) return false;
  state.running = true;
  state.lastRunStartedAt = Date.now();
  return true;
}

function releaseSessionRun(states: Map<string, SessionRunState>, sessionId: string): void {
  const state = states.get(sessionId);
  if (state) state.running = false;
}

function enqueueMessage(
  states: Map<string, SessionRunState>,
  sessionId: string,
  pending: PendingMessage,
  cap: number = 20,
): { dropped?: PendingMessage } {
  let state = states.get(sessionId);
  if (!state) {
    state = { running: false, queue: [], lastRunStartedAt: 0 };
    states.set(sessionId, state);
  }
  state.queue.push(pending);
  if (state.queue.length > cap) {
    return { dropped: state.queue.shift() };
  }
  return {};
}

describe('Message Queue State Management', () => {
  let states: Map<string, SessionRunState>;

  beforeEach(() => {
    states = new Map();
  });

  describe('acquireSessionRun', () => {
    it('should acquire lock on first call', () => {
      expect(acquireSessionRun(states, 'sess-1')).toBe(true);
      const state = states.get('sess-1')!;
      expect(state.running).toBe(true);
      expect(state.lastRunStartedAt).toBeGreaterThan(0);
    });

    it('should reject second acquire on same session', () => {
      acquireSessionRun(states, 'sess-1');
      expect(acquireSessionRun(states, 'sess-1')).toBe(false);
    });

    it('should allow acquire on different session', () => {
      acquireSessionRun(states, 'sess-1');
      expect(acquireSessionRun(states, 'sess-2')).toBe(true);
    });

    it('should allow re-acquire after release', () => {
      acquireSessionRun(states, 'sess-1');
      releaseSessionRun(states, 'sess-1');
      expect(acquireSessionRun(states, 'sess-1')).toBe(true);
    });
  });

  describe('releaseSessionRun', () => {
    it('should release the lock', () => {
      acquireSessionRun(states, 'sess-1');
      releaseSessionRun(states, 'sess-1');
      expect(states.get('sess-1')!.running).toBe(false);
    });

    it('should be a no-op for unknown session', () => {
      expect(() => releaseSessionRun(states, 'unknown')).not.toThrow();
    });
  });

  describe('enqueueMessage', () => {
    it('should add message to queue', () => {
      const pending: PendingMessage = { content: 'Hello', enqueuedAt: Date.now() };
      enqueueMessage(states, 'sess-1', pending);
      expect(states.get('sess-1')!.queue).toHaveLength(1);
      expect(states.get('sess-1')!.queue[0].content).toBe('Hello');
    });

    it('should preserve order', () => {
      enqueueMessage(states, 'sess-1', { content: 'First', enqueuedAt: 1 });
      enqueueMessage(states, 'sess-1', { content: 'Second', enqueuedAt: 2 });
      enqueueMessage(states, 'sess-1', { content: 'Third', enqueuedAt: 3 });
      const queue = states.get('sess-1')!.queue;
      expect(queue.map(m => m.content)).toEqual(['First', 'Second', 'Third']);
    });

    it('should drop oldest on overflow', () => {
      for (let i = 0; i < 3; i++) {
        enqueueMessage(states, 'sess-1', { content: `msg-${i}`, enqueuedAt: i }, 3);
      }
      const result = enqueueMessage(states, 'sess-1', { content: 'overflow', enqueuedAt: 4 }, 3);
      expect(result.dropped?.content).toBe('msg-0');
      const queue = states.get('sess-1')!.queue;
      expect(queue).toHaveLength(3);
      expect(queue[0].content).toBe('msg-1');
      expect(queue[2].content).toBe('overflow');
    });

    it('should isolate queues per session', () => {
      enqueueMessage(states, 'sess-1', { content: 'A', enqueuedAt: 1 });
      enqueueMessage(states, 'sess-2', { content: 'B', enqueuedAt: 2 });
      expect(states.get('sess-1')!.queue).toHaveLength(1);
      expect(states.get('sess-2')!.queue).toHaveLength(1);
    });
  });

  describe('integration scenario', () => {
    it('should queue messages while running and process after release', () => {
      expect(acquireSessionRun(states, 'sess-1')).toBe(true);
      expect(acquireSessionRun(states, 'sess-1')).toBe(false);
      enqueueMessage(states, 'sess-1', { content: 'Follow-up 1', enqueuedAt: 1 });
      expect(acquireSessionRun(states, 'sess-1')).toBe(false);
      enqueueMessage(states, 'sess-1', { content: 'Follow-up 2', enqueuedAt: 2 });

      const state = states.get('sess-1')!;
      expect(state.queue).toHaveLength(2);

      const first = state.queue.shift()!;
      expect(first.content).toBe('Follow-up 1');
      const second = state.queue.shift()!;
      expect(second.content).toBe('Follow-up 2');

      releaseSessionRun(states, 'sess-1');
      expect(state.running).toBe(false);
      expect(state.queue).toHaveLength(0);
    });
  });
});
