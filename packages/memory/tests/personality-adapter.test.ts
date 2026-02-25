import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryStore } from '../src/store.js';
import { PersonalityAdapter } from '../src/personality-adapter.js';

let tmpDir: string;

describe('PersonalityAdapter', () => {
  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `auxiora-personality-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should record a personality signal', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const adapter = new PersonalityAdapter(store);

    await adapter.recordSignal({
      trait: 'humor',
      adjustment: 0.3,
      reason: 'User responds positively to jokes',
      signalCount: 1,
    });

    const adjustments = await adapter.getAdjustments();
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].trait).toBe('humor');
  });

  it('should accumulate signals for the same trait', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const adapter = new PersonalityAdapter(store);

    await adapter.recordSignal({
      trait: 'humor',
      adjustment: 0.3,
      reason: 'User laughed at a joke',
      signalCount: 1,
    });

    await adapter.recordSignal({
      trait: 'humor',
      adjustment: 0.3,
      reason: 'User made a joke back',
      signalCount: 1,
    });

    const adjustments = await adapter.getAdjustments();
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].signalCount).toBe(2);
    // Adjustment should grow but not exceed 1
    expect(adjustments[0].adjustment).toBeGreaterThan(0);
    expect(adjustments[0].adjustment).toBeLessThanOrEqual(1);
  });

  it('should track different traits independently', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const adapter = new PersonalityAdapter(store);

    await adapter.recordSignal({
      trait: 'humor',
      adjustment: 0.3,
      reason: 'User likes humor',
      signalCount: 1,
    });

    await adapter.recordSignal({
      trait: 'formality',
      adjustment: -0.2,
      reason: 'User uses casual language',
      signalCount: 1,
    });

    const adjustments = await adapter.getAdjustments();
    expect(adjustments).toHaveLength(2);
    const humor = adjustments.find(a => a.trait === 'humor');
    const formality = adjustments.find(a => a.trait === 'formality');
    expect(humor).toBeDefined();
    expect(formality).toBeDefined();
  });

  it('should generate prompt modifier', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const adapter = new PersonalityAdapter(store);

    await adapter.recordSignal({
      trait: 'humor',
      adjustment: 0.5,
      reason: 'User responds positively to jokes',
      signalCount: 3,
    });

    await adapter.recordSignal({
      trait: 'formality',
      adjustment: -0.5,
      reason: 'User uses casual language',
      signalCount: 3,
    });

    const modifier = await adapter.getPromptModifier();
    expect(modifier).toContain('Personality Adaptations');
    expect(modifier).toContain('humor');
    expect(modifier).toContain('formality');
  });

  it('should return empty string when no adjustments', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const adapter = new PersonalityAdapter(store);

    const modifier = await adapter.getPromptModifier();
    expect(modifier).toBe('');
  });

  it('should skip very small adjustments in prompt modifier', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const adapter = new PersonalityAdapter(store);

    await adapter.recordSignal({
      trait: 'verbosity',
      adjustment: 0.05,
      reason: 'Weak signal',
      signalCount: 1,
    });

    const modifier = await adapter.getPromptModifier();
    // Adjustment of 0.05 < 0.1 threshold, so should not appear
    // However the accumulation with 0.2 factor makes it 0.01, definitely below threshold
    expect(modifier).toBe('');
  });

  it('should clamp adjustments to [-1, 1]', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const adapter = new PersonalityAdapter(store);

    // Send many strong positive signals
    for (let i = 0; i < 50; i++) {
      await adapter.recordSignal({
        trait: 'humor',
        adjustment: 1.0,
        reason: 'Very funny',
        signalCount: 1,
      });
    }

    const adjustments = await adapter.getAdjustments();
    expect(adjustments[0].adjustment).toBeLessThanOrEqual(1);
    expect(adjustments[0].adjustment).toBeGreaterThanOrEqual(-1);
  });
});
