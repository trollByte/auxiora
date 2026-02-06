import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WebhookStore } from '../src/store.js';
import type { WebhookDefinition } from '../src/types.js';

function makeWebhook(overrides: Partial<WebhookDefinition> = {}): WebhookDefinition {
  return {
    id: 'wh-1',
    name: 'test-webhook',
    type: 'generic',
    secret: 'test-secret',
    enabled: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('WebhookStore', () => {
  let store: WebhookStore;
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webhook-store-'));
    filePath = path.join(tmpDir, 'webhooks.json');
    store = new WebhookStore(filePath);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should save and retrieve a webhook', async () => {
    const webhook = makeWebhook();
    await store.save(webhook);
    const result = await store.get('wh-1');
    expect(result).toEqual(webhook);
  });

  it('should retrieve by name', async () => {
    await store.save(makeWebhook());
    const result = await store.getByName('test-webhook');
    expect(result?.id).toBe('wh-1');
  });

  it('should reject duplicate names', async () => {
    await store.save(makeWebhook());
    await expect(
      store.save(makeWebhook({ id: 'wh-2', name: 'test-webhook' }))
    ).rejects.toThrow('already exists');
  });

  it('should remove a webhook', async () => {
    await store.save(makeWebhook());
    const removed = await store.remove('wh-1');
    expect(removed).toBe(true);
    expect(await store.get('wh-1')).toBeUndefined();
  });

  it('should list only enabled webhooks', async () => {
    await store.save(makeWebhook({ id: 'wh-1', name: 'enabled', enabled: true }));
    await store.save(makeWebhook({ id: 'wh-2', name: 'disabled', enabled: false }));
    const enabled = await store.listEnabled();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].name).toBe('enabled');
  });
});
