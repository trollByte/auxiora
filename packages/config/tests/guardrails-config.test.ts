import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '../src/index.js';

describe('GuardrailsConfig', () => {
  it('provides sensible defaults when guardrails key is omitted', () => {
    const config = ConfigSchema.parse({});
    expect(config.guardrails).toEqual({
      enabled: true,
      piiDetection: true,
      promptInjection: true,
      toxicityFilter: true,
      blockThreshold: 'high',
      redactPii: true,
      scanOutput: true,
    });
  });

  it('accepts partial overrides', () => {
    const config = ConfigSchema.parse({
      guardrails: { enabled: false, blockThreshold: 'critical' },
    });
    expect(config.guardrails.enabled).toBe(false);
    expect(config.guardrails.blockThreshold).toBe('critical');
    expect(config.guardrails.piiDetection).toBe(true);
  });

  it('rejects invalid blockThreshold', () => {
    expect(() =>
      ConfigSchema.parse({ guardrails: { blockThreshold: 'extreme' } }),
    ).toThrow();
  });
});
