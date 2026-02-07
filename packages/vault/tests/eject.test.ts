import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { EjectManager } from '../src/eject.js';

describe('EjectManager', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  describe('exportData', () => {
    it('should create export data with credentials', () => {
      const data = EjectManager.exportData({ API_KEY: 'secret', DB_URL: 'postgres://...' });
      expect(data.version).toBe(1);
      expect(data.exportedAt).toBeDefined();
      expect(data.credentials.API_KEY).toBe('secret');
      expect(data.credentials.DB_URL).toBe('postgres://...');
    });

    it('should include optional metadata', () => {
      const data = EjectManager.exportData({ KEY: 'val' }, { source: 'test' });
      expect(data.metadata?.source).toBe('test');
    });
  });

  describe('saveToFile / loadFromFile', () => {
    it('should save and load data', async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eject-'));
      const filePath = path.join(tmpDir, 'export.json');

      const data = EjectManager.exportData({ KEY: 'value' });
      await EjectManager.saveToFile(data, filePath);

      const loaded = await EjectManager.loadFromFile(filePath);
      expect(loaded.version).toBe(1);
      expect(loaded.credentials.KEY).toBe('value');
    });

    it('should throw on invalid file', async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eject-'));
      const filePath = path.join(tmpDir, 'bad.json');
      await fs.writeFile(filePath, '{"invalid":true}', 'utf-8');

      await expect(EjectManager.loadFromFile(filePath)).rejects.toThrow('Invalid eject file format');
    });
  });

  describe('getCredentials', () => {
    it('should return a copy of credentials', () => {
      const data = EjectManager.exportData({ A: '1', B: '2' });
      const creds = EjectManager.getCredentials(data);
      expect(creds).toEqual({ A: '1', B: '2' });

      // Should be a copy, not a reference
      creds.A = 'modified';
      expect(data.credentials.A).toBe('1');
    });
  });
});
