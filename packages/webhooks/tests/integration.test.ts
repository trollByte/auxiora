import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { WebhookManager } from '../src/webhook-manager.js';
import { DEFAULT_WEBHOOK_CONFIG } from '../src/types.js';

describe('Webhook integration', () => {
  let manager: WebhookManager;
  let tmpDir: string;
  let mockBehaviorTrigger: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webhook-int-'));
    mockBehaviorTrigger = vi.fn().mockResolvedValue({ success: true });

    manager = new WebhookManager({
      storePath: path.join(tmpDir, 'webhooks.json'),
      config: { ...DEFAULT_WEBHOOK_CONFIG, enabled: true },
      onBehaviorTrigger: mockBehaviorTrigger,
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should handle full create → receive → trigger flow', async () => {
    // 1. Create webhook
    const secret = 'integration-test-secret';
    const webhook = await manager.create({
      name: 'github-push',
      type: 'generic',
      secret,
      behaviorId: 'summarize-commits',
    });
    expect(webhook.name).toBe('github-push');

    // 2. Simulate incoming webhook
    const payload = JSON.stringify({ ref: 'refs/heads/main', commits: [{ message: 'fix bug' }] });
    const body = Buffer.from(payload);
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const result = await manager.handleGenericWebhook('github-push', body, {
      'x-webhook-signature': signature,
    });

    expect(result.accepted).toBe(true);
    expect(result.status).toBe(202);

    // 3. Wait for async behavior trigger
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockBehaviorTrigger).toHaveBeenCalledWith('summarize-commits', payload);
  });

  it('should reject webhook after deletion', async () => {
    const secret = 'temp-secret';
    const webhook = await manager.create({ name: 'temp', type: 'generic', secret });
    await manager.delete(webhook.id);

    const body = Buffer.from('{}');
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const result = await manager.handleGenericWebhook('temp', body, {
      'x-webhook-signature': signature,
    });

    expect(result.accepted).toBe(false);
    expect(result.status).toBe(404);
  });

  it('should handle signature failure with audit trail', async () => {
    await manager.create({ name: 'secure', type: 'generic', secret: 'real-secret' });

    const result = await manager.handleGenericWebhook('secure', Buffer.from('{}'), {
      'x-webhook-signature': 'forged-signature',
    });

    expect(result.accepted).toBe(false);
    expect(result.status).toBe(401);
  });
});
