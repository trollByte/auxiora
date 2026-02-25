import { describe, it, expect } from 'vitest';
import { parseSoulMd } from '../parser.js';

describe('parseSoulMd', () => {
  it('should parse a complete SOUL.md with frontmatter', () => {
    const content = `---
name: Nova
pronouns: she/her
errorStyle: self_deprecating
tone:
  warmth: 0.8
  directness: 0.7
  humor: 0.5
  formality: 0.3
expertise:
  - TypeScript
  - DevOps
catchphrases:
  greeting: Hey there!
  farewell: Catch you later!
boundaries:
  neverJokeAbout:
    - health
  neverAdviseOn:
    - legal
---

# Nova's Personality

She is friendly and approachable.
`;

    const result = parseSoulMd(content);

    expect(result.name).toBe('Nova');
    expect(result.pronouns).toBe('she/her');
    expect(result.errorStyle).toBe('self_deprecating');
    expect(result.tone.warmth).toBe(0.8);
    expect(result.tone.directness).toBe(0.7);
    expect(result.tone.humor).toBe(0.5);
    expect(result.tone.formality).toBe(0.3);
    expect(result.expertise).toEqual(['TypeScript', 'DevOps']);
    expect(result.catchphrases.greeting).toBe('Hey there!');
    expect(result.catchphrases.farewell).toBe('Catch you later!');
    expect(result.boundaries.neverJokeAbout).toEqual(['health']);
    expect(result.boundaries.neverAdviseOn).toEqual(['legal']);
  });

  it('should handle minimal frontmatter with defaults', () => {
    const content = `---
name: Bot
---
`;

    const result = parseSoulMd(content);

    expect(result.name).toBe('Bot');
    expect(result.pronouns).toBe('they/them');
    expect(result.tone.warmth).toBe(0.6);
    expect(result.expertise).toEqual([]);
    expect(result.catchphrases).toEqual({});
    expect(result.boundaries.neverJokeAbout).toEqual([]);
    expect(result.boundaries.neverAdviseOn).toEqual([]);
  });

  it('should throw on content without frontmatter', () => {
    expect(() => parseSoulMd('# Just Markdown')).toThrow(
      'Invalid SOUL.md: missing YAML frontmatter',
    );
  });

  it('should parse quoted strings', () => {
    const content = `---
name: "Assistant: Pro"
pronouns: 'they/them'
---
`;

    const result = parseSoulMd(content);
    expect(result.name).toBe('Assistant: Pro');
    expect(result.pronouns).toBe('they/them');
  });

  it('should handle boolean and numeric values', () => {
    const content = `---
name: Test
tone:
  warmth: 1
  directness: 0
  humor: 0.99
  formality: 0.01
---
`;

    const result = parseSoulMd(content);
    expect(result.tone.warmth).toBe(1);
    expect(result.tone.directness).toBe(0);
    expect(result.tone.humor).toBe(0.99);
    expect(result.tone.formality).toBe(0.01);
  });
});
