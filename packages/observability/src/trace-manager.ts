import crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import type { Span, SpanContext, SpanKind, SpanStatus, Trace } from './types.js';

const logger = getLogger('observability:trace-manager');

const MAX_TRACES = 1000;

export class TraceManager {
  private traces = new Map<string, Trace>();
  private activeSpans = new Map<string, Span>();
  private traceOrder: string[] = [];

  startTrace(name: string, metadata?: Record<string, string>): Trace {
    const traceId = crypto.randomBytes(16).toString('hex');
    const spanId = crypto.randomBytes(8).toString('hex');
    const now = Date.now();

    const rootSpan: Span = {
      context: { traceId, spanId },
      name,
      kind: 'server',
      status: 'unset',
      startTime: now,
      attributes: {},
      events: [],
    };

    const trace: Trace = {
      traceId,
      rootSpan,
      spans: [rootSpan],
      startTime: now,
      metadata: metadata ?? {},
    };

    this.evictIfNeeded();
    this.traces.set(traceId, trace);
    this.traceOrder.push(traceId);
    this.activeSpans.set(spanId, rootSpan);

    logger.debug('Trace started', { traceId, name });
    return trace;
  }

  startSpan(
    traceId: string,
    name: string,
    opts?: {
      kind?: SpanKind;
      parentSpanId?: string;
      attributes?: Record<string, string | number | boolean>;
    },
  ): Span {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`Trace not found: ${traceId}`);
    }

    const spanId = crypto.randomBytes(8).toString('hex');
    const parentSpanId = opts?.parentSpanId ?? trace.rootSpan.context.spanId;

    const context: SpanContext = { traceId, spanId, parentSpanId };

    const span: Span = {
      context,
      name,
      kind: opts?.kind ?? 'internal',
      status: 'unset',
      startTime: Date.now(),
      attributes: opts?.attributes ?? {},
      events: [],
    };

    trace.spans.push(span);
    this.activeSpans.set(spanId, span);

    logger.debug('Span started', { traceId, spanId, name });
    return span;
  }

  endSpan(spanId: string, status?: SpanStatus, error?: Error): void {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      throw new Error(`Active span not found: ${spanId}`);
    }

    span.endTime = Date.now();
    span.status = status ?? 'ok';

    if (error) {
      span.status = 'error';
      span.error = { message: error.message, stack: error.stack };
    }

    this.activeSpans.delete(spanId);
    logger.debug('Span ended', { spanId, status: span.status });
  }

  addEvent(
    spanId: string,
    name: string,
    attributes?: Record<string, string | number | boolean>,
  ): void {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      throw new Error(`Active span not found: ${spanId}`);
    }

    span.events.push({ name, timestamp: Date.now(), attributes });
  }

  endTrace(traceId: string): Trace {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`Trace not found: ${traceId}`);
    }

    // End any remaining active spans belonging to this trace
    for (const span of trace.spans) {
      if (!span.endTime) {
        span.endTime = Date.now();
        span.status = span.status === 'unset' ? 'ok' : span.status;
        this.activeSpans.delete(span.context.spanId);
      }
    }

    trace.endTime = Date.now();
    logger.debug('Trace ended', { traceId });
    return trace;
  }

  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  listTraces(limit = 50, offset = 0): Trace[] {
    const ordered = [...this.traceOrder].reverse();
    const slice = ordered.slice(offset, offset + limit);
    return slice
      .map((id) => this.traces.get(id))
      .filter((t): t is Trace => t !== undefined);
  }

  getActiveSpans(): Span[] {
    return [...this.activeSpans.values()];
  }

  private evictIfNeeded(): void {
    while (this.traces.size >= MAX_TRACES) {
      const oldest = this.traceOrder.shift();
      if (oldest) {
        const trace = this.traces.get(oldest);
        if (trace) {
          for (const span of trace.spans) {
            this.activeSpans.delete(span.context.spanId);
          }
        }
        this.traces.delete(oldest);
        logger.debug('Evicted trace', { traceId: oldest });
      }
    }
  }
}
