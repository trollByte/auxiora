import type { SoulConfig } from './types.js';

function formatYamlValue(value: unknown): string {
  if (typeof value === 'string') {
    // Quote strings that contain characters problematic in YAML value position
    if (/[:#{}[\],&*?|>%@`]/.test(value) || value.includes('\n')) {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return String(value);
}

/**
 * Build a SOUL.md file content string from a SoulConfig.
 */
export function buildSoulMd(config: SoulConfig, bodyMarkdown?: string): string {
  const lines: string[] = ['---'];

  lines.push(`name: ${formatYamlValue(config.name)}`);
  lines.push(`pronouns: ${formatYamlValue(config.pronouns)}`);
  lines.push(`errorStyle: ${formatYamlValue(config.errorStyle)}`);

  // Tone
  lines.push('tone:');
  lines.push(`  warmth: ${config.tone.warmth}`);
  lines.push(`  directness: ${config.tone.directness}`);
  lines.push(`  humor: ${config.tone.humor}`);
  lines.push(`  formality: ${config.tone.formality}`);

  // Expertise
  if (config.expertise.length > 0) {
    lines.push('expertise:');
    for (const item of config.expertise) {
      lines.push(`  - ${formatYamlValue(item)}`);
    }
  }

  // Catchphrases
  const catchphraseEntries = Object.entries(config.catchphrases);
  if (catchphraseEntries.length > 0) {
    lines.push('catchphrases:');
    for (const [key, value] of catchphraseEntries) {
      lines.push(`  ${key}: ${formatYamlValue(value)}`);
    }
  }

  // Boundaries
  const hasJokeBoundaries = config.boundaries.neverJokeAbout.length > 0;
  const hasAdviseBoundaries = config.boundaries.neverAdviseOn.length > 0;
  if (hasJokeBoundaries || hasAdviseBoundaries) {
    lines.push('boundaries:');
    if (hasJokeBoundaries) {
      lines.push('  neverJokeAbout:');
      for (const item of config.boundaries.neverJokeAbout) {
        lines.push(`    - ${formatYamlValue(item)}`);
      }
    }
    if (hasAdviseBoundaries) {
      lines.push('  neverAdviseOn:');
      for (const item of config.boundaries.neverAdviseOn) {
        lines.push(`    - ${formatYamlValue(item)}`);
      }
    }
  }

  lines.push('---');

  if (bodyMarkdown) {
    lines.push('');
    lines.push(bodyMarkdown);
  }

  return lines.join('\n') + '\n';
}
