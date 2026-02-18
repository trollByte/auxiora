import type { CapabilityCatalog, HealthState, IntrospectionSources } from './types.js';

const TIME_RANGES: Record<string, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
};

type QueryType =
  | 'capabilities'
  | 'health'
  | 'config'
  | 'errors'
  | 'tools'
  | 'channels'
  | 'providers'
  | 'behaviors'
  | 'plugins';

function formatCapabilities(catalog: CapabilityCatalog): string {
  const lines: string[] = ['# Capabilities\n'];

  // Tools
  lines.push('## Tools');
  for (const t of catalog.tools) {
    lines.push(`- **${t.name}**: ${t.description} (${t.parameterCount} params)`);
  }

  // Channels
  lines.push('\n## Channels');
  for (const c of catalog.channels) {
    const status = c.connected ? 'connected' : 'disconnected';
    const def = c.hasDefault ? ', default' : '';
    lines.push(`- ${c.type} (${status}${def})`);
  }

  // Behaviors
  lines.push('\n## Behaviors');
  for (const b of catalog.behaviors) {
    lines.push(`- ${b.id}: ${b.action} [${b.status}] health=${b.health}`);
  }

  // Providers
  lines.push('\n## Providers');
  for (const p of catalog.providers) {
    const role = p.isPrimary ? 'primary' : p.isFallback ? 'fallback' : '';
    const roleStr = role ? ` (${role})` : '';
    lines.push(`- ${p.displayName}${roleStr}: ${p.models.join(', ')}`);
  }

  // Plugins
  if (catalog.plugins.length > 0) {
    lines.push('\n## Plugins');
    for (const p of catalog.plugins) {
      lines.push(`- ${p.name} v${p.version} [${p.status}] (${p.toolCount} tools, ${p.behaviorCount} behaviors)`);
    }
  }

  return lines.join('\n');
}

function formatHealth(health: HealthState): string {
  const lines: string[] = [`# Health: ${health.overall}\n`];

  lines.push('## Subsystems');
  for (const s of health.subsystems) {
    lines.push(`- ${s.name}: ${s.status} (last check: ${s.lastCheck})`);
  }

  if (health.issues.length > 0) {
    lines.push('\n## Active Issues');
    for (const issue of health.issues) {
      lines.push(`- [${issue.severity}] ${issue.description}`);
      if (issue.suggestedFix) {
        lines.push(`  Fix: ${issue.suggestedFix}`);
      }
    }
  }

  return lines.join('\n');
}

function formatConfig(features: Record<string, boolean>): string {
  const lines: string[] = ['# Configuration\n', '## Feature Flags'];
  for (const [key, value] of Object.entries(features)) {
    lines.push(`- ${key}: ${String(value)}`);
  }
  return lines.join('\n');
}

async function formatErrors(
  sources: Pick<IntrospectionSources, 'getAuditEntries'>,
  timeRange: string,
): Promise<string> {
  const rangeMs = TIME_RANGES[timeRange] ?? TIME_RANGES['1h']!;
  const cutoff = Date.now() - rangeMs;
  const entries = await sources.getAuditEntries();
  const recent = entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);

  // Group by event type
  const groups = new Map<string, { count: number; lastTimestamp: string }>();
  for (const entry of recent) {
    const existing = groups.get(entry.event);
    if (existing) {
      existing.count++;
      if (entry.timestamp > existing.lastTimestamp) {
        existing.lastTimestamp = entry.timestamp;
      }
    } else {
      groups.set(entry.event, { count: 1, lastTimestamp: entry.timestamp });
    }
  }

  const lines: string[] = [`# Errors (${timeRange})\n`];
  if (groups.size === 0) {
    lines.push('No errors in this time range.');
  } else {
    for (const [event, data] of groups) {
      lines.push(`- **${event}**: ${data.count} occurrence(s), last at ${data.lastTimestamp}`);
    }
  }

  return lines.join('\n');
}

