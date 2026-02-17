import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  sessionId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runWithRequestId<T>(requestId: string, fn: () => T | Promise<T>): T | Promise<T> {
  return storage.run({ requestId }, fn);
}
