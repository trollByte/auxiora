import { createHash } from 'node:crypto';
import type { BackupResult } from './types.js';

export class BackupSerializer {
  static toJSON(result: BackupResult): string {
    return JSON.stringify(result, null, 2);
  }

  static fromJSON(json: string): BackupResult {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid backup format: expected an object');
    }

    const obj = parsed as Record<string, unknown>;

    if (!obj['manifest'] || typeof obj['manifest'] !== 'object') {
      throw new Error('Invalid backup format: missing manifest');
    }

    if (!obj['data'] || typeof obj['data'] !== 'object') {
      throw new Error('Invalid backup format: missing data');
    }

    if (!obj['status'] || typeof obj['status'] !== 'string') {
      throw new Error('Invalid backup format: missing status');
    }

    return parsed as BackupResult;
  }

  static computeChecksum(data: Record<string, unknown>): string {
    const hash = createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  static verifyChecksum(data: Record<string, unknown>, expected: string): boolean {
    return BackupSerializer.computeChecksum(data) === expected;
  }
}
