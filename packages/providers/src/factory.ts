import { AnthropicProvider, type AnthropicProviderOptions } from './anthropic.js';
import { OpenAIProvider, type OpenAIProviderOptions } from './openai.js';
import type { Provider, ProviderConfig } from './types.js';

export type ProviderName = 'anthropic' | 'openai';

export interface ProviderFactoryOptions {
  primary: ProviderName;
  fallback?: ProviderName;
  config: ProviderConfig;
}

export class ProviderFactory {
  private providers: Map<ProviderName, Provider> = new Map();
  private primary: ProviderName;
  private fallback?: ProviderName;

  constructor(options: ProviderFactoryOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback;

    // Initialize configured providers
    if (options.config.anthropic?.apiKey) {
      this.providers.set('anthropic', new AnthropicProvider(options.config.anthropic));
    }

    if (options.config.openai?.apiKey) {
      this.providers.set('openai', new OpenAIProvider(options.config.openai));
    }
  }

  getProvider(name?: ProviderName): Provider {
    const providerName = name || this.primary;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider not configured: ${providerName}`);
    }

    return provider;
  }

  getPrimaryProvider(): Provider {
    return this.getProvider(this.primary);
  }

  getFallbackProvider(): Provider | null {
    if (!this.fallback) return null;

    try {
      return this.getProvider(this.fallback);
    } catch {
      return null;
    }
  }

  async withFallback<T>(
    fn: (provider: Provider) => Promise<T>
  ): Promise<T> {
    try {
      return await fn(this.getPrimaryProvider());
    } catch (error) {
      const fallback = this.getFallbackProvider();
      if (fallback) {
        console.warn(`Primary provider failed, using fallback: ${error}`);
        return await fn(fallback);
      }
      throw error;
    }
  }

  listAvailable(): ProviderName[] {
    return Array.from(this.providers.keys());
  }
}
