import type {
  BehaviorCapability,
  CapabilityCatalog,
  ChannelCapability,
  IntrospectionSources,
  PluginCapability,
  ProviderCapability,
  ToolCapability,
} from './types.js';

type CatalogSection = 'tools' | 'channels' | 'providers' | 'plugins';

export function classifyBehaviorHealth(
  b: { status: string; failCount: number; maxFailures: number },
): BehaviorCapability['health'] {
  if (b.status === 'paused' || b.status === 'deleted') return 'paused';
  if (b.failCount >= b.maxFailures) return 'failing';
  if (b.failCount >= Math.ceil(b.maxFailures / 2)) return 'warning';
  return 'healthy';
}

export class CapabilityCatalogImpl {
  private sources: IntrospectionSources;
  private catalog: CapabilityCatalog;
  private listeners: Array<(catalog: CapabilityCatalog) => void> = [];

  constructor(sources: IntrospectionSources) {
    this.sources = sources;
    this.catalog = {
      tools: [],
      channels: [],
      behaviors: [],
      providers: [],
      plugins: [],
      features: {},
      updatedAt: new Date().toISOString(),
    };
  }

  async rebuild(): Promise<void> {
    this.buildTools();
    this.buildChannels();
    await this.buildBehaviors();
    this.buildProviders();
    this.buildPlugins();
    this.catalog.features = this.sources.getFeatures();
    this.catalog.updatedAt = new Date().toISOString();
    this.notifyListeners();
  }

  async rebuildSection(section: CatalogSection): Promise<void> {
    switch (section) {
      case 'tools':
        this.buildTools();
        break;
      case 'channels':
        this.buildChannels();
        break;
      case 'providers':
        this.buildProviders();
        break;
      case 'plugins':
        this.buildPlugins();
        break;
    }
    this.catalog.updatedAt = new Date().toISOString();
    this.notifyListeners();
  }

  getCatalog(): CapabilityCatalog {
    return { ...this.catalog };
  }

  onChange(cb: (catalog: CapabilityCatalog) => void): void {
    this.listeners.push(cb);
  }

  private buildTools(): void {
    const tools = this.sources.getTools();
    this.catalog.tools = tools.map<ToolCapability>((t) => ({
      name: t.name,
      description: t.description,
      parameterCount: t.parameters.length,
    }));
  }

  private buildChannels(): void {
    const connected = new Set(this.sources.getConnectedChannels());
    const configured = this.sources.getConfiguredChannels();
    const allTypes = new Set([...connected, ...configured]);

    this.catalog.channels = [...allTypes].map<ChannelCapability>((type) => ({
      type,
      connected: connected.has(type),
      hasDefault: this.sources.getDefaultChannelId
        ? this.sources.getDefaultChannelId(type) !== undefined
        : false,
    }));
  }

  private async buildBehaviors(): Promise<void> {
    const behaviors = await this.sources.getBehaviors();
    this.catalog.behaviors = behaviors.map<BehaviorCapability>((b) => ({
      id: b.id,
      type: b.type,
      status: b.status,
      action: b.action,
      runCount: b.runCount,
      failCount: b.failCount,
      maxFailures: b.maxFailures,
      lastRun: b.lastRun,
      health: classifyBehaviorHealth(b),
    }));
  }

  private buildProviders(): void {
    const providers = this.sources.getProviders();
    const primaryName = this.sources.getPrimaryProviderName();
    const fallbackName = this.sources.getFallbackProviderName();

    this.catalog.providers = providers.map<ProviderCapability>((p) => ({
      name: p.name,
      displayName: p.displayName,
      available: true,
      isPrimary: p.name === primaryName,
      isFallback: p.name === fallbackName,
      models: Object.keys(p.models),
    }));
  }

  private buildPlugins(): void {
    const plugins = this.sources.getPlugins();
    this.catalog.plugins = plugins.map<PluginCapability>((p) => ({
      name: p.name,
      version: p.version,
      status: p.status,
      toolCount: p.toolCount,
      behaviorCount: p.behaviorNames.length,
    }));
  }

  private notifyListeners(): void {
    const snapshot = this.getCatalog();
    for (const cb of this.listeners) {
      cb(snapshot);
    }
  }
}
