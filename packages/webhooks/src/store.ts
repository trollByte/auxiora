import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getLogger } from '@auxiora/logger';
import type { WebhookDefinition } from './types.js';

const logger = getLogger('webhooks:store');

export class WebhookStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async save(webhook: WebhookDefinition): Promise<void> {
    const webhooks = await this.readFile();
    const existing = webhooks.find((w) => w.name === webhook.name && w.id !== webhook.id);
    if (existing) {
      throw new Error(`Webhook with name '${webhook.name}' already exists`);
    }

    const index = webhooks.findIndex((w) => w.id === webhook.id);
    if (index >= 0) {
      webhooks[index] = webhook;
    } else {
      webhooks.push(webhook);
    }

    await this.writeFile(webhooks);
    logger.debug('Saved webhook', { id: webhook.id, name: webhook.name });
  }

  async get(id: string): Promise<WebhookDefinition | undefined> {
    const webhooks = await this.readFile();
    return webhooks.find((w) => w.id === id);
  }

  async getByName(name: string): Promise<WebhookDefinition | undefined> {
    const webhooks = await this.readFile();
    return webhooks.find((w) => w.name === name);
  }

  async getAll(): Promise<WebhookDefinition[]> {
    return this.readFile();
  }

  async listEnabled(): Promise<WebhookDefinition[]> {
    const webhooks = await this.readFile();
    return webhooks.filter((w) => w.enabled);
  }

  async remove(id: string): Promise<boolean> {
    const webhooks = await this.readFile();
    const filtered = webhooks.filter((w) => w.id !== id);
    if (filtered.length === webhooks.length) return false;
    await this.writeFile(filtered);
    logger.debug('Removed webhook', { id });
    return true;
  }

  private async readFile(): Promise<WebhookDefinition[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as WebhookDefinition[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFile(webhooks: WebhookDefinition[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(webhooks, null, 2), 'utf-8');
  }
}
