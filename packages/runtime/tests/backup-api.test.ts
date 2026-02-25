import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { BackupManager } from '@auxiora/backup';
import type { BackupResult, DataCategory, DataProvider } from '@auxiora/backup';
import { Router } from 'express';

/** Minimal in-memory data provider for testing */
function createMockProvider(category: DataCategory, items: unknown[] = []): DataProvider {
  let store = [...items];
  return {
    category,
    async export() {
      return store;
    },
    async import(data: unknown) {
      const arr = data as unknown[];
      store = [...arr];
      return { itemCount: arr.length, warnings: [] };
    },
    async count() {
      return store.length;
    },
  };
}

function createBackupRouter(backupManager: BackupManager, backupStore: Map<string, BackupResult>) {
  const router = Router();
  let nextId = 1;

  router.post('/create', async (req: any, res: any) => {
    if (!backupManager) {
      return res.status(503).json({ error: 'Backup system not initialized' });
    }
    try {
      const { categories } = req.body as { categories?: DataCategory[] };
      const result = await backupManager.createBackup(categories);
      if (result.status === 'failed') {
        return res.status(500).json({ error: result.error ?? 'Backup failed' });
      }
      const id = `backup-${nextId++}`;
      backupStore.set(id, result);
      res.status(201).json({ id, ...result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/list', (_req: any, res: any) => {
    const backups = [...backupStore.entries()].map(([id, b]) => ({
      id,
      status: b.status,
      manifest: b.manifest,
    }));
    res.json({ backups });
  });

  router.post('/restore', async (req: any, res: any) => {
    if (!backupManager) {
      return res.status(503).json({ error: 'Backup system not initialized' });
    }
    try {
      const { backupId, categories } = req.body as { backupId?: string; categories?: DataCategory[] };
      if (!backupId || typeof backupId !== 'string') {
        return res.status(400).json({ error: 'backupId required' });
      }
      const backup = backupStore.get(backupId);
      if (!backup) {
        return res.status(404).json({ error: 'Backup not found' });
      }
      const result = await backupManager.restore(backup, categories);
      if (result.status === 'failed') {
        return res.status(500).json({ error: result.error ?? 'Restore failed' });
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.delete('/:id', (req: any, res: any) => {
    const { id } = req.params;
    if (!backupStore.has(id)) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    backupStore.delete(id);
    res.json({ deleted: true });
  });

  return router;
}

describe('Backup REST API', () => {
  let app: express.Express;
  let manager: BackupManager;
  let store: Map<string, BackupResult>;

  beforeEach(() => {
    manager = new BackupManager();
    store = new Map();
    app = express();
    app.use(express.json());
    app.use('/api/v1/backup', createBackupRouter(manager, store));
  });

  // --- POST /create ---

  describe('POST /create', () => {
    it('creates a backup with all registered providers', async () => {
      manager.registerProvider(createMockProvider('settings', [{ theme: 'dark' }]));
      manager.registerProvider(createMockProvider('preferences', [{ lang: 'en' }]));

      const res = await request(app)
        .post('/api/v1/backup/create')
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('backup-1');
      expect(res.body.status).toBe('completed');
      expect(res.body.manifest.totalItems).toBe(2);
      expect(res.body.manifest.categories).toContain('settings');
      expect(res.body.manifest.categories).toContain('preferences');
    });

    it('creates a backup filtered by categories', async () => {
      manager.registerProvider(createMockProvider('settings', [{ theme: 'dark' }]));
      manager.registerProvider(createMockProvider('preferences', [{ lang: 'en' }]));

      const res = await request(app)
        .post('/api/v1/backup/create')
        .send({ categories: ['settings'] });
      expect(res.status).toBe(201);
      expect(res.body.manifest.categories).toEqual(['settings']);
    });

    it('creates a backup with no providers registered (empty data)', async () => {
      const res = await request(app)
        .post('/api/v1/backup/create')
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.manifest.totalItems).toBe(0);
    });

    it('stores backup for later retrieval', async () => {
      manager.registerProvider(createMockProvider('memory', [{ key: 'val' }]));
      const res = await request(app)
        .post('/api/v1/backup/create')
        .send({});
      expect(res.status).toBe(201);
      expect(store.has('backup-1')).toBe(true);
    });

    it('increments backup IDs', async () => {
      manager.registerProvider(createMockProvider('settings', [1]));
      const r1 = await request(app).post('/api/v1/backup/create').send({});
      const r2 = await request(app).post('/api/v1/backup/create').send({});
      expect(r1.body.id).toBe('backup-1');
      expect(r2.body.id).toBe('backup-2');
    });
  });

  // --- GET /list ---

  describe('GET /list', () => {
    it('returns empty list when no backups exist', async () => {
      const res = await request(app).get('/api/v1/backup/list');
      expect(res.status).toBe(200);
      expect(res.body.backups).toEqual([]);
    });

    it('returns stored backups with id, status, and manifest', async () => {
      manager.registerProvider(createMockProvider('settings', [{ a: 1 }]));
      await request(app).post('/api/v1/backup/create').send({});
      await request(app).post('/api/v1/backup/create').send({});

      const res = await request(app).get('/api/v1/backup/list');
      expect(res.status).toBe(200);
      expect(res.body.backups).toHaveLength(2);
      expect(res.body.backups[0].id).toBe('backup-1');
      expect(res.body.backups[0].status).toBe('completed');
      expect(res.body.backups[0].manifest).toBeDefined();
      // Should not leak full data in list
      expect(res.body.backups[0].data).toBeUndefined();
    });
  });

  // --- POST /restore ---

  describe('POST /restore', () => {
    it('restores from a stored backup', async () => {
      const provider = createMockProvider('settings', [{ theme: 'dark' }]);
      manager.registerProvider(provider);

      // Create a backup
      const createRes = await request(app)
        .post('/api/v1/backup/create')
        .send({});
      const backupId = createRes.body.id;

      // Restore it
      const res = await request(app)
        .post('/api/v1/backup/restore')
        .send({ backupId });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.restoredCategories).toContain('settings');
      expect(res.body.itemsRestored).toBe(1);
    });

    it('restores only specified categories', async () => {
      manager.registerProvider(createMockProvider('settings', [{ a: 1 }]));
      manager.registerProvider(createMockProvider('preferences', [{ b: 2 }]));

      const createRes = await request(app)
        .post('/api/v1/backup/create')
        .send({});
      const backupId = createRes.body.id;

      const res = await request(app)
        .post('/api/v1/backup/restore')
        .send({ backupId, categories: ['settings'] });
      expect(res.status).toBe(200);
      expect(res.body.restoredCategories).toEqual(['settings']);
    });

    it('returns 400 when backupId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/backup/restore')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('backupId required');
    });

    it('returns 404 when backup does not exist', async () => {
      const res = await request(app)
        .post('/api/v1/backup/restore')
        .send({ backupId: 'nonexistent' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Backup not found');
    });
  });

  // --- DELETE /:id ---

  describe('DELETE /:id', () => {
    it('deletes a stored backup', async () => {
      manager.registerProvider(createMockProvider('settings', [{ x: 1 }]));
      const createRes = await request(app)
        .post('/api/v1/backup/create')
        .send({});
      const backupId = createRes.body.id;

      const res = await request(app).delete(`/api/v1/backup/${backupId}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);

      // Verify it's gone
      const listRes = await request(app).get('/api/v1/backup/list');
      expect(listRes.body.backups).toHaveLength(0);
    });

    it('returns 404 for unknown backup id', async () => {
      const res = await request(app).delete('/api/v1/backup/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Backup not found');
    });
  });
});
