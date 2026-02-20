import { getLogger } from '@auxiora/logger';
import { BackupSerializer } from './serializer.js';
import type { BackupManifest, BackupResult, BackupStatus, DataCategory, DataProvider, RestoreResult } from './types.js';

const logger = getLogger('backup:manager');

const BACKUP_FORMAT_VERSION = '1.0.0';
const AUXIORA_VERSION = '1.4.0';

export class BackupManager {
  private providers: Map<DataCategory, DataProvider> = new Map();

  registerProvider(provider: DataProvider): void {
    if (this.providers.has(provider.category)) {
      logger.warn(`Overwriting existing provider for category: ${provider.category}`);
    }
    this.providers.set(provider.category, provider);
    logger.debug(`Registered provider for category: ${provider.category}`);
  }

  listProviders(): DataCategory[] {
    return [...this.providers.keys()];
  }

  async createBackup(categories?: DataCategory[]): Promise<BackupResult> {
    const targetCategories = categories ?? [...this.providers.keys()];
    const data: Record<string, unknown> = {};
    let totalItems = 0;

    logger.info(`Creating backup for categories: ${targetCategories.join(', ')}`);

    try {
      for (const category of targetCategories) {
        const provider = this.providers.get(category);
        if (!provider) {
          logger.warn(`No provider registered for category: ${category}`);
          continue;
        }

        const exported = await provider.export();
        const count = await provider.count();
        data[category] = exported;
        totalItems += count;
      }

      const serialized = JSON.stringify(data);
      const checksum = BackupSerializer.computeChecksum(data);

      const manifest: BackupManifest = {
        version: BACKUP_FORMAT_VERSION,
        auxioraVersion: AUXIORA_VERSION,
        createdAt: Date.now(),
        categories: targetCategories.filter(c => this.providers.has(c)),
        totalItems,
        sizeBytes: Buffer.byteLength(serialized, 'utf-8'),
        checksum,
      };

      const result: BackupResult = {
        status: 'completed' as BackupStatus,
        manifest,
        data: data as Record<DataCategory, unknown>,
      };

      logger.info(`Backup completed: ${totalItems} items, ${manifest.sizeBytes} bytes`);
      return result;
    } catch (err: unknown) {
      const wrapped: Error = err instanceof Error ? err : new Error(String(err));
      logger.error(wrapped);
      return {
        status: 'failed',
        manifest: {
          version: BACKUP_FORMAT_VERSION,
          auxioraVersion: AUXIORA_VERSION,
          createdAt: Date.now(),
          categories: [],
          totalItems: 0,
          sizeBytes: 0,
          checksum: '',
        },
        data: {} as Record<DataCategory, unknown>,
        error: wrapped.message,
      };
    }
  }

  async restore(backup: BackupResult, categories?: DataCategory[]): Promise<RestoreResult> {
    const validation = this.validateBackup(backup);
    if (!validation.valid) {
      return {
        status: 'failed',
        restoredCategories: [],
        skippedCategories: [],
        itemsRestored: 0,
        warnings: [],
        error: `Validation failed: ${validation.errors.join('; ')}`,
      };
    }

    const targetCategories = categories ?? backup.manifest.categories;
    const restoredCategories: DataCategory[] = [];
    const skippedCategories: DataCategory[] = [];
    const warnings: string[] = [];
    let itemsRestored = 0;

    logger.info(`Restoring backup for categories: ${targetCategories.join(', ')}`);

    try {
      for (const category of targetCategories) {
        const provider = this.providers.get(category);
        if (!provider) {
          logger.warn(`No provider for category: ${category}, skipping`);
          skippedCategories.push(category);
          warnings.push(`No provider registered for category: ${category}`);
          continue;
        }

        const categoryData = backup.data[category];
        if (categoryData === undefined) {
          skippedCategories.push(category);
          warnings.push(`No data found for category: ${category}`);
          continue;
        }

        const result = await provider.import(categoryData);
        itemsRestored += result.itemCount;
        restoredCategories.push(category);
        warnings.push(...result.warnings);
      }

      logger.info(`Restore completed: ${itemsRestored} items across ${restoredCategories.length} categories`);

      return {
        status: 'completed',
        restoredCategories,
        skippedCategories,
        itemsRestored,
        warnings,
      };
    } catch (err: unknown) {
      const wrapped: Error = err instanceof Error ? err : new Error(String(err));
      logger.error(wrapped);
      return {
        status: 'failed',
        restoredCategories,
        skippedCategories,
        itemsRestored,
        warnings,
        error: wrapped.message,
      };
    }
  }

  validateBackup(backup: BackupResult): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!backup.manifest) {
      errors.push('Missing manifest');
      return { valid: false, errors };
    }

    if (!backup.manifest.version) {
      errors.push('Missing manifest version');
    }

    if (!backup.data || typeof backup.data !== 'object') {
      errors.push('Missing or invalid data');
      return { valid: false, errors };
    }

    if (!backup.manifest.checksum) {
      errors.push('Missing checksum');
    } else if (!BackupSerializer.verifyChecksum(backup.data as Record<string, unknown>, backup.manifest.checksum)) {
      errors.push('Checksum mismatch: data may be corrupted');
    }

    if (backup.manifest.version && backup.manifest.version !== BACKUP_FORMAT_VERSION) {
      errors.push(`Unsupported backup version: ${backup.manifest.version} (expected ${BACKUP_FORMAT_VERSION})`);
    }

    return { valid: errors.length === 0, errors };
  }
}
