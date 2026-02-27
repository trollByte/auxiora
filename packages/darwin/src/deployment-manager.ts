import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Variant, DeployClass, PluginLoaderLike, EventBusLike, Niche } from './types.js';

export interface DeploymentManagerOptions {
  darwinDir: string;
  pluginLoader?: PluginLoaderLike;
  eventBus?: EventBusLike;
}

export interface DeployResult {
  deployed: boolean;
  method: 'auto' | 'queued';
  approvalRequired?: boolean;
  path?: string;
}

interface PendingApproval {
  variantId: string;
  variant: Variant;
  stagedPath: string;
  queuedAt: number;
}

export class DeploymentManager {
  private readonly darwinDir: string;
  private readonly pluginLoader?: PluginLoaderLike;
  private readonly eventBus?: EventBusLike;
  private readonly pending = new Map<string, PendingApproval>();

  constructor(options: DeploymentManagerOptions) {
    this.darwinDir = options.darwinDir;
    this.pluginLoader = options.pluginLoader;
    this.eventBus = options.eventBus;

    mkdirSync(join(this.darwinDir, 'prompts'), { recursive: true });
    mkdirSync(join(this.darwinDir, 'skills'), { recursive: true });
    mkdirSync(join(this.darwinDir, 'config'), { recursive: true });
  }

  classify(variant: Variant): DeployClass {
    if (variant.type === 'prompt' || variant.type === 'config') {
      return 'minor';
    }
    return 'major';
  }

  async deploy(variant: Variant): Promise<DeployResult> {
    const deployClass = this.classify(variant);

    if (deployClass === 'minor' && variant.type === 'prompt') {
      const niche = (variant.metadata.niche as Niche) ?? { domain: 'general', complexity: 'simple' };
      const fileName = `${niche.domain}-${niche.complexity}.txt`;
      const filePath = join(this.darwinDir, 'prompts', fileName);
      writeFileSync(filePath, variant.content, 'utf-8');
      this.eventBus?.publish({
        topic: 'darwin.deployed',
        data: { variantId: variant.id, type: variant.type, path: filePath },
      });
      return { deployed: true, method: 'auto', path: filePath };
    }

    if (deployClass === 'minor' && variant.type === 'config') {
      const filePath = join(this.darwinDir, 'config', `${variant.id}.json`);
      writeFileSync(filePath, variant.content, 'utf-8');
      this.eventBus?.publish({
        topic: 'darwin.deployed',
        data: { variantId: variant.id, type: variant.type, path: filePath },
      });
      return { deployed: true, method: 'auto', path: filePath };
    }

    // major — stage skill and queue for approval
    const stagedPath = join(this.darwinDir, 'skills', `${variant.id}.ts`);
    writeFileSync(stagedPath, variant.content, 'utf-8');
    this.pending.set(variant.id, {
      variantId: variant.id,
      variant,
      stagedPath,
      queuedAt: Date.now(),
    });
    return { deployed: false, method: 'queued', approvalRequired: true };
  }

  async approve(variantId: string): Promise<boolean> {
    const entry = this.pending.get(variantId);
    if (!entry) return false;

    if (this.pluginLoader) {
      await this.pluginLoader.loadSingle(entry.stagedPath);
    }

    this.pending.delete(variantId);
    this.eventBus?.publish({
      topic: 'darwin.deployed',
      data: { variantId, type: 'skill', path: entry.stagedPath, approved: true },
    });
    return true;
  }

  reject(variantId: string): boolean {
    return this.pending.delete(variantId);
  }

  getPendingApprovals(): PendingApproval[] {
    return [...this.pending.values()];
  }
}
