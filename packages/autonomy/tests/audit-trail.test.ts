import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ActionAuditTrail } from '../src/audit-trail.js';

describe('ActionAuditTrail', () => {
  let tmpDir: string;
  let filePath: string;
  let trail: ActionAuditTrail;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-trail-'));
    filePath = path.join(tmpDir, 'audit.json');
    trail = new ActionAuditTrail(filePath);
    await trail.load();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should record an audit entry', async () => {
    const entry = await trail.record({
      trustLevel: 2,
      domain: 'messaging',
      intent: 'Send message',
      plan: 'Send via Slack',
      executed: true,
      outcome: 'success',
      reasoning: 'User requested message send',
      rollbackAvailable: false,
    });

    expect(entry.id).toBeTruthy();
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.domain).toBe('messaging');
  });

  it('should retrieve by id', async () => {
    const entry = await trail.record({
      trustLevel: 1,
      domain: 'web',
      intent: 'Browse',
      plan: 'Open URL',
      executed: true,
      outcome: 'success',
      reasoning: 'Test',
      rollbackAvailable: false,
    });

    const found = trail.getById(entry.id);
    expect(found).toEqual(entry);
  });

  it('should return undefined for unknown id', () => {
    expect(trail.getById('nonexistent')).toBeUndefined();
  });

  it('should query by domain', async () => {
    await trail.record({
      trustLevel: 1,
      domain: 'web',
      intent: 'Browse',
      plan: 'Open URL',
      executed: true,
      outcome: 'success',
      reasoning: 'Test',
      rollbackAvailable: false,
    });
    await trail.record({
      trustLevel: 2,
      domain: 'files',
      intent: 'Write file',
      plan: 'Create file',
      executed: true,
      outcome: 'success',
      reasoning: 'Test',
      rollbackAvailable: false,
    });

    const webEntries = trail.query({ domain: 'web' });
    expect(webEntries).toHaveLength(1);
    expect(webEntries[0].domain).toBe('web');
  });

  it('should query by outcome', async () => {
    await trail.record({
      trustLevel: 1,
      domain: 'web',
      intent: 'Browse',
      plan: 'Open URL',
      executed: true,
      outcome: 'success',
      reasoning: 'Test',
      rollbackAvailable: false,
    });
    await trail.record({
      trustLevel: 1,
      domain: 'web',
      intent: 'Browse',
      plan: 'Open URL',
      executed: false,
      outcome: 'failure',
      reasoning: 'Blocked',
      rollbackAvailable: false,
    });

    const failures = trail.query({ outcome: 'failure' });
    expect(failures).toHaveLength(1);
  });

  it('should query with limit', async () => {
    for (let i = 0; i < 5; i++) {
      await trail.record({
        trustLevel: 1,
        domain: 'web',
        intent: `Action ${i}`,
        plan: 'Plan',
        executed: true,
        outcome: 'success',
        reasoning: 'Test',
        rollbackAvailable: false,
      });
    }

    const limited = trail.query({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it('should mark as rolled back', async () => {
    const entry = await trail.record({
      trustLevel: 2,
      domain: 'files',
      intent: 'Delete file',
      plan: 'Remove /tmp/test',
      executed: true,
      outcome: 'success',
      reasoning: 'Cleanup',
      rollbackAvailable: true,
    });

    const result = await trail.markRolledBack(entry.id);
    expect(result).toBe(true);

    const updated = trail.getById(entry.id);
    expect(updated?.outcome).toBe('rolled_back');
    expect(updated?.rollbackAvailable).toBe(false);
  });

  it('should persist and reload entries', async () => {
    await trail.record({
      trustLevel: 1,
      domain: 'web',
      intent: 'Browse',
      plan: 'Open URL',
      executed: true,
      outcome: 'success',
      reasoning: 'Test',
      rollbackAvailable: false,
    });

    const trail2 = new ActionAuditTrail(filePath);
    await trail2.load();
    expect(trail2.getAll()).toHaveLength(1);
  });
});
