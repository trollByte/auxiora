import { getLogger } from '@auxiora/logger';
import type {
  MarketplaceConfig,
  PluginListing,
  SearchOptions,
  SearchResult,
  InstallResult,
  PublishResult,
  InstalledPlugin,
  UpdateInfo,
  PersonalityListing,
  PersonalitySearchResult,
  PersonalityInstallResult,
  PersonalityPublishResult,
} from './types.js';

const logger = getLogger('marketplace:registry');

export class RegistryClient {
  private config: MarketplaceConfig;
  private installed: Map<string, InstalledPlugin> = new Map();

  constructor(config: MarketplaceConfig) {
    this.config = config;
  }

  async search(options: SearchOptions = {}): Promise<SearchResult> {
    const url = new URL('/api/v1/plugins/search', this.config.registryUrl);
    if (options.query) url.searchParams.set('q', options.query);
    if (options.keywords?.length) url.searchParams.set('keywords', options.keywords.join(','));
    if (options.author) url.searchParams.set('author', options.author);
    if (options.sortBy) url.searchParams.set('sort', options.sortBy);
    if (options.limit) url.searchParams.set('limit', String(options.limit));
    if (options.offset) url.searchParams.set('offset', String(options.offset));

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Registry search failed: ${response.status} ${response.statusText}`);
    }

    return await response.json() as SearchResult;
  }

  async getPlugin(name: string): Promise<PluginListing | null> {
    const url = new URL(`/api/v1/plugins/${encodeURIComponent(name)}`, this.config.registryUrl);

    const response = await fetch(url.toString());
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Registry lookup failed: ${response.status} ${response.statusText}`);
    }

    return await response.json() as PluginListing;
  }

  async install(name: string, version?: string): Promise<InstallResult> {
    const url = new URL('/api/v1/plugins/install', this.config.registryUrl);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, version, installDir: this.config.installDir }),
    });

    if (!response.ok) {
      return {
        success: false,
        name,
        version: version ?? 'latest',
        installedAt: new Date().toISOString(),
        dependencies: [],
        error: `Install failed: ${response.status} ${response.statusText}`,
      };
    }

    const result = await response.json() as InstallResult;

    if (result.success) {
      this.installed.set(name, {
        name,
        version: result.version,
        installedAt: result.installedAt,
        updatedAt: result.installedAt,
        autoUpdate: this.config.autoUpdate,
        permissions: [],
      });
      logger.info('Plugin installed', { name, version: result.version });
    }

    return result;
  }

  async update(name: string): Promise<InstallResult> {
    const current = this.installed.get(name);
    if (!current) {
      return {
        success: false,
        name,
        version: 'unknown',
        installedAt: new Date().toISOString(),
        dependencies: [],
        error: `Plugin "${name}" is not installed`,
      };
    }

    return this.install(name);
  }

  async uninstall(name: string): Promise<boolean> {
    if (!this.installed.has(name)) {
      return false;
    }

    this.installed.delete(name);
    logger.info('Plugin uninstalled', { name });
    return true;
  }

  async publish(pluginPath: string): Promise<PublishResult> {
    const url = new URL('/api/v1/plugins/publish', this.config.registryUrl);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pluginPath }),
    });

    if (!response.ok) {
      return {
        success: false,
        name: 'unknown',
        version: 'unknown',
        publishedAt: new Date().toISOString(),
        error: `Publish failed: ${response.status} ${response.statusText}`,
      };
    }

    const result = await response.json() as PublishResult;
    if (result.success) {
      logger.info('Plugin published', { name: result.name, version: result.version });
    }
    return result;
  }

  listInstalled(): InstalledPlugin[] {
    return Array.from(this.installed.values());
  }

  async checkUpdates(): Promise<UpdateInfo[]> {
    const updates: UpdateInfo[] = [];

    for (const [name, plugin] of this.installed) {
      try {
        const listing = await this.getPlugin(name);
        if (listing) {
          updates.push({
            name,
            currentVersion: plugin.version,
            latestVersion: listing.version,
            hasUpdate: listing.version !== plugin.version,
          });
        }
      } catch (error) {
        logger.warn('Failed to check update', { name, error: error instanceof Error ? error : new Error(String(error)) });
      }
    }

    return updates;
  }

  async searchPersonalities(options: SearchOptions = {}): Promise<PersonalitySearchResult> {
    const url = new URL('/api/v1/personalities/search', this.config.registryUrl);
    if (options.query) url.searchParams.set('q', options.query);
    if (options.keywords?.length) url.searchParams.set('keywords', options.keywords.join(','));
    if (options.author) url.searchParams.set('author', options.author);
    if (options.sortBy) url.searchParams.set('sort', options.sortBy);
    if (options.limit) url.searchParams.set('limit', String(options.limit));
    if (options.offset) url.searchParams.set('offset', String(options.offset));

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Personality search failed: ${response.status} ${response.statusText}`);
    }

    return await response.json() as PersonalitySearchResult;
  }

  async getPersonality(name: string): Promise<PersonalityListing | null> {
    const url = new URL(`/api/v1/personalities/${encodeURIComponent(name)}`, this.config.registryUrl);

    const response = await fetch(url.toString());
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Personality lookup failed: ${response.status} ${response.statusText}`);
    }

    return await response.json() as PersonalityListing;
  }

  async installPersonality(name: string, version?: string): Promise<PersonalityInstallResult> {
    const url = new URL('/api/v1/personalities/install', this.config.registryUrl);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, version, installDir: this.config.installDir }),
    });

    if (!response.ok) {
      return {
        success: false,
        name,
        version: version ?? 'latest',
        installedAt: new Date().toISOString(),
        error: `Personality install failed: ${response.status} ${response.statusText}`,
      };
    }

    const result = await response.json() as PersonalityInstallResult;
    if (result.success) {
      logger.info('Personality installed', { name, version: result.version });
    }
    return result;
  }

  async publishPersonality(personalityPath: string): Promise<PersonalityPublishResult> {
    const url = new URL('/api/v1/personalities/publish', this.config.registryUrl);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: personalityPath }),
    });

    if (!response.ok) {
      return {
        success: false,
        name: 'unknown',
        version: 'unknown',
        publishedAt: new Date().toISOString(),
        error: `Personality publish failed: ${response.status} ${response.statusText}`,
      };
    }

    const result = await response.json() as PersonalityPublishResult;
    if (result.success) {
      logger.info('Personality published', { name: result.name, version: result.version });
    }
    return result;
  }

  getConfig(): MarketplaceConfig {
    return { ...this.config };
  }
}
