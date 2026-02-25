import { describe, expect, it } from 'vitest';
import { BackupSerializer } from '../src/serializer.js';
import type { BackupResult, DataCategory } from '../src/types.js';

function createMockBackupResult(): BackupResult {
  const data: Record<string, unknown> = {
    conversations: [{ id: '1', text: 'hello' }],
    settings: { theme: 'dark' },
  };
  const checksum = BackupSerializer.computeChecksum(data);

  return {
    status: 'completed',
    manifest: {
      version: '1.0.0',
      auxioraVersion: '1.4.0',
      createdAt: Date.now(),
      categories: ['conversations', 'settings'] as DataCategory[],
      totalItems: 2,
      sizeBytes: 100,
      checksum,
    },
    data: data as Record<DataCategory, unknown>,
  };
}

describe('BackupSerializer', () => {
  describe('toJSON / fromJSON round-trip', () => {
    it('should serialize and deserialize a BackupResult', () => {
      const original = createMockBackupResult();
      const json = BackupSerializer.toJSON(original);
      const restored = BackupSerializer.fromJSON(json);

      expect(restored.status).toBe(original.status);
      expect(restored.manifest.version).toBe(original.manifest.version);
      expect(restored.manifest.checksum).toBe(original.manifest.checksum);
      expect(restored.data).toEqual(original.data);
    });

    it('should produce valid JSON string', () => {
      const result = createMockBackupResult();
      const json = BackupSerializer.toJSON(result);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe('fromJSON validation', () => {
    it('should throw on non-object input', () => {
      expect(() => BackupSerializer.fromJSON('"hello"')).toThrow('expected an object');
    });

    it('should throw on missing manifest', () => {
      expect(() => BackupSerializer.fromJSON('{"data": {}, "status": "completed"}')).toThrow('missing manifest');
    });

    it('should throw on missing data', () => {
      expect(() => BackupSerializer.fromJSON('{"manifest": {}, "status": "completed"}')).toThrow('missing data');
    });

    it('should throw on missing status', () => {
      expect(() => BackupSerializer.fromJSON('{"manifest": {}, "data": {}}')).toThrow('missing status');
    });
  });

  describe('computeChecksum', () => {
    it('should return a hex string', () => {
      const checksum = BackupSerializer.computeChecksum({ a: 1 });
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return consistent results for same input', () => {
      const data = { key: 'value', nested: { arr: [1, 2, 3] } };
      const first = BackupSerializer.computeChecksum(data);
      const second = BackupSerializer.computeChecksum(data);
      expect(first).toBe(second);
    });

    it('should return different results for different input', () => {
      const a = BackupSerializer.computeChecksum({ a: 1 });
      const b = BackupSerializer.computeChecksum({ a: 2 });
      expect(a).not.toBe(b);
    });
  });

  describe('verifyChecksum', () => {
    it('should return true for matching checksum', () => {
      const data = { test: 'data' };
      const checksum = BackupSerializer.computeChecksum(data);
      expect(BackupSerializer.verifyChecksum(data, checksum)).toBe(true);
    });

    it('should return false for mismatched checksum', () => {
      const data = { test: 'data' };
      expect(BackupSerializer.verifyChecksum(data, 'invalid-checksum')).toBe(false);
    });
  });
});
