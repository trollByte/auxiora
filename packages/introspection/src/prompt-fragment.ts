import type { CapabilityCatalog, HealthState } from './types.js';

export interface SelfAwarenessContext {
  /** The default model configured for this instance (e.g. "claude-sonnet-4-5") */
  defaultModel?: string;
  /** The primary provider name (e.g. "anthropic") */
  primaryProvider?: string;
  /** Active personality engine: 'standard' or 'the-architect' */
  personalityEngine?: string;
}

export function generatePromptFragment(catalog: CapabilityCatalog, health: HealthState, context?: SelfAwarenessContext): string {
  const lines: string[] = ['[Self-Awareness]'];

  // Tools — list all names with count
  const toolNames = catalog.tools.map((t) => t.name).join(', ');
  lines.push(`Tools (${catalog.tools.length}): ${toolNames}`);

  // Channels — each with connected/disconnected status
  const channelParts = catalog.channels.map((c) =>
    `${c.type} (${c.connected ? 'connected' : 'disconnected'})`
  );
  lines.push(`Channels: ${channelParts.join(', ')}`);

  // Behaviors — summary counts
  const active = catalog.behaviors.filter((b) => b.status === 'active').length;
  const paused = catalog.behaviors.filter((b) => b.status === 'paused').length;
  const failing = catalog.behaviors.filter((b) => b.health === 'failing').length;
  const parts: string[] = [];
  if (active > 0) parts.push(`${active} active`);
  if (paused > 0) parts.push(`${paused} paused`);
  if (failing > 0) parts.push(`${failing} failing`);
  if (parts.length === 0) parts.push('none');
  lines.push(`Behaviors: ${parts.join(', ')}`);

  // Providers — primary and fallback
  const primary = catalog.providers.find((p) => p.isPrimary);
  const fallback = catalog.providers.find((p) => p.isFallback);
  let providerLine = primary ? `${primary.displayName} (primary)` : 'none';
  if (fallback) providerLine += `, ${fallback.displayName} (fallback)`;
  lines.push(`Provider: ${providerLine}`);

  // Plugins
  const loadedPlugins = catalog.plugins.filter((p) => p.status === 'loaded');
  if (loadedPlugins.length > 0) {
    const names = loadedPlugins.map((p) => p.name).join(', ');
    lines.push(`Plugins: ${loadedPlugins.length} loaded (${names})`);
  }

  // Model — the configured default model
  if (context?.defaultModel) {
    const providerLabel = context.primaryProvider ?? 'unknown';
    lines.push(`Model: ${context.defaultModel} (via ${providerLabel})`);
  }

  // Personality engine
  if (context?.personalityEngine) {
    if (context.personalityEngine === 'the-architect') {
      lines.push('Personality: The Architect (active) — evidence-based reasoning engine that adapts communication style using traits from verified thinkers');
    } else {
      lines.push('Personality: Standard');
    }
  }

  // Health
  if (health.overall === 'healthy') {
    lines.push('Health: All systems operational');
  } else {
    const issueLines = health.issues.map((i) => `- ${i.description}`);
    lines.push(`Health: ${health.overall}\n${issueLines.join('\n')}`);
  }

  return lines.join('\n');
}
