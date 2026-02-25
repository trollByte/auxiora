import type { SoulConfig } from './types.js';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/**
 * Parse a simple YAML subset into a nested record.
 * Supports: top-level keys, nested object keys (2-space indent),
 * arrays at 2-space indent, sub-keys under nested objects (4-space indent),
 * and arrays at 4-space indent.
 */
function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  // Track current hierarchy: topKey, nestedKey
  let topKey = '';
  let topObj: Record<string, unknown> | null = null;
  let nestedKey = '';

  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    // 4-space array item (under a nested object's sub-key)
    const deep4ArrayMatch = line.match(/^    - (.+)$/);
    if (deep4ArrayMatch && topObj && nestedKey) {
      if (!Array.isArray(topObj[nestedKey])) {
        topObj[nestedKey] = [];
      }
      (topObj[nestedKey] as unknown[]).push(parseYamlValue(deep4ArrayMatch[1]));
      continue;
    }

    // 2-space key or array item
    const indent2Match = line.match(/^  (\w+):\s*(.*)$/);
    if (indent2Match && topKey) {
      // This is a sub-key under the current top-level key
      if (topObj === null) {
        topObj = {};
        result[topKey] = topObj;
      }
      const [, key, value] = indent2Match;
      nestedKey = key;
      if (value === '') {
        // Sub-key with children (array or deeper object) — set undefined for now
        topObj[key] = undefined;
      } else {
        topObj[key] = parseYamlValue(value);
      }
      continue;
    }

    const indent2ArrayMatch = line.match(/^  - (.+)$/);
    if (indent2ArrayMatch && topKey) {
      nestedKey = '';
      if (!Array.isArray(result[topKey])) {
        result[topKey] = [];
      }
      (result[topKey] as unknown[]).push(parseYamlValue(indent2ArrayMatch[1]));
      continue;
    }

    // Top-level key
    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (topMatch) {
      const [, key, value] = topMatch;
      topKey = key;
      topObj = null;
      nestedKey = '';
      if (value === '') {
        result[topKey] = undefined;
      } else {
        result[topKey] = parseYamlValue(value);
      }
    }
  }

  return result;
}

function parseYamlValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  // Strip surrounding quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse a SOUL.md file content into a SoulConfig.
 */
export function parseSoulMd(content: string): SoulConfig {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error('Invalid SOUL.md: missing YAML frontmatter (expected --- delimiters)');
  }

  const [, yamlPart] = match;
  const data = parseYaml(yamlPart);

  const tone = (data.tone ?? {}) as Record<string, unknown>;
  const boundaries = (data.boundaries ?? {}) as Record<string, unknown>;
  const catchphrases = (data.catchphrases ?? {}) as Record<string, unknown>;

  return {
    name: String(data.name ?? 'Auxiora'),
    pronouns: String(data.pronouns ?? 'they/them'),
    tone: {
      warmth: Number(tone.warmth ?? 0.6),
      directness: Number(tone.directness ?? 0.5),
      humor: Number(tone.humor ?? 0.3),
      formality: Number(tone.formality ?? 0.5),
    },
    expertise: Array.isArray(data.expertise) ? data.expertise.map(String) : [],
    errorStyle: String(data.errorStyle ?? 'professional'),
    catchphrases: Object.fromEntries(
      Object.entries(catchphrases).map(([k, v]) => [k, String(v)]),
    ),
    boundaries: {
      neverJokeAbout: Array.isArray(boundaries.neverJokeAbout)
        ? boundaries.neverJokeAbout.map(String)
        : [],
      neverAdviseOn: Array.isArray(boundaries.neverAdviseOn)
        ? boundaries.neverAdviseOn.map(String)
        : [],
    },
  };
}
