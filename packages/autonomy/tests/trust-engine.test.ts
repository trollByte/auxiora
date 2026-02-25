import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { TrustEngine } from '../src/trust-engine.js';
import type { TrustLevel } from '../src/types.js';

describe('TrustEngine', () => {
  let tmpDir: string;
  let statePath: string;
  let engine: TrustEngine;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trust-engine-'));
    statePath = path.join(tmpDir, 'trust-state.json');
    engine = new TrustEngine({ defaultLevel: 0 }, statePath);
    await engine.load();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should start with default trust level', () => {
    expect(engine.getTrustLevel('messaging')).toBe(0);
    expect(engine.getTrustLevel('files')).toBe(0);
    expect(engine.getTrustLevel('shell')).toBe(0);
  });

  it('should return all levels', () => {
    const levels = engine.getAllLevels();
    expect(levels.messaging).toBe(0);
    expect(levels.files).toBe(0);
    expect(Object.keys(levels).length).toBeGreaterThanOrEqual(9);
  });

  it('should set trust level manually', async () => {
    await engine.setTrustLevel('messaging', 3, 'User approved');
    expect(engine.getTrustLevel('messaging')).toBe(3);
  });

  it('should record a promotion when level increases', async () => {
    await engine.setTrustLevel('web', 2, 'Good behavior');
    const promotions = engine.getPromotions();
    expect(promotions).toHaveLength(1);
    expect(promotions[0].domain).toBe('web');
    expect(promotions[0].fromLevel).toBe(0);
    expect(promotions[0].toLevel).toBe(2);
    expect(promotions[0].automatic).toBe(false);
  });

  it('should record a demotion when level decreases', async () => {
    await engine.setTrustLevel('shell', 3, 'Initial');
    await engine.setTrustLevel('shell', 1, 'Bad behavior');
    const demotions = engine.getDemotions();
    expect(demotions).toHaveLength(1);
    expect(demotions[0].fromLevel).toBe(3);
    expect(demotions[0].toLevel).toBe(1);
  });

  it('should not change when setting same level', async () => {
    await engine.setTrustLevel('messaging', 0, 'No change');
    expect(engine.getPromotions()).toHaveLength(0);
    expect(engine.getDemotions()).toHaveLength(0);
  });

  it('should check permission correctly', async () => {
    await engine.setTrustLevel('files', 2, 'Set level');
    expect(engine.checkPermission('files', 2)).toBe(true);
    expect(engine.checkPermission('files', 1)).toBe(true);
    expect(engine.checkPermission('files', 3)).toBe(false);
  });

  it('should auto-demote after consecutive failures', async () => {
    await engine.setTrustLevel('web', 2, 'Initial');

    // Record failures up to demotion threshold (default 3)
    await engine.recordOutcome('web', false);
    await engine.recordOutcome('web', false);
    const result = await engine.recordOutcome('web', false);

    expect(result).not.toBeNull();
    expect(engine.getTrustLevel('web')).toBe(1);
  });

  it('should reset failure count on success', async () => {
    await engine.setTrustLevel('web', 2, 'Initial');

    await engine.recordOutcome('web', false);
    await engine.recordOutcome('web', false);
    await engine.recordOutcome('web', true); // Resets failures

    await engine.recordOutcome('web', false);
    await engine.recordOutcome('web', false);

    // Should still be at level 2 since failures were reset
    expect(engine.getTrustLevel('web')).toBe(2);
  });

  it('should auto-promote after enough successes', async () => {
    engine = new TrustEngine(
      { defaultLevel: 0, autoPromote: true, promotionThreshold: 3, autoPromoteCeiling: 3 },
      statePath,
    );
    await engine.load();

    await engine.recordOutcome('messaging', true);
    await engine.recordOutcome('messaging', true);
    const result = await engine.recordOutcome('messaging', true);

    expect(result).not.toBeNull();
    expect(engine.getTrustLevel('messaging')).toBe(1);
  });

  it('should not auto-promote above ceiling', async () => {
    engine = new TrustEngine(
      { defaultLevel: 0, autoPromote: true, promotionThreshold: 1, autoPromoteCeiling: 2 },
      statePath,
    );
    await engine.load();

    // Promote 0 -> 1
    await engine.recordOutcome('messaging', true);
    expect(engine.getTrustLevel('messaging')).toBe(1);

    // Promote 1 -> 2
    await engine.recordOutcome('messaging', true);
    expect(engine.getTrustLevel('messaging')).toBe(2);

    // Should NOT promote above ceiling
    await engine.recordOutcome('messaging', true);
    expect(engine.getTrustLevel('messaging')).toBe(2);
  });

  it('should not auto-promote when disabled', async () => {
    engine = new TrustEngine(
      { defaultLevel: 0, autoPromote: false, promotionThreshold: 1 },
      statePath,
    );
    await engine.load();

    await engine.recordOutcome('messaging', true);
    await engine.recordOutcome('messaging', true);
    expect(engine.getTrustLevel('messaging')).toBe(0);
  });

  it('should persist and reload state', async () => {
    await engine.setTrustLevel('shell', 3, 'Set level');
    await engine.save();

    const engine2 = new TrustEngine({}, statePath);
    await engine2.load();

    expect(engine2.getTrustLevel('shell')).toBe(3);
  });

  it('should demote explicitly', async () => {
    await engine.setTrustLevel('finance', 3, 'Initial');
    const result = await engine.demote('finance', 'User requested');

    expect(result).not.toBeNull();
    expect(result!.fromLevel).toBe(3);
    expect(result!.toLevel).toBe(2);
    expect(engine.getTrustLevel('finance')).toBe(2);
  });

  it('should return null when demoting from level 0', async () => {
    const result = await engine.demote('messaging', 'Already at zero');
    expect(result).toBeNull();
  });

  it('should return evidence', async () => {
    await engine.recordOutcome('web', true);
    await engine.recordOutcome('web', true);
    await engine.recordOutcome('web', false);

    const ev = engine.getEvidence('web');
    expect(ev.successes).toBe(2); // Not reset on failure
    expect(ev.failures).toBe(1);
    expect(ev.lastActionAt).toBeGreaterThan(0);
  });
});
