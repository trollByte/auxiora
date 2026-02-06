import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { WebhookStore } from './store.js';
import type { WebhookDefinition, WebhookConfig } from './types.js';
import { DEFAULT_WEBHOOK_CONFIG } from './types.js';
import { verifyHmacSha256 } from './verify.js';

const logger = getLogger('webhooks:manager');

export interface WebhookManagerOptions {
  storePath: string;
  config?: WebhookConfig;
  onBehaviorTrigger?: (behaviorId: string, payload: string) => Promise<{ success: boolean; error?: string }>;
}

export interface CreateWebhookOptions {
  name: string;
  type: 'channel' | 'generic';
  secret: string;
  channelType?: string;
  behaviorId?: string;
  enabled?: boolean;
}

export interface WebhookResult {
  accepted: boolean;
  status: number;
  error?: string;
}

export class WebhookManager {
  private store: WebhookStore;
  private config: WebhookConfig;
  private behaviorTrigger?: (behaviorId: string, payload: string) => Promise<{ success: boolean; error?: string }>;

  constructor(options: WebhookManagerOptions) {
    this.store = new WebhookStore(options.storePath);
    this.config = options.config ?? DEFAULT_WEBHOOK_CONFIG;
    this.behaviorTrigger = options.onBehaviorTrigger;
  }

  async create(options: CreateWebhookOptions): Promise<WebhookDefinition> {
    const webhook: WebhookDefinition = {
      id: crypto.randomUUID(),
      name: options.name,
      type: options.type,
      secret: options.secret,
      channelType: options.channelType,
      behaviorId: options.behaviorId,
      enabled: options.enabled ?? true,
      createdAt: new Date().toISOString(),
    };

    await this.store.save(webhook);
    void audit('webhook.created', { name: webhook.name, type: webhook.type });
    logger.info('Webhook created', { id: webhook.id, name: webhook.name });
    return webhook;
  }

  async list(): Promise<WebhookDefinition[]> {
    return this.store.getAll();
  }

  async delete(id: string): Promise<boolean> {
    const webhook = await this.store.get(id);
    const removed = await this.store.remove(id);
    if (removed && webhook) {
      void audit('webhook.deleted', { name: webhook.name });
      logger.info('Webhook deleted', { id, name: webhook.name });
    }
    return removed;
  }

  async handleGenericWebhook(
    name: string,
    body: Buffer,
    headers: Record<string, string>
  ): Promise<WebhookResult> {
    // Check payload size
    if (body.length > this.config.maxPayloadSize) {
      logger.warn('Webhook payload too large', { name, size: body.length });
      return { accepted: false, status: 413, error: 'Payload too large' };
    }

    // Find webhook
    const webhook = await this.store.getByName(name);
    if (!webhook || !webhook.enabled) {
      return { accepted: false, status: 404, error: 'Not found' };
    }

    // Verify signature
    const signature = headers[this.config.signatureHeader] ?? '';
    if (!verifyHmacSha256(body, webhook.secret, signature)) {
      void audit('webhook.signature_failed', { name });
      logger.warn('Webhook signature verification failed', { name });
      return { accepted: false, status: 401, error: 'Unauthorized' };
    }

    void audit('webhook.received', {
      name,
      type: webhook.type,
      payloadSize: body.length,
    });

    // Trigger behavior asynchronously
    if (webhook.behaviorId && this.behaviorTrigger) {
      const payload = body.toString('utf-8');
      this.triggerBehavior(webhook.name, webhook.behaviorId, payload);
    }

    return { accepted: true, status: 202 };
  }

  private triggerBehavior(webhookName: string, behaviorId: string, payload: string): void {
    if (!this.behaviorTrigger) return;

    this.behaviorTrigger(behaviorId, payload)
      .then(() => {
        void audit('webhook.triggered', { name: webhookName, behaviorId });
        logger.info('Webhook triggered behavior', { webhookName, behaviorId });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        void audit('webhook.error', { name: webhookName, error: message });
        logger.error('Webhook behavior trigger failed', { error: new Error(message), webhookName, behaviorId });
      });
  }

  setBehaviorTrigger(trigger: (behaviorId: string, payload: string) => Promise<{ success: boolean; error?: string }>): void {
    this.behaviorTrigger = trigger;
  }
}
