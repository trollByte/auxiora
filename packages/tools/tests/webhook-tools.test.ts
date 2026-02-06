/**
 * Tests for webhook tools
 *
 * Validates:
 * - List all webhooks
 * - Create a webhook
 * - Delete a webhook
 * - Error when deleting non-existent webhook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WebhookListTool,
  WebhookCreateTool,
  WebhookDeleteTool,
  setWebhookManager,
} from '../src/webhooks.js';

// ─── Mock WebhookManager ─────────────────────────────────────────────────────

function createMockManager() {
  const store = new Map<string, any>();

  return {
    list: vi.fn(async () => Array.from(store.values())),
    create: vi.fn(async (input: any) => {
      const webhook = {
        name: input.name,
        url: `/webhooks/${input.name}`,
        secret: input.secret,
        behaviorId: input.behaviorId,
      };
      store.set(input.name, webhook);
      return webhook;
    }),
    delete: vi.fn(async (name: string) => {
      if (!store.has(name)) return false;
      store.delete(name);
      return true;
    }),
  };
}

describe('Webhook Tools', () => {
  let mockManager: ReturnType<typeof createMockManager>;

  beforeEach(() => {
    mockManager = createMockManager();
    setWebhookManager(mockManager);
  });

  // ─── 1. List webhooks ──────────────────────────────────────────────────

  it('should list all registered webhooks', async () => {
    // Seed two webhooks
    await mockManager.create({ name: 'deploy', secret: 's1', behaviorId: 'bh_1' });
    await mockManager.create({ name: 'ci', secret: 's2', behaviorId: 'bh_2' });

    const result = await WebhookListTool.execute({}, {});

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output!);
    expect(output).toHaveLength(2);
    expect(mockManager.list).toHaveBeenCalled();
  });

  // ─── 2. Create a webhook ──────────────────────────────────────────────

  it('should create a webhook', async () => {
    const result = await WebhookCreateTool.execute(
      { name: 'my-hook', secret: 'supersecret', behaviorId: 'bh_abc' },
      {}
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output!);
    expect(output.name).toBe('my-hook');
    expect(output.behaviorId).toBe('bh_abc');
    expect(output.url).toBe('/webhooks/my-hook');
    expect(output.message).toContain('my-hook');
    expect(mockManager.create).toHaveBeenCalledWith({
      name: 'my-hook',
      secret: 'supersecret',
      behaviorId: 'bh_abc',
    });
  });

  // ─── 3. Delete a webhook ──────────────────────────────────────────────

  it('should delete an existing webhook', async () => {
    // Seed a webhook first
    await mockManager.create({ name: 'to-delete', secret: 's', behaviorId: 'bh_1' });

    const result = await WebhookDeleteTool.execute({ name: 'to-delete' }, {});

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output!);
    expect(output.name).toBe('to-delete');
    expect(output.message).toContain('to-delete');
    expect(mockManager.delete).toHaveBeenCalledWith('to-delete');
  });

  // ─── 4. Error when deleting non-existent webhook ──────────────────────

  it('should return error when deleting a non-existent webhook', async () => {
    const result = await WebhookDeleteTool.execute({ name: 'does-not-exist' }, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Webhook not found');
    expect(result.error).toContain('does-not-exist');
  });
});
