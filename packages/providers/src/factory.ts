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
import { ProfileRotator } from './profile-rotator.js';
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

    // Anthropic: supports apiKeys rotation, but also has OAuth/CLI fallback
    const anthropicConfig = options.config.anthropic;
    if (anthropicConfig) {
      const keys = anthropicConfig.apiKeys ?? (anthropicConfig.apiKey ? [anthropicConfig.apiKey] : []);
      if (keys.length > 0) {
        const provider = new AnthropicProvider({ ...anthropicConfig, apiKey: keys[0]! });
        this.providers.set('anthropic', keys.length > 1
          ? new ProfileRotator(provider, keys)
          : provider,
        );
      } else {
        // OAuth / CLI credentials path — no rotation
        const hasAnthropicCredentials =
          anthropicConfig.oauthToken ||
          (anthropicConfig.useCliCredentials !== false && readClaudeCliCredentials() !== null);
        if (hasAnthropicCredentials) {
          this.providers.set('anthropic', new AnthropicProvider(anthropicConfig));
        }
      }
    }

    // OpenAI
    const openaiConfig = options.config.openai;
    if (openaiConfig) {
      const keys = openaiConfig.apiKeys ?? (openaiConfig.apiKey ? [openaiConfig.apiKey] : []);
      if (keys.length > 0) {
        const provider = new OpenAIProvider({ ...openaiConfig, apiKey: keys[0]! });
        this.providers.set('openai', keys.length > 1
          ? new ProfileRotator(provider, keys)
          : provider,
        );
      }
    }

    // Google
    const googleConfig = options.config.google;
    if (googleConfig) {
      const keys = googleConfig.apiKeys ?? (googleConfig.apiKey ? [googleConfig.apiKey] : []);
      if (keys.length > 0) {
        const provider = new GoogleProvider({ ...googleConfig, apiKey: keys[0]! });
        this.providers.set('google', keys.length > 1
          ? new ProfileRotator(provider, keys)
          : provider,
        );
      }
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

    // Groq
    const groqConfig = options.config.groq;
    if (groqConfig) {
      const keys = groqConfig.apiKeys ?? (groqConfig.apiKey ? [groqConfig.apiKey] : []);
      if (keys.length > 0) {
        const provider = new GroqProvider({ ...groqConfig, apiKey: keys[0]! });
        this.providers.set('groq', keys.length > 1
          ? new ProfileRotator(provider, keys)
          : provider,
        );
      }
    }

    if (options.config.replicate?.apiToken) {
      this.providers.set('replicate', new ReplicateProvider(options.config.replicate));
    }

    // DeepSeek
    const deepseekConfig = options.config.deepseek;
    if (deepseekConfig) {
      const keys = deepseekConfig.apiKeys ?? (deepseekConfig.apiKey ? [deepseekConfig.apiKey] : []);
      if (keys.length > 0) {
        const provider = new DeepSeekProvider({ ...deepseekConfig, apiKey: keys[0]! });
        this.providers.set('deepseek', keys.length > 1
          ? new ProfileRotator(provider, keys)
          : provider,
        );
      }
    }

    // Cohere
    const cohereConfig = options.config.cohere;
    if (cohereConfig) {
      const keys = cohereConfig.apiKeys ?? (cohereConfig.apiKey ? [cohereConfig.apiKey] : []);
      if (keys.length > 0) {
        const provider = new CohereProvider({ ...cohereConfig, apiKey: keys[0]! });
        this.providers.set('cohere', keys.length > 1
          ? new ProfileRotator(provider, keys)
          : provider,
        );
      }
    }

    // XAI
    const xaiConfig = options.config.xai;
    if (xaiConfig) {
      const keys = xaiConfig.apiKeys ?? (xaiConfig.apiKey ? [xaiConfig.apiKey] : []);
      if (keys.length > 0) {
        const provider = new XAIProvider({ ...xaiConfig, apiKey: keys[0]! });
        this.providers.set('xai', keys.length > 1
          ? new ProfileRotator(provider, keys)
          : provider,
        );
      }
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
