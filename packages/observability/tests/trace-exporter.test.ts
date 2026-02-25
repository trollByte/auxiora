import { describe, it, expect, beforeEach } from 'vitest';
import { TraceExporter } from '../src/trace-exporter.js';
import { TraceManager } from '../src/trace-manager.js';

describe('TraceExporter', () => {
  let exporter: TraceExporter;
  let manager: TraceManager;

  beforeEach(() => {
    exporter = new TraceExporter();
    manager = new TraceManager();
  });

  describe('toJSON', () => {
    it('serializes a trace to valid JSON', () => {
      const trace = manager.startTrace('test', { env: 'test' });
      manager.endTrace(trace.traceId);

      const json = exporter.toJSON(trace);
      const parsed = JSON.parse(json);

      expect(parsed.traceId).toBe(trace.traceId);
      expect(parsed.rootSpan.name).toBe('test');
      expect(parsed.metadata.env).toBe('test');
    });

    it('includes span events and errors', () => {
      const trace = manager.startTrace('root');
      const span = manager.startSpan(trace.traceId, 'child');
      manager.addEvent(span.context.spanId, 'log', { level: 'info' });
      manager.endSpan(span.context.spanId, 'error', new Error('fail'));
      manager.endTrace(trace.traceId);

      const parsed = JSON.parse(exporter.toJSON(trace));
      const childSpan = parsed.spans.find(
        (s: { name: string }) => s.name === 'child',
      );

      expect(childSpan.events).toHaveLength(1);
      expect(childSpan.events[0].name).toBe('log');
      expect(childSpan.error.message).toBe('fail');
    });
  });

  describe('toOpenTelemetry', () => {
    it('produces OTel-compatible resource spans', () => {
      const trace = manager.startTrace('otel-test', { service: 'auxiora' });
      manager.endTrace(trace.traceId);

      const otel = exporter.toOpenTelemetry(trace) as {
        resourceSpans: Array<{
          resource: { attributes: Array<{ key: string; value: { stringValue: string } }> };
          scopeSpans: Array<{
            scope: { name: string; version: string };
            spans: Array<{
              traceId: string;
              spanId: string;
              name: string;
              kind: number;
              startTimeUnixNano: number;
              status: { code: number };
            }>;
          }>;
        }>;
      };

      expect(otel.resourceSpans).toHaveLength(1);
      const rs = otel.resourceSpans[0];

      // Resource attributes
      expect(rs.resource.attributes).toContainEqual({
        key: 'service',
        value: { stringValue: 'auxiora' },
      });

      // Scope
      const scope = rs.scopeSpans[0];
      expect(scope.scope.name).toBe('auxiora-observability');

      // Span
      const span = scope.spans[0];
      expect(span.traceId).toBe(trace.traceId);
      expect(span.name).toBe('otel-test');
      expect(span.kind).toBe(2); // server
      expect(span.startTimeUnixNano).toBe(trace.startTime * 1_000_000);
    });

    it('maps span kinds correctly', () => {
      const trace = manager.startTrace('root');
      manager.startSpan(trace.traceId, 'client-span', { kind: 'client' });
      manager.startSpan(trace.traceId, 'producer-span', { kind: 'producer' });
      manager.startSpan(trace.traceId, 'consumer-span', { kind: 'consumer' });
      manager.endTrace(trace.traceId);

      const otel = exporter.toOpenTelemetry(trace) as {
        resourceSpans: Array<{
          scopeSpans: Array<{
            spans: Array<{ name: string; kind: number }>;
          }>;
        }>;
      };

      const spans = otel.resourceSpans[0].scopeSpans[0].spans;
      const findKind = (name: string) => spans.find((s) => s.name === name)?.kind;

      expect(findKind('client-span')).toBe(3);
      expect(findKind('producer-span')).toBe(4);
      expect(findKind('consumer-span')).toBe(5);
    });

    it('converts attribute types correctly', () => {
      const trace = manager.startTrace('root');
      manager.startSpan(trace.traceId, 'attrs', {
        attributes: { str: 'hello', int: 42, float: 3.14, bool: true },
      });
      manager.endTrace(trace.traceId);

      const otel = exporter.toOpenTelemetry(trace) as {
        resourceSpans: Array<{
          scopeSpans: Array<{
            spans: Array<{
              attributes: Array<{
                key: string;
                value: Record<string, string | number | boolean>;
              }>;
            }>;
          }>;
        }>;
      };

      const attrs = otel.resourceSpans[0].scopeSpans[0].spans[1].attributes;
      const findAttr = (key: string) => attrs.find((a) => a.key === key)?.value;

      expect(findAttr('str')).toEqual({ stringValue: 'hello' });
      expect(findAttr('int')).toEqual({ intValue: 42 });
      expect(findAttr('float')).toEqual({ doubleValue: 3.14 });
      expect(findAttr('bool')).toEqual({ boolValue: true });
    });
  });

  describe('summary', () => {
    it('returns a correct summary for a clean trace', () => {
      const trace = manager.startTrace('my-operation');
      manager.startSpan(trace.traceId, 'step1');
      manager.startSpan(trace.traceId, 'step2');
      manager.endTrace(trace.traceId);

      const summary = exporter.summary(trace);

      expect(summary.traceId).toBe(trace.traceId);
      expect(summary.name).toBe('my-operation');
      expect(summary.spanCount).toBe(3);
      expect(summary.duration).toBeGreaterThanOrEqual(0);
      expect(summary.hasErrors).toBe(false);
      expect(summary.errorCount).toBe(0);
    });

    it('counts errors correctly', () => {
      const trace = manager.startTrace('root');
      const s1 = manager.startSpan(trace.traceId, 'fail1');
      manager.endSpan(s1.context.spanId, 'error', new Error('e1'));
      const s2 = manager.startSpan(trace.traceId, 'fail2');
      manager.endSpan(s2.context.spanId, 'error', new Error('e2'));
      manager.startSpan(trace.traceId, 'ok');
      manager.endTrace(trace.traceId);

      const summary = exporter.summary(trace);

      expect(summary.hasErrors).toBe(true);
      expect(summary.errorCount).toBe(2);
    });

    it('computes duration from endTime when available', () => {
      const trace = manager.startTrace('root');
      manager.endTrace(trace.traceId);

      const summary = exporter.summary(trace);

      expect(summary.duration).toBe(trace.endTime! - trace.startTime);
    });
  });
});
