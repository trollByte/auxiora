import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { TrustEngine } from '../src/trust-engine.js';
import { TrustGate } from '../src/trust-gate.js';

describe('TrustGate', () => {
  let tmpDir: string;
  let engine: TrustEngine;
  let gate: TrustGate;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trust-gate-'));
    engine = new TrustEngine({ defaultLevel: 0 }, path.join(tmpDir, 'state.json'));
    await engine.load();
    gate = new TrustGate(engine);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should deny action when trust level is insufficient', () => {
    const result = gate.gate('shell', 'run command', 2);
    expect(result.allowed).toBe(false);
    expect(result.currentLevel).toBe(0);
    expect(result.requiredLevel).toBe(2);
    expect(result.message).toContain('denied');
  });

  it('should allow action when trust level is sufficient', async () => {
    await engine.setTrustLevel('shell', 3, 'Approved');
    const result = gate.gate('shell', 'run command', 2);
    expect(result.allowed).toBe(true);
    expect(result.message).toContain('allowed');
  });

  it('should allow action when trust level exactly matches', async () => {
    await engine.setTrustLevel('files', 2, 'Set');
    const result = gate.gate('files', 'write file', 2);
    expect(result.allowed).toBe(true);
  });

  it('should allow level 0 actions for all', () => {
    const result = gate.gate('messaging', 'view messages', 0);
    expect(result.allowed).toBe(true);
  });

  it('should return correct domain in result', () => {
    const result = gate.gate('finance', 'transfer', 4);
    expect(result.domain).toBe('finance');
  });
});
