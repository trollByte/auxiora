import type { AwarenessStorage } from './types.js';

export class InMemoryAwarenessStorage implements AwarenessStorage {
  private data = new Map<string, Record<string, unknown>>();

  private key(namespace: string, key: string): string {
    return `${namespace}::${key}`;
  }

  async read(namespace: string, key: string): Promise<Record<string, unknown> | null> {
    return this.data.get(this.key(namespace, key)) ?? null;
  }

  async write(namespace: string, key: string, data: Record<string, unknown>): Promise<void> {
    this.data.set(this.key(namespace, key), data);
  }

  async delete(namespace: string, key: string): Promise<void> {
    this.data.delete(this.key(namespace, key));
  }
}
