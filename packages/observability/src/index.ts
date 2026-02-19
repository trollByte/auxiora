export type {
  Span,
  SpanContext,
  SpanEvent,
  SpanKind,
  SpanStatus,
  Trace,
} from './types.js';

export { TraceManager } from './trace-manager.js';
export { withTrace, getCurrentContext, getCurrentTraceId } from './trace-context.js';
export { TraceExporter, type TraceSummary } from './trace-exporter.js';

import { TraceManager } from './trace-manager.js';

export const traceManager = new TraceManager();