function formatTools(catalog: CapabilityCatalog): string {
  const lines: string[] = ['# Tools\n'];
  for (const t of catalog.tools) {
    lines.push(`- **${t.name}**: ${t.description} (${t.parameterCount} params)`);
  }
  return lines.join('\n');
}

function formatChannels(catalog: CapabilityCatalog): string {
  const lines: string[] = ['# Channels\n'];
  for (const c of catalog.channels) {
    const status = c.connected ? 'connected' : 'disconnected';
    const def = c.hasDefault ? ', default' : '';
    lines.push(`- ${c.type} (${status}${def})`);
  }
  return lines.join('\n');
}

function formatProviders(catalog: CapabilityCatalog): string {
  const lines: string[] = ['# Providers\n'];
  for (const p of catalog.providers) {
    const role = p.isPrimary ? 'primary' : p.isFallback ? 'fallback' : '';
    const roleStr = role ? ` (${role})` : '';
    const availability = p.available ? 'available' : 'unavailable';
    lines.push(`- **${p.displayName}**${roleStr} [${availability}]: ${p.models.join(', ')}`);
  }
  const primary = catalog.providers.find(p => p.isPrimary);
  if (primary?.models?.length) {
    lines.push(`\nActive model: ${primary.models[0]}`);
  }
  return lines.join('\n');
}

function formatBehaviors(catalog: CapabilityCatalog): string {
  const lines: string[] = ['# Behaviors\n'];
  for (const b of catalog.behaviors) {
    lines.push(`- **${b.id}** (${b.type}): ${b.action}`);
    lines.push(`  Status: ${b.status}, Health: ${b.health}, Runs: ${b.runCount}, Failures: ${b.failCount}/${b.maxFailures}`);
  }
  return lines.join('\n');
}

function formatPlugins(catalog: CapabilityCatalog): string {
  const lines: string[] = ['# Plugins\n'];
  if (catalog.plugins.length === 0) {
    lines.push('No plugins loaded.');
  } else {
    for (const p of catalog.plugins) {
      lines.push(`- **${p.name}** v${p.version} [${p.status}] (${p.toolCount} tools, ${p.behaviorCount} behaviors)`);
    }
  }
  return lines.join('\n');
}

export function createIntrospectTool(
  getCatalog: () => CapabilityCatalog,
  getHealth: () => HealthState,
  sources: Pick<IntrospectionSources, 'getAuditEntries' | 'getFeatures'>,
) {
  return {
    name: 'introspect' as const,
    description: 'Query your own capabilities, health, configuration, and error history.',
    parameters: [
      { name: 'query', type: 'string' as const, required: true },
      { name: 'timeRange', type: 'string' as const, required: false },
    ],
    getPermission: () => ({ level: 'none' as const }),
    async execute(
      params: { query: string; timeRange?: string },
      _context?: unknown,
    ): Promise<{ success: boolean; output?: string; error?: string; metadata?: Record<string, unknown>; duration?: number }> {
      const query = params.query.toLowerCase() as QueryType;
      const catalog = getCatalog();
      const health = getHealth();

      switch (query) {
        case 'capabilities':
          return { success: true, output: formatCapabilities(catalog) };
        case 'health':
          return { success: true, output: formatHealth(health) };
        case 'config':
          return { success: true, output: formatConfig(sources.getFeatures()) };
        case 'errors':
          return { success: true, output: await formatErrors(sources, params.timeRange ?? '1h') };
        case 'tools':
          return { success: true, output: formatTools(catalog) };
        case 'channels':
          return { success: true, output: formatChannels(catalog) };
        case 'providers':
          return { success: true, output: formatProviders(catalog) };
        case 'behaviors':
          return { success: true, output: formatBehaviors(catalog) };
        case 'plugins':
          return { success: true, output: formatPlugins(catalog) };
        default:
          return { success: false, error: `Unknown query type: ${params.query}. Valid queries: capabilities, health, config, errors, tools, channels, providers, behaviors, plugins` };
      }
    },
  };
}
