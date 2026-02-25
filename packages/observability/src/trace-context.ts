import { AsyncLocalStorage } from 'node:async_hooks';
import type { SpanContext } from './types.js';

const storage = new AsyncLocalStorage<SpanContext>();

export async function withTrace<T>(
  traceId: string,
  spanId: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const context: SpanContext = { traceId, spanId };
  return storage.run(context, fn);
}

export function getCurrentContext(): SpanContext | undefined {
  return storage.getStore();
}

export function getCurrentTraceId(): string | undefined {
  return storage.getStore()?.traceId;
}
