import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChangeLog } from '../src/change-log.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('ChangeLog', () => {
  let log: ChangeLog;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `changelog-test-${Date.now()}.db`);
    log = new ChangeLog(dbPath);
  });

  afterEach(() => {
    log.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it('records a change entry', () => {
    log.record({
      component: 'rate-limit-cooldown',
      description: 'Reduced cooldown from 60s to 30s',
      reason: 'Too aggressive causing unnecessary delays',
    });
    const entries = log.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].component).toBe('rate-limit-cooldown');
    expect(entries[0].description).toBe('Reduced cooldown from 60s to 30s');
  });

  it('records impact assessment', () => {
    const id = log.record({
      component: 'learning-stage',
      description: 'Added learning injection',
      reason: 'Improve from past mistakes',
    });
    log.recordImpact(id, { outcome: 'positive', metric: 'error_rate', before: 0.15, after: 0.08 });
    const entry = log.getById(id);
    expect(entry?.impact).toBeDefined();
    expect(entry?.impact?.outcome).toBe('positive');
    expect(entry?.impact?.before).toBe(0.15);
    expect(entry?.impact?.after).toBe(0.08);
  });

  it('lists entries by component', () => {
    log.record({ component: 'cooldown', description: 'Change A', reason: 'R1' });
    log.record({ component: 'learning', description: 'Change B', reason: 'R2' });
    log.record({ component: 'cooldown', description: 'Change C', reason: 'R3' });
    const cooldownEntries = log.getByComponent('cooldown');
    expect(cooldownEntries).toHaveLength(2);
  });

  it('lists recent entries with limit', () => {
    for (let i = 0; i < 10; i++) {
      log.record({ component: 'test', description: `Change ${i}`, reason: `Reason ${i}` });
    }
    const recent = log.getRecent(5);
    expect(recent).toHaveLength(5);
  });

  it('returns undefined for nonexistent id', () => {
    expect(log.getById(999)).toBeUndefined();
  });

  it('handles close gracefully', () => {
    log.close();
    log.close(); // Double close should not throw
  });
});
