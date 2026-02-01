import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuditLogger, type AuditEntry } from '../src/index.js';

const testDir = path.join(os.tmpdir(), 'auxiora-audit-test-' + Date.now());
const testLogPath = path.join(testDir, 'audit.jsonl');

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    logger = new AuditLogger(testLogPath);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('logging', () => {
    it('should write log entries', async () => {
      await logger.log('vault.unlock', { success: true });

      const entries = await logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].event).toBe('vault.unlock');
      expect(entries[0].details).toEqual({ success: true });
    });

    it('should include timestamp and sequence', async () => {
      await logger.log('vault.unlock', {});

      const entries = await logger.getEntries();
      expect(entries[0].timestamp).toBeDefined();
      expect(entries[0].sequence).toBe(1);
    });

    it('should increment sequence', async () => {
      await logger.log('event1', {});
      await logger.log('event2', {});
      await logger.log('event3', {});

      const entries = await logger.getEntries();
      expect(entries.map((e) => e.sequence)).toEqual([1, 2, 3]);
    });
  });

  describe('chain integrity', () => {
    it('should create valid hash chain', async () => {
      await logger.log('event1', {});
      await logger.log('event2', {});
      await logger.log('event3', {});

      const result = await logger.verify();
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(3);
    });

    it('should link entries via prevHash', async () => {
      await logger.log('event1', {});
      await logger.log('event2', {});

      const entries = await logger.getEntries();
      expect(entries[0].prevHash).toBe('0'.repeat(64)); // genesis
      expect(entries[1].prevHash).toBe(entries[0].hash);
    });

    it('should detect tampered entries', async () => {
      await logger.log('event1', {});
      await logger.log('event2', {});

      // Tamper with the log file
      const content = await fs.readFile(testLogPath, 'utf-8');
      const lines = content.trim().split('\n');
      const entry = JSON.parse(lines[0]) as AuditEntry;
      entry.details = { tampered: true };
      lines[0] = JSON.stringify(entry);
      await fs.writeFile(testLogPath, lines.join('\n') + '\n');

      // Create new logger to re-read file
      const verifyLogger = new AuditLogger(testLogPath);
      const result = await verifyLogger.verify();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1);
    });
  });

  describe('sensitive data redaction', () => {
    it('should redact password fields', async () => {
      await logger.log('auth.attempt', {
        username: 'testuser',
        password: 'secret123',
      });

      const entries = await logger.getEntries();
      expect(entries[0].details.username).toBe('testuser');
      expect(entries[0].details.password).toBe('[REDACTED]');
    });

    it('should redact token fields', async () => {
      await logger.log('auth.success', {
        userId: '123',
        accessToken: 'eyJhbGciOiJI...',
        apiKey: 'sk-abc123',
      });

      const entries = await logger.getEntries();
      expect(entries[0].details.userId).toBe('123');
      expect(entries[0].details.accessToken).toBe('[REDACTED]');
      expect(entries[0].details.apiKey).toBe('[REDACTED]');
    });

    it('should redact nested sensitive fields', async () => {
      await logger.log('vault.access', {
        user: 'test',
        credentials: {
          apiToken: 'secret',
          publicId: 'public',
        },
      });

      const entries = await logger.getEntries();
      const creds = entries[0].details.credentials as Record<string, unknown>;
      expect(creds.apiToken).toBe('[REDACTED]');
      expect(creds.publicId).toBe('public');
    });
  });

  describe('getEntries', () => {
    it('should return empty array for non-existent log', async () => {
      const emptyLogger = new AuditLogger(path.join(testDir, 'nonexistent.jsonl'));
      const entries = await emptyLogger.getEntries();
      expect(entries).toEqual([]);
    });

    it('should limit entries when specified', async () => {
      for (let i = 0; i < 10; i++) {
        await logger.log('event', { index: i });
      }

      const entries = await logger.getEntries(3);
      expect(entries).toHaveLength(3);
      // Should return last 3 entries
      expect((entries[0].details as { index: number }).index).toBe(7);
      expect((entries[2].details as { index: number }).index).toBe(9);
    });
  });
});
