import { AnthropicProvider, type AnthropicProviderOptions } from './anthropic.js';
import { OpenAIProvider, type OpenAIProviderOptions } from './openai.js';
import { GoogleProvider, type GoogleProviderOptions } from './google.js';
import { OllamaProvider, type OllamaProviderOptions } from './ollama.js';
import { OpenAICompatibleProvider, type OpenAICompatibleProviderOptions } from './openai-compatible.js';
import { GroqProvider, type GroqProviderOptions } from './groq.js';
import { ReplicateProvider, type ReplicateProviderOptions } from './replicate.js';
import { DeepSeekProvider, type DeepSeekProviderOptions } from './deepseek.js';
import { CohereProvider, type CohereProviderOptions } from './cohere.js';
import { XAIProvider, type XAIProviderOptions } from './xai.js';
import { readClaudeCliCredentials } from './claude-oauth.js';
import { getLogger } from '@auxiora/logger';
import type { Provider, ProviderConfig } from './types.js';

const logger = getLogger('providers');

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

    if (options.config.groq?.apiKey) {
      this.providers.set('groq', new GroqProvider(options.config.groq));
    }

    if (options.config.replicate?.apiToken) {
      this.providers.set('replicate', new ReplicateProvider(options.config.replicate));
    }

    if (options.config.deepseek?.apiKey) {
      this.providers.set('deepseek', new DeepSeekProvider(options.config.deepseek));
    }

    if (options.config.cohere?.apiKey) {
      this.providers.set('cohere', new CohereProvider(options.config.cohere));
    }

    if (options.config.xai?.apiKey) {
      this.providers.set('xai', new XAIProvider(options.config.xai));
    }

    // Auto-fallback: if configured primary isn't available, use first registered provider
    if (this.providers.size > 0 && !this.providers.has(this.primary)) {
      const firstAvailable = this.providers.keys().next().value as string;
      logger.warn(`Provider '${this.primary}' not configured, falling back to '${firstAvailable}'`);
      this.primary = firstAvailable;
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
        logger.warn('Primary provider failed, using fallback', { error: error instanceof Error ? error : new Error(String(error)) });
        return await fn(fallback);
      }
      throw error;
    }
  }

  listAvailable(): ProviderName[] {
    return Array.from(this.providers.keys());
  }

  resolveFallbackCandidates(modelOverride?: string): Array<{
    provider: Provider;
    name: string;
    model: string;
  }> {
    const seen = new Set<string>();
    const candidates: Array<{ provider: Provider; name: string; model: string }> = [];

    const add = (name: string) => {
      if (seen.has(name)) return;
      const provider = this.providers.get(name);
      if (!provider) return;
      seen.add(name);
      candidates.push({
        provider,
        name,
        model: modelOverride ?? provider.defaultModel,
      });
    };

    // 1. Primary first
    add(this.primary);

    // 2. Configured fallback
    if (this.fallback) add(this.fallback);

    // 3. All remaining available providers
    for (const name of this.providers.keys()) {
      add(name);
    }

    return candidates;
  }
}
