import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAwarenessStorage } from '../src/storage.js';

describe('InMemoryAwarenessStorage', () => {
  let storage: InMemoryAwarenessStorage;

  beforeEach(() => {
    storage = new InMemoryAwarenessStorage();
  });

  it('returns null for missing key', async () => {
    expect(await storage.read('ns', 'missing')).toBeNull();
  });

  it('writes and reads data', async () => {
    await storage.write('users', 'user-1', { name: 'Alice' });
    const data = await storage.read('users', 'user-1');
    expect(data).toEqual({ name: 'Alice' });
  });

  it('overwrites existing data', async () => {
    await storage.write('users', 'user-1', { count: 1 });
    await storage.write('users', 'user-1', { count: 2 });
    expect(await storage.read('users', 'user-1')).toEqual({ count: 2 });
  });

  it('isolates namespaces', async () => {
    await storage.write('a', 'key', { from: 'a' });
    await storage.write('b', 'key', { from: 'b' });
    expect(await storage.read('a', 'key')).toEqual({ from: 'a' });
    expect(await storage.read('b', 'key')).toEqual({ from: 'b' });
  });

  it('delete removes key', async () => {
    await storage.write('ns', 'key', { val: 1 });
    await storage.delete('ns', 'key');
    expect(await storage.read('ns', 'key')).toBeNull();
  });

  it('delete on missing key does not throw', async () => {
    await expect(storage.delete('ns', 'nope')).resolves.not.toThrow();
  });
});
