import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BackupManager } from '../src/backup-manager.js';
import { BackupSerializer } from '../src/serializer.js';
import type { BackupResult, DataCategory, DataProvider } from '../src/types.js';

function createMockProvider(
  category: DataCategory,
  data: unknown = [{ id: '1' }],
  itemCount = 1,
): DataProvider {
  return {
    category,
    export: vi.fn().mockResolvedValue(data),
    import: vi.fn().mockResolvedValue({ itemCount, warnings: [] }),
    count: vi.fn().mockResolvedValue(itemCount),
  };
}

describe('BackupManager', () => {
  let manager: BackupManager;

  beforeEach(() => {
    manager = new BackupManager();
  });

  describe('registerProvider', () => {
    it('should register a provider', () => {
      const provider = createMockProvider('conversations');
      manager.registerProvider(provider);
      expect(manager.listProviders()).toContain('conversations');
    });

    it('should overwrite existing provider for same category', () => {
      const first = createMockProvider('conversations');
      const second = createMockProvider('conversations');
      manager.registerProvider(first);
      manager.registerProvider(second);
      expect(manager.listProviders()).toEqual(['conversations']);
    });
  });

  describe('listProviders', () => {
    it('should return empty array when no providers registered', () => {
      expect(manager.listProviders()).toEqual([]);
    });

    it('should return all registered categories', () => {
      manager.registerProvider(createMockProvider('conversations'));
      manager.registerProvider(createMockProvider('settings'));
      manager.registerProvider(createMockProvider('memory'));

      const providers = manager.listProviders();
      expect(providers).toHaveLength(3);
      expect(providers).toContain('conversations');
      expect(providers).toContain('settings');
      expect(providers).toContain('memory');
    });
  });

  describe('createBackup', () => {
    it('should create a backup with all registered providers', async () => {
      manager.registerProvider(createMockProvider('conversations', [{ id: '1' }], 1));
      manager.registerProvider(createMockProvider('settings', { theme: 'dark' }, 1));

      const result = await manager.createBackup();

      expect(result.status).toBe('completed');
      expect(result.manifest.version).toBe('1.0.0');
      expect(result.manifest.categories).toEqual(['conversations', 'settings']);
      expect(result.manifest.totalItems).toBe(2);
      expect(result.manifest.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(result.data['conversations']).toEqual([{ id: '1' }]);
      expect(result.data['settings']).toEqual({ theme: 'dark' });
    });

    it('should create a backup for specific categories only', async () => {
      manager.registerProvider(createMockProvider('conversations'));
      manager.registerProvider(createMockProvider('settings'));

      const result = await manager.createBackup(['conversations']);

      expect(result.manifest.categories).toEqual(['conversations']);
      expect(result.data['conversations']).toBeDefined();
      expect(result.data['settings']).toBeUndefined();
    });

    it('should skip categories without registered providers', async () => {
      manager.registerProvider(createMockProvider('conversations'));

      const result = await manager.createBackup(['conversations', 'memory']);

      expect(result.status).toBe('completed');
      expect(result.manifest.categories).toEqual(['conversations']);
    });

    it('should return failed status on provider error', async () => {
      const provider = createMockProvider('conversations');
      provider.export = vi.fn().mockRejectedValue(new Error('Export failed'));
      manager.registerProvider(provider);

      const result = await manager.createBackup();

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Export failed');
    });

    it('should compute correct manifest sizeBytes', async () => {
      const data = { items: [1, 2, 3] };
      manager.registerProvider(createMockProvider('conversations', data, 3));

      const result = await manager.createBackup();
      const expectedSize = Buffer.byteLength(JSON.stringify({ conversations: data }), 'utf-8');

      expect(result.manifest.sizeBytes).toBe(expectedSize);
    });
  });

  describe('restore', () => {
    async function createValidBackup(): Promise<BackupResult> {
      manager.registerProvider(createMockProvider('conversations', [{ id: '1' }], 1));
      manager.registerProvider(createMockProvider('settings', { theme: 'dark' }, 1));
      return manager.createBackup();
    }

    it('should restore all categories from a backup', async () => {
      const backup = await createValidBackup();
      const result = await manager.restore(backup);

      expect(result.status).toBe('completed');
      expect(result.restoredCategories).toEqual(['conversations', 'settings']);
      expect(result.itemsRestored).toBe(2);
      expect(result.warnings).toEqual([]);
    });

    it('should restore specific categories only', async () => {
      const backup = await createValidBackup();
      const result = await manager.restore(backup, ['conversations']);

      expect(result.restoredCategories).toEqual(['conversations']);
      expect(result.itemsRestored).toBe(1);
    });

    it('should skip categories without providers', async () => {
      const backup = await createValidBackup();

      const freshManager = new BackupManager();
      freshManager.registerProvider(createMockProvider('conversations'));

      const result = await freshManager.restore(backup, ['conversations', 'memory']);

      expect(result.restoredCategories).toEqual(['conversations']);
      expect(result.skippedCategories).toContain('memory');
      expect(result.warnings).toContain('No provider registered for category: memory');
    });

    it('should fail on invalid checksum', async () => {
      const backup = await createValidBackup();
      backup.manifest.checksum = 'tampered-checksum';

      const result = await manager.restore(backup);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Checksum mismatch');
    });

    it('should fail on missing manifest', async () => {
      const backup = { status: 'completed', data: {} } as unknown as BackupResult;

      const result = await manager.restore(backup);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Missing manifest');
    });

    it('should collect warnings from providers', async () => {
      const provider = createMockProvider('conversations');
      provider.import = vi.fn().mockResolvedValue({
        itemCount: 1,
        warnings: ['Some data was skipped'],
      });
      manager.registerProvider(provider);

      const backup = await manager.createBackup();
      const result = await manager.restore(backup);

      expect(result.warnings).toContain('Some data was skipped');
    });

    it('should return failed status on provider import error', async () => {
      const provider = createMockProvider('conversations');
      manager.registerProvider(provider);
      const backup = await manager.createBackup();

      // Replace the import mock to fail on restore
      provider.import = vi.fn().mockRejectedValue(new Error('Import failed'));

      const result = await manager.restore(backup);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Import failed');
    });
  });

  describe('validateBackup', () => {
    it('should validate a correct backup', async () => {
      manager.registerProvider(createMockProvider('conversations'));
      const backup = await manager.createBackup();

      const validation = manager.validateBackup(backup);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should reject backup with missing manifest', () => {
      const backup = { data: {} } as unknown as BackupResult;
      const validation = manager.validateBackup(backup);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing manifest');
    });

    it('should reject backup with tampered data', async () => {
      manager.registerProvider(createMockProvider('conversations', [{ id: '1' }]));
      const backup = await manager.createBackup();
      backup.data['conversations'] = [{ id: 'tampered' }];

      const validation = manager.validateBackup(backup);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Checksum mismatch'))).toBe(true);
    });

    it('should reject backup with unsupported version', async () => {
      manager.registerProvider(createMockProvider('conversations'));
      const backup = await manager.createBackup();
      backup.manifest.version = '99.0.0';
      // Recompute checksum so only version check fails
      backup.manifest.checksum = BackupSerializer.computeChecksum(
        backup.data as Record<string, unknown>,
      );

      const validation = manager.validateBackup(backup);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Unsupported backup version'))).toBe(true);
    });
  });
});
