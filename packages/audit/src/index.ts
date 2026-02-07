import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getAuditLogPath, isWindows } from '@auxiora/core';

export type AuditEventType =
  | 'vault.unlock'
  | 'vault.lock'
  | 'vault.add'
  | 'vault.remove'
  | 'vault.access'
  | 'vault.unlock_failed'
  | 'vault.init'
  | 'vault.password_changed'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.failed'
  | 'auth.token_refresh'
  | 'auth.token_revoked'
  | 'auth.password_set'
  | 'auth.jwt_configured'
  | 'auth.token_generated'
  | 'auth.disabled'
  | 'pairing.code_generated'
  | 'pairing.code_accepted'
  | 'pairing.code_rejected'
  | 'pairing.code_expired'
  | 'session.created'
  | 'session.destroyed'
  | 'session.compacted'
  | 'channel.connected'
  | 'channel.disconnected'
  | 'channel.error'
  | 'message.received'
  | 'message.sent'
  | 'rate_limit.exceeded'
  | 'security.suspicious_input'
  | 'system.startup'
  | 'system.shutdown'
  | 'behavior.created'
  | 'behavior.updated'
  | 'behavior.deleted'
  | 'behavior.executed'
  | 'behavior.paused'
  | 'behavior.failed'
  | 'browser.navigate'
  | 'browser.click'
  | 'browser.type'
  | 'browser.script'
  | 'browser.screenshot'
  | 'voice.transcribed'
  | 'voice.synthesized'
  | 'webhook.received'
  | 'webhook.signature_failed'
  | 'webhook.triggered'
  | 'webhook.error'
  | 'webhook.created'
  | 'webhook.updated'
  | 'webhook.deleted'
  | 'dashboard.login'
  | 'dashboard.logout'
  | 'dashboard.login_failed'
  | 'plugin.loaded'
  | 'plugin.load_failed'
  | 'memory.saved'
  | 'memory.deleted'
  | 'memory.extracted'
  | 'setup.identity'
  | 'setup.personality'
  | 'setup.provider'
  | 'setup.channels'
  | 'setup.complete'
  | 'system.error';

export interface AuditEntry {
  timestamp: string;
  sequence: number;
  event: AuditEventType;
  details: Record<string, unknown>;
  hash: string;
  prevHash: string;
}

// Sensitive fields that should be redacted in logs
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /credential/i,
  /auth/i,
  /bearer/i,
  /api[_-]?key/i,
];

function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

    if (isSensitive && typeof value === 'string') {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function computeHash(data: string, prevHash: string): string {
  return crypto
    .createHash('sha256')
    .update(prevHash + data)
    .digest('hex');
}

export class AuditLogger {
  private logPath: string;
  private sequence: number = 0;
  private prevHash: string = '0'.repeat(64); // Genesis hash
  private initialized: boolean = false;

  constructor(logPath?: string) {
    this.logPath = logPath ?? getAuditLogPath();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const logDir = path.dirname(this.logPath);
    await fs.mkdir(logDir, { recursive: true });

    // Read existing log to get last sequence and hash
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      if (lines.length > 0) {
        const lastEntry = JSON.parse(lines[lines.length - 1]) as AuditEntry;
        this.sequence = lastEntry.sequence;
        this.prevHash = lastEntry.hash;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, start fresh
    }

    this.initialized = true;
  }

  async log(event: AuditEventType, details: Record<string, unknown> = {}): Promise<void> {
    await this.initialize();

    this.sequence++;
    const timestamp = new Date().toISOString();
    const redactedDetails = redactSensitive(details);

    const entryData = JSON.stringify({
      timestamp,
      sequence: this.sequence,
      event,
      details: redactedDetails,
    });

    const hash = computeHash(entryData, this.prevHash);

    const entry: AuditEntry = {
      timestamp,
      sequence: this.sequence,
      event,
      details: redactedDetails,
      hash,
      prevHash: this.prevHash,
    };

    this.prevHash = hash;

    await fs.appendFile(this.logPath, JSON.stringify(entry) + '\n', 'utf-8');

    // Set permissions on first write
    if (this.sequence === 1 && !isWindows()) {
      await fs.chmod(this.logPath, 0o600);
    }
  }

  async verify(): Promise<{ valid: boolean; entries: number; brokenAt?: number }> {
    await this.initialize();

    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      if (lines.length === 0) {
        return { valid: true, entries: 0 };
      }

      let expectedPrevHash = '0'.repeat(64);

      for (let i = 0; i < lines.length; i++) {
        const entry = JSON.parse(lines[i]) as AuditEntry;

        // Verify chain linkage
        if (entry.prevHash !== expectedPrevHash) {
          return { valid: false, entries: lines.length, brokenAt: entry.sequence };
        }

        // Recompute hash
        const entryData = JSON.stringify({
          timestamp: entry.timestamp,
          sequence: entry.sequence,
          event: entry.event,
          details: entry.details,
        });

        const computedHash = computeHash(entryData, entry.prevHash);
        if (computedHash !== entry.hash) {
          return { valid: false, entries: lines.length, brokenAt: entry.sequence };
        }

        expectedPrevHash = entry.hash;
      }

      return { valid: true, entries: lines.length };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { valid: true, entries: 0 };
      }
      throw error;
    }
  }

  async getEntries(limit?: number): Promise<AuditEntry[]> {
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const entries = lines.map((line) => JSON.parse(line) as AuditEntry);

      if (limit) {
        return entries.slice(-limit);
      }
      return entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

// Singleton instance
let defaultLogger: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!defaultLogger) {
    defaultLogger = new AuditLogger();
  }
  return defaultLogger;
}

export async function audit(
  event: AuditEventType,
  details: Record<string, unknown> = {}
): Promise<void> {
  const logger = getAuditLogger();
  await logger.log(event, details);
}
