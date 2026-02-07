import { AnthropicProvider, type AnthropicProviderOptions } from './anthropic.js';
import { OpenAIProvider, type OpenAIProviderOptions } from './openai.js';
import { GoogleProvider, type GoogleProviderOptions } from './google.js';
import { OllamaProvider, type OllamaProviderOptions } from './ollama.js';
import { OpenAICompatibleProvider, type OpenAICompatibleProviderOptions } from './openai-compatible.js';
import { readClaudeCliCredentials } from './claude-oauth.js';
import type { Provider, ProviderConfig } from './types.js';

export type ProviderName = string;

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
    const anthropicConfig = options.config.anthropic;
    const hasAnthropicCredentials =
      anthropicConfig?.apiKey ||
      anthropicConfig?.oauthToken ||
      (anthropicConfig?.useCliCredentials !== false && readClaudeCliCredentials() !== null);

    if (hasAnthropicCredentials && anthropicConfig) {
      this.providers.set('anthropic', new AnthropicProvider(anthropicConfig));
    }

    if (options.config.openai?.apiKey) {
      this.providers.set('openai', new OpenAIProvider(options.config.openai));
    }

    if (options.config.google?.apiKey) {
      this.providers.set('google', new GoogleProvider(options.config.google));
    }

    if (options.config.ollama) {
      this.providers.set('ollama', new OllamaProvider(options.config.ollama));
    }

    if (options.config.openaiCompatible?.baseUrl) {
      const compat = options.config.openaiCompatible;
      this.providers.set(
        compat.name || 'openai-compatible',
        new OpenAICompatibleProvider({
          baseUrl: compat.baseUrl,
          apiKey: compat.apiKey,
          model: compat.model || '',
          maxTokens: compat.maxTokens,
          name: compat.name,
        }),
      );
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
