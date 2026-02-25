import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { WebhookManager } from '../src/webhook-manager.js';
import type { WebhookDefinition } from '../src/types.js';
import { DEFAULT_WEBHOOK_CONFIG } from '../src/types.js';

function makeWebhook(overrides: Partial<WebhookDefinition> = {}): WebhookDefinition {
  return {
    id: 'wh-1',
    name: 'test-hook',
    type: 'generic',
    secret: 'test-secret-key',
    behaviorId: 'beh-1',
    enabled: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('WebhookManager', () => {
  let manager: WebhookManager;
  let tmpDir: string;
  let filePath: string;
  let mockBehaviorTrigger: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webhook-mgr-'));
    filePath = path.join(tmpDir, 'webhooks.json');
    mockBehaviorTrigger = vi.fn().mockResolvedValue({ success: true });

    manager = new WebhookManager({
      storePath: filePath,
      config: { ...DEFAULT_WEBHOOK_CONFIG, enabled: true },
      onBehaviorTrigger: mockBehaviorTrigger,
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('webhook CRUD', () => {
    it('should create a webhook', async () => {
      const webhook = await manager.create({
        name: 'github-push',
        type: 'generic',
        secret: 'my-secret',
        behaviorId: 'beh-1',
      });
      expect(webhook.id).toBeDefined();
      expect(webhook.name).toBe('github-push');
      expect(webhook.enabled).toBe(true);
    });

    it('should list all webhooks', async () => {
      await manager.create({ name: 'hook-1', type: 'generic', secret: 's1' });
      await manager.create({ name: 'hook-2', type: 'generic', secret: 's2' });
      const all = await manager.list();
      expect(all).toHaveLength(2);
    });

    it('should update a webhook', async () => {
      const wh = await manager.create({ name: 'original', type: 'generic', secret: 's' });
      const updated = await manager.update(wh.id, { name: 'renamed', enabled: false });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('renamed');
      expect(updated!.enabled).toBe(false);

      const all = await manager.list();
      expect(all[0].name).toBe('renamed');
    });

    it('should return null when updating non-existent webhook', async () => {
      const result = await manager.update('nonexistent', { name: 'test' });
      expect(result).toBeNull();
    });

    it('should delete a webhook', async () => {
      const wh = await manager.create({ name: 'to-delete', type: 'generic', secret: 's' });
      const deleted = await manager.delete(wh.id);
      expect(deleted).toBe(true);
      const all = await manager.list();
      expect(all).toHaveLength(0);
    });
  });

  describe('generic webhook handling', () => {
    it('should verify signature and trigger behavior', async () => {
      const secret = 'my-secret';
      await manager.create({ name: 'test', type: 'generic', secret, behaviorId: 'beh-1' });

      const body = Buffer.from('{"event":"push"}');
      const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

      const result = await manager.handleGenericWebhook('test', body, {
        'x-webhook-signature': signature,
      });

      expect(result.accepted).toBe(true);
      expect(mockBehaviorTrigger).toHaveBeenCalledWith('beh-1', expect.stringContaining('push'));
    });

    it('should reject invalid signature', async () => {
      await manager.create({ name: 'test', type: 'generic', secret: 'real-secret' });

      const body = Buffer.from('{}');
      const result = await manager.handleGenericWebhook('test', body, {
        'x-webhook-signature': 'bad-sig',
      });

      expect(result.accepted).toBe(false);
      expect(result.status).toBe(401);
    });

    it('should reject unknown webhook name', async () => {
      const result = await manager.handleGenericWebhook('nonexistent', Buffer.from('{}'), {});
      expect(result.accepted).toBe(false);
      expect(result.status).toBe(404);
    });

    it('should reject disabled webhook', async () => {
      const wh = await manager.create({ name: 'disabled', type: 'generic', secret: 's', enabled: false });

      const result = await manager.handleGenericWebhook('disabled', Buffer.from('{}'), {});
      expect(result.accepted).toBe(false);
      expect(result.status).toBe(404);
    });

    it('should handle missing behavior gracefully', async () => {
      mockBehaviorTrigger.mockRejectedValueOnce(new Error('Behavior not found'));
      const secret = 'my-secret';
      await manager.create({ name: 'orphan', type: 'generic', secret, behaviorId: 'missing' });

      const body = Buffer.from('{}');
      const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

      const result = await manager.handleGenericWebhook('orphan', body, {
        'x-webhook-signature': signature,
      });

      // Still accepted (202) — don't leak internal state
      expect(result.accepted).toBe(true);
    });
  });

  describe('payload size', () => {
    it('should reject oversized payloads', async () => {
      await manager.create({ name: 'test', type: 'generic', secret: 's' });
      const oversized = Buffer.alloc(DEFAULT_WEBHOOK_CONFIG.maxPayloadSize + 1);

      const result = await manager.handleGenericWebhook('test', oversized, {});
      expect(result.accepted).toBe(false);
      expect(result.status).toBe(413);
    });
  });
});
