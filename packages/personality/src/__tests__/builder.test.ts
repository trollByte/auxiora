import { describe, it, expect } from 'vitest';
import { buildSoulMd } from '../builder.js';
import { parseSoulMd } from '../parser.js';
import type { SoulConfig } from '../types.js';

const sampleConfig: SoulConfig = {
  name: 'Nova',
  pronouns: 'she/her',
  tone: { warmth: 0.8, directness: 0.7, humor: 0.5, formality: 0.3 },
  expertise: ['TypeScript', 'DevOps'],
  errorStyle: 'self_deprecating',
  catchphrases: { greeting: 'Hey there!', farewell: 'Catch you later!' },
  boundaries: {
    neverJokeAbout: ['health'],
    neverAdviseOn: ['legal'],
  },
};

describe('buildSoulMd', () => {
  it('should generate valid SOUL.md content', () => {
    const output = buildSoulMd(sampleConfig);

    expect(output).toContain('---');
    expect(output).toContain('name: Nova');
    expect(output).toContain('pronouns: she/her');
    expect(output).toContain('warmth: 0.8');
    expect(output).toContain('  - TypeScript');
    expect(output).toContain('  - DevOps');
    expect(output).toContain('  greeting: Hey there!');
  });

  it('should include body markdown when provided', () => {
    const output = buildSoulMd(sampleConfig, '# Custom Section\n\nSome text.');

    expect(output).toContain('# Custom Section');
    expect(output).toContain('Some text.');
  });

  it('should omit empty sections', () => {
    const minimal: SoulConfig = {
      name: 'Bot',
      pronouns: 'they/them',
      tone: { warmth: 0.5, directness: 0.5, humor: 0.5, formality: 0.5 },
      expertise: [],
      errorStyle: 'professional',
      catchphrases: {},
      boundaries: { neverJokeAbout: [], neverAdviseOn: [] },
    };

    const output = buildSoulMd(minimal);

    expect(output).not.toContain('expertise:');
    expect(output).not.toContain('catchphrases:');
    expect(output).not.toContain('boundaries:');
  });

  it('should produce output that can be parsed back (roundtrip)', () => {
    const output = buildSoulMd(sampleConfig);
    const parsed = parseSoulMd(output);

    expect(parsed.name).toBe(sampleConfig.name);
    expect(parsed.pronouns).toBe(sampleConfig.pronouns);
    expect(parsed.tone).toEqual(sampleConfig.tone);
    expect(parsed.expertise).toEqual(sampleConfig.expertise);
    expect(parsed.errorStyle).toBe(sampleConfig.errorStyle);
    expect(parsed.catchphrases).toEqual(sampleConfig.catchphrases);
    expect(parsed.boundaries).toEqual(sampleConfig.boundaries);
  });

  it('should quote strings with special YAML characters', () => {
    const config: SoulConfig = {
      ...sampleConfig,
      catchphrases: { greeting: 'Hello: World!' },
    };
    const output = buildSoulMd(config);
    expect(output).toContain('"Hello: World!"');
  });
});
