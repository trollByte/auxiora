import type { Span, Trace } from './types.js';

export interface TraceSummary {
  traceId: string;
  name: string;
  spanCount: number;
  duration: number;
  hasErrors: boolean;
  errorCount: number;
}

export class TraceExporter {
  toJSON(trace: Trace): string {
    return JSON.stringify(trace);
  }

  toOpenTelemetry(trace: Trace): object {
    return {
      resourceSpans: [
        {
          resource: {
            attributes: Object.entries(trace.metadata).map(([key, value]) => ({
              key,
              value: { stringValue: value },
            })),
          },
          scopeSpans: [
            {
              scope: { name: 'auxiora-observability', version: '1.0.0' },
              spans: trace.spans.map((span) => this.spanToOTel(span)),
            },
          ],
        },
      ],
    };
  }

  summary(trace: Trace): TraceSummary {
    const errorCount = trace.spans.filter((s) => s.status === 'error').length;
    const endTime = trace.endTime ?? Date.now();

    return {
      traceId: trace.traceId,
      name: trace.rootSpan.name,
      spanCount: trace.spans.length,
      duration: endTime - trace.startTime,
      hasErrors: errorCount > 0,
      errorCount,
    };
  }

  private spanToOTel(span: Span): object {
    const kindMap: Record<string, number> = {
      internal: 1,
      server: 2,
      client: 3,
      producer: 4,
      consumer: 5,
    };

    const statusMap: Record<string, number> = {
      unset: 0,
      ok: 1,
      error: 2,
    };

    return {
      traceId: span.context.traceId,
      spanId: span.context.spanId,
      parentSpanId: span.context.parentSpanId ?? '',
      name: span.name,
      kind: kindMap[span.kind] ?? 1,
      startTimeUnixNano: span.startTime * 1_000_000,
      endTimeUnixNano: (span.endTime ?? 0) * 1_000_000,
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: this.toOTelValue(value),
      })),
      events: span.events.map((e) => ({
        name: e.name,
        timeUnixNano: e.timestamp * 1_000_000,
        attributes: e.attributes
          ? Object.entries(e.attributes).map(([key, value]) => ({
              key,
              value: this.toOTelValue(value),
            }))
          : [],
      })),
      status: {
        code: statusMap[span.status] ?? 0,
        message: span.error?.message ?? '',
      },
    };
  }

  private toOTelValue(
    value: string | number | boolean,
  ): Record<string, string | number | boolean> {
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') {
      return Number.isInteger(value)
        ? { intValue: value }
        : { doubleValue: value };
    }
    return { boolValue: value };
  }
}
