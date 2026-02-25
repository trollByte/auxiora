import { describe, it, expect, vi } from 'vitest';
import { AmbientPatternEngine } from '@auxiora/ambient';

describe('ambient pattern persistence', () => {
  const VAULT_KEY = 'ambient:patterns';

  it('round-trips engine state through serialize/deserialize', () => {
    const engine = new AmbientPatternEngine();
    engine.observe({ type: 'test', timestamp: Date.now() });
    const serialized = engine.serialize();
    const restored = AmbientPatternEngine.deserialize(serialized);
    expect(restored.getEventCount()).toBe(1);
  });

  it('starts fresh when vault data is undefined', () => {
    const vaultGet = vi.fn().mockReturnValue(undefined);
    const stored = vaultGet(VAULT_KEY);
    const engine = stored
      ? AmbientPatternEngine.deserialize(stored)
      : new AmbientPatternEngine();
    expect(engine.getEventCount()).toBe(0);
  });

  it('starts fresh when vault data is corrupt', () => {
    let engine: AmbientPatternEngine;
    try {
      engine = AmbientPatternEngine.deserialize('not-valid-json');
    } catch {
      engine = new AmbientPatternEngine();
    }
    expect(engine.getEventCount()).toBe(0);
  });
});
