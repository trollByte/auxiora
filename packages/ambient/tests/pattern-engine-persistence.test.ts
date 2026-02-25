import { describe, it, expect } from 'vitest';
import { AmbientPatternEngine } from '../src/pattern-engine.js';

describe('AmbientPatternEngine persistence', () => {
  it('serialize() returns a JSON string of internal state', () => {
    const engine = new AmbientPatternEngine();
    engine.observe({ type: 'test', timestamp: Date.now() });
    const serialized = engine.serialize();
    const parsed = JSON.parse(serialized);
    expect(parsed).toHaveProperty('events');
    expect(parsed).toHaveProperty('patterns');
    expect(parsed.events).toHaveLength(1);
  });

  it('static deserialize() reconstructs engine state', () => {
    const engine = new AmbientPatternEngine();
    const now = Date.now();
    engine.observe({ type: 'login', timestamp: now - 1000 });
    engine.observe({ type: 'login', timestamp: now - 500 });
    engine.observe({ type: 'login', timestamp: now });
    engine.detectPatterns();

    const serialized = engine.serialize();
    const restored = AmbientPatternEngine.deserialize(serialized);

    expect(restored.getEventCount()).toBe(3);
    expect(restored.getPatterns().length).toBe(engine.getPatterns().length);
  });

  it('deserialized engine can continue observing and detecting', () => {
    const engine = new AmbientPatternEngine();
    engine.observe({ type: 'check', timestamp: Date.now() });
    const restored = AmbientPatternEngine.deserialize(engine.serialize());
    restored.observe({ type: 'check', timestamp: Date.now() + 1000 });
    expect(restored.getEventCount()).toBe(2);
  });

  it('deserialize() with invalid JSON throws', () => {
    expect(() => AmbientPatternEngine.deserialize('not-json')).toThrow();
  });

  it('round-trips pattern IDs and confidence', () => {
    const engine = new AmbientPatternEngine();
    const base = Date.now();
    for (let i = 0; i < 5; i++) {
      const d = new Date(base);
      d.setHours(14, 0, 0, 0);
      d.setDate(d.getDate() - i);
      engine.observe({ type: 'standup', timestamp: d.getTime() });
    }
    engine.detectPatterns();
    const original = engine.getPatterns();

    const restored = AmbientPatternEngine.deserialize(engine.serialize());
    const restoredPatterns = restored.getPatterns();

    expect(restoredPatterns.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restoredPatterns[i]!.id).toBe(original[i]!.id);
      expect(restoredPatterns[i]!.confidence).toBe(original[i]!.confidence);
    }
  });
});
