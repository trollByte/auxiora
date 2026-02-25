import { describe, it, expect, beforeEach } from 'vitest';
import { TraceManager } from '../src/trace-manager.js';

describe('TraceManager', () => {
  let manager: TraceManager;

  beforeEach(() => {
    manager = new TraceManager();
  });

  describe('startTrace', () => {
    it('creates a trace with a root span', () => {
      const trace = manager.startTrace('test-trace');

      expect(trace.traceId).toHaveLength(32);
      expect(trace.rootSpan.context.traceId).toBe(trace.traceId);
      expect(trace.rootSpan.context.spanId).toHaveLength(16);
      expect(trace.rootSpan.name).toBe('test-trace');
      expect(trace.rootSpan.kind).toBe('server');
      expect(trace.rootSpan.status).toBe('unset');
      expect(trace.spans).toHaveLength(1);
      expect(trace.startTime).toBeGreaterThan(0);
    });

    it('stores metadata', () => {
      const trace = manager.startTrace('test', { env: 'test', version: '1.0' });

      expect(trace.metadata).toEqual({ env: 'test', version: '1.0' });
    });

    it('generates unique trace IDs', () => {
      const t1 = manager.startTrace('a');
      const t2 = manager.startTrace('b');

      expect(t1.traceId).not.toBe(t2.traceId);
    });
  });

  describe('startSpan', () => {
    it('creates a child span under the root', () => {
      const trace = manager.startTrace('root');
      const span = manager.startSpan(trace.traceId, 'child');

      expect(span.context.traceId).toBe(trace.traceId);
      expect(span.context.parentSpanId).toBe(trace.rootSpan.context.spanId);
      expect(span.name).toBe('child');
      expect(span.kind).toBe('internal');
      expect(trace.spans).toHaveLength(2);
    });

    it('respects custom kind and attributes', () => {
      const trace = manager.startTrace('root');
      const span = manager.startSpan(trace.traceId, 'db-query', {
        kind: 'client',
        attributes: { 'db.system': 'postgres', 'db.operation': 'SELECT' },
      });

      expect(span.kind).toBe('client');
      expect(span.attributes).toEqual({
        'db.system': 'postgres',
        'db.operation': 'SELECT',
      });
    });

    it('supports explicit parent span ID', () => {
      const trace = manager.startTrace('root');
      const child = manager.startSpan(trace.traceId, 'child');
      const grandchild = manager.startSpan(trace.traceId, 'grandchild', {
        parentSpanId: child.context.spanId,
      });

      expect(grandchild.context.parentSpanId).toBe(child.context.spanId);
      expect(trace.spans).toHaveLength(3);
    });

    it('throws for unknown trace', () => {
      expect(() => manager.startSpan('nonexistent', 'span')).toThrow(
        'Trace not found: nonexistent',
      );
    });
  });

  describe('endSpan', () => {
    it('ends a span with ok status by default', () => {
      const trace = manager.startTrace('root');
      const span = manager.startSpan(trace.traceId, 'child');
      manager.endSpan(span.context.spanId);

      expect(span.status).toBe('ok');
      expect(span.endTime).toBeGreaterThan(0);
    });

    it('ends a span with explicit status', () => {
      const trace = manager.startTrace('root');
      const span = manager.startSpan(trace.traceId, 'child');
      manager.endSpan(span.context.spanId, 'error');

      expect(span.status).toBe('error');
    });

    it('records error details', () => {
      const trace = manager.startTrace('root');
      const span = manager.startSpan(trace.traceId, 'child');
      const error = new Error('something broke');
      manager.endSpan(span.context.spanId, undefined, error);

      expect(span.status).toBe('error');
      expect(span.error?.message).toBe('something broke');
      expect(span.error?.stack).toBeDefined();
    });

    it('removes span from active spans', () => {
      const trace = manager.startTrace('root');
      const span = manager.startSpan(trace.traceId, 'child');

      expect(manager.getActiveSpans()).toHaveLength(2);
      manager.endSpan(span.context.spanId);
      expect(manager.getActiveSpans()).toHaveLength(1);
    });

    it('throws for unknown span', () => {
      expect(() => manager.endSpan('nonexistent')).toThrow(
        'Active span not found: nonexistent',
      );
    });
  });

  describe('addEvent', () => {
    it('adds an event to an active span', () => {
      const trace = manager.startTrace('root');
      const span = manager.startSpan(trace.traceId, 'child');
      manager.addEvent(span.context.spanId, 'cache.hit', { key: 'user:123' });

      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe('cache.hit');
      expect(span.events[0].attributes).toEqual({ key: 'user:123' });
      expect(span.events[0].timestamp).toBeGreaterThan(0);
    });

    it('throws for unknown span', () => {
      expect(() => manager.addEvent('nonexistent', 'event')).toThrow(
        'Active span not found: nonexistent',
      );
    });
  });

  describe('endTrace', () => {
    it('ends the trace and all active spans', () => {
      const trace = manager.startTrace('root');
      manager.startSpan(trace.traceId, 'child1');
      manager.startSpan(trace.traceId, 'child2');

      const completed = manager.endTrace(trace.traceId);

      expect(completed.endTime).toBeGreaterThan(0);
      for (const span of completed.spans) {
        expect(span.endTime).toBeGreaterThan(0);
      }
      expect(manager.getActiveSpans()).toHaveLength(0);
    });

    it('throws for unknown trace', () => {
      expect(() => manager.endTrace('nonexistent')).toThrow(
        'Trace not found: nonexistent',
      );
    });
  });

  describe('getTrace', () => {
    it('returns a trace by ID', () => {
      const trace = manager.startTrace('root');
      expect(manager.getTrace(trace.traceId)).toBe(trace);
    });

    it('returns undefined for unknown trace', () => {
      expect(manager.getTrace('nonexistent')).toBeUndefined();
    });
  });

  describe('listTraces', () => {
    it('returns traces newest-first', () => {
      const t1 = manager.startTrace('first');
      const t2 = manager.startTrace('second');
      const t3 = manager.startTrace('third');

      const list = manager.listTraces();

      expect(list[0].traceId).toBe(t3.traceId);
      expect(list[1].traceId).toBe(t2.traceId);
      expect(list[2].traceId).toBe(t1.traceId);
    });

    it('supports limit and offset', () => {
      manager.startTrace('a');
      const t2 = manager.startTrace('b');
      manager.startTrace('c');

      const list = manager.listTraces(1, 1);

      expect(list).toHaveLength(1);
      expect(list[0].traceId).toBe(t2.traceId);
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest traces when exceeding capacity', () => {
      const firstTrace = manager.startTrace('first');

      for (let i = 0; i < 999; i++) {
        manager.startTrace(`trace-${i}`);
      }

      // At capacity (1000), adding one more should evict the oldest
      manager.startTrace('overflow');

      expect(manager.getTrace(firstTrace.traceId)).toBeUndefined();
      expect(manager.listTraces(1100)).toHaveLength(1000);
    });
  });

  describe('getActiveSpans', () => {
    it('returns only spans that have not been ended', () => {
      const trace = manager.startTrace('root');
      const span = manager.startSpan(trace.traceId, 'child');

      expect(manager.getActiveSpans()).toHaveLength(2);

      manager.endSpan(span.context.spanId);
      const active = manager.getActiveSpans();

      expect(active).toHaveLength(1);
      expect(active[0].context.spanId).toBe(trace.rootSpan.context.spanId);
    });
  });
});
