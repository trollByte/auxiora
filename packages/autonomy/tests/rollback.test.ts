import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ActionAuditTrail } from '../src/audit-trail.js';
import { RollbackManager } from '../src/rollback.js';

describe('RollbackManager', () => {
  let tmpDir: string;
  let trail: ActionAuditTrail;
  let rollback: RollbackManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rollback-'));
    trail = new ActionAuditTrail(path.join(tmpDir, 'audit.json'));
    await trail.load();
    rollback = new RollbackManager(trail);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should report rollback availability', async () => {
    const entry = await trail.record({
      trustLevel: 2,
      domain: 'files',
      intent: 'Delete file',
      plan: 'rm /tmp/test',
      executed: true,
      outcome: 'success',
      reasoning: 'User requested',
      rollbackAvailable: true,
    });

    expect(rollback.canRollback(entry.id)).toBe(true);
  });

  it('should return false for non-rollbackable actions', async () => {
    const entry = await trail.record({
      trustLevel: 1,
      domain: 'messaging',
      intent: 'Send message',
      plan: 'Send via Slack',
      executed: true,
      outcome: 'success',
      reasoning: 'Sent',
      rollbackAvailable: false,
    });

    expect(rollback.canRollback(entry.id)).toBe(false);
  });

  it('should return false for unknown audit id', () => {
    expect(rollback.canRollback('nonexistent')).toBe(false);
  });

  it('should perform rollback', async () => {
    const entry = await trail.record({
      trustLevel: 2,
      domain: 'files',
      intent: 'Create file',
      plan: 'Write to /tmp/test',
      executed: true,
      outcome: 'success',
      reasoning: 'User requested',
      rollbackAvailable: true,
    });

    const result = await rollback.rollback(entry.id);
    expect(result.success).toBe(true);

    // Should not be rollbackable anymore
    expect(rollback.canRollback(entry.id)).toBe(false);
  });

  it('should fail rollback for non-existent entry', async () => {
    const result = await rollback.rollback('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Audit entry not found');
  });

  it('should fail rollback for non-rollbackable entry', async () => {
    const entry = await trail.record({
      trustLevel: 1,
      domain: 'messaging',
      intent: 'Send message',
      plan: 'Send',
      executed: true,
      outcome: 'success',
      reasoning: 'Sent',
      rollbackAvailable: false,
    });

    const result = await rollback.rollback(entry.id);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Rollback not available for this action');
  });

  it('should fail double rollback', async () => {
    const entry = await trail.record({
      trustLevel: 2,
      domain: 'files',
      intent: 'Create file',
      plan: 'Write',
      executed: true,
      outcome: 'success',
      reasoning: 'Test',
      rollbackAvailable: true,
    });

    await rollback.rollback(entry.id);
    const result = await rollback.rollback(entry.id);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Action already rolled back');
  });

  it('should return rollback history', async () => {
    const entry = await trail.record({
      trustLevel: 2,
      domain: 'files',
      intent: 'Create file',
      plan: 'Write',
      executed: true,
      outcome: 'success',
      reasoning: 'Test',
      rollbackAvailable: true,
    });

    await rollback.rollback(entry.id);
    const history = rollback.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].outcome).toBe('rolled_back');
  });
});
