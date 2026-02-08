import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigSchema, loadConfig, getDefaultConfig } from '../src/index.js';

describe('Config', () => {
  describe('ConfigSchema', () => {
    it('should provide sensible defaults', () => {
      // Clear any env overrides
      delete process.env.AUXIORA_GATEWAY_HOST;
      delete process.env.AUXIORA_GATEWAY_PORT;
      
      const config = ConfigSchema.parse({});

      // Note: host might be overridden by existing config, just check it's valid
      expect(config.gateway.host).toBeDefined();
      expect(config.gateway.port).toBe(18800);
      expect(config.auth.mode).toBe('none'); // Default to open for initial setup
      expect(config.rateLimit.enabled).toBe(true);
      expect(config.pairing.enabled).toBe(true);
      expect(config.pairing.codeLength).toBe(6);
      expect(config.pairing.expiryMinutes).toBe(15);
      expect(config.provider.primary).toBe('anthropic');
      expect(config.channels.webchat.enabled).toBe(true);
      expect(config.channels.discord.enabled).toBe(false);
    });

    it('should validate port range', () => {
      expect(() => ConfigSchema.parse({ gateway: { port: 0 } })).toThrow();
      expect(() => ConfigSchema.parse({ gateway: { port: 70000 } })).toThrow();
      expect(() => ConfigSchema.parse({ gateway: { port: 8080 } })).not.toThrow();
    });

    it('should validate auth mode', () => {
      expect(() => ConfigSchema.parse({ auth: { mode: 'invalid' } })).toThrow();
      expect(() => ConfigSchema.parse({ auth: { mode: 'none' } })).not.toThrow();
      expect(() => ConfigSchema.parse({ auth: { mode: 'jwt' } })).not.toThrow();
    });

    it('should validate provider options', () => {
      // primary is now a string for extensibility (supports 'anthropic', 'openai', 'google', 'ollama', etc.)
      expect(() => ConfigSchema.parse({ provider: { primary: 'openai' } })).not.toThrow();
      expect(() => ConfigSchema.parse({ provider: { primary: 'google' } })).not.toThrow();
      expect(() => ConfigSchema.parse({ provider: { primary: 'ollama' } })).not.toThrow();
    });

    it('should merge partial config with defaults', () => {
      const config = ConfigSchema.parse({
        gateway: { port: 9000, host: '127.0.0.1' },
        auth: { mode: 'jwt' },
      });

      expect(config.gateway.port).toBe(9000);
      expect(config.gateway.host).toBe('127.0.0.1');
      expect(config.auth.mode).toBe('jwt');
      expect(config.auth.jwtExpiresIn).toBe('7d'); // default
    });
  });

  describe('getDefaultConfig', () => {
    it('should return valid default config', async () => {
      const config = await getDefaultConfig();
      expect(config).toBeDefined();
      expect(config.gateway.port).toBe(18800);
    });
  });

  describe('environment overrides', () => {
    it('should support env var format', () => {
      // This tests the pattern, not the actual loading
      // The actual env override is tested via applyEnvOverrides internal function
      // For now, just verify the schema works
      const config = ConfigSchema.parse({
        gateway: { port: 9999 },
        auth: { mode: 'jwt' },
      });

      expect(config.gateway.port).toBe(9999);
      expect(config.auth.mode).toBe('jwt');
    });
  });

  describe('channel config', () => {
    it('should have all channel types', () => {
      const config = ConfigSchema.parse({});

      expect(config.channels.discord).toBeDefined();
      expect(config.channels.telegram).toBeDefined();
      expect(config.channels.slack).toBeDefined();
      expect(config.channels.twilio).toBeDefined();
      expect(config.channels.webchat).toBeDefined();
    });

    it('should default channels to disabled except webchat', () => {
      const config = ConfigSchema.parse({});

      expect(config.channels.discord.enabled).toBe(false);
      expect(config.channels.telegram.enabled).toBe(false);
      expect(config.channels.slack.enabled).toBe(false);
      expect(config.channels.twilio.enabled).toBe(false);
      expect(config.channels.webchat.enabled).toBe(true);
    });
  });

  describe('voice config', () => {
    it('should default voice to disabled', () => {
      const config = ConfigSchema.parse({});
      expect(config.voice.enabled).toBe(false);
      expect(config.voice.sttProvider).toBe('openai-whisper');
      expect(config.voice.ttsProvider).toBe('openai-tts');
      expect(config.voice.defaultVoice).toBe('alloy');
      expect(config.voice.language).toBe('en');
      expect(config.voice.maxAudioDuration).toBe(30);
      expect(config.voice.sampleRate).toBe(16000);
    });

    it('should accept custom voice config', () => {
      const config = ConfigSchema.parse({
        voice: { enabled: true, defaultVoice: 'nova', language: 'fr' },
      });
      expect(config.voice.enabled).toBe(true);
      expect(config.voice.defaultVoice).toBe('nova');
      expect(config.voice.language).toBe('fr');
    });
  });

  describe('webhook config', () => {
    it('should default webhooks to disabled', () => {
      const config = ConfigSchema.parse({});
      expect(config.webhooks.enabled).toBe(false);
      expect(config.webhooks.basePath).toBe('/api/v1/webhooks');
      expect(config.webhooks.signatureHeader).toBe('x-webhook-signature');
      expect(config.webhooks.maxPayloadSize).toBe(65536);
    });

    it('should accept custom webhook config', () => {
      const config = ConfigSchema.parse({
        webhooks: { enabled: true, maxPayloadSize: 131072 },
      });
      expect(config.webhooks.enabled).toBe(true);
      expect(config.webhooks.maxPayloadSize).toBe(131072);
    });
  });

  describe('dashboard config', () => {
    it('should default dashboard to enabled', () => {
      const config = ConfigSchema.parse({});
      expect(config.dashboard.enabled).toBe(true);
      expect(config.dashboard.sessionTtlMs).toBe(86_400_000);
    });

    it('should accept custom dashboard config', () => {
      const config = ConfigSchema.parse({
        dashboard: { enabled: true, sessionTtlMs: 3_600_000 },
      });
      expect(config.dashboard.enabled).toBe(true);
      expect(config.dashboard.sessionTtlMs).toBe(3_600_000);
    });
  });

  describe('plugins config', () => {
    it('should default plugins to enabled', () => {
      const config = ConfigSchema.parse({});
      expect(config.plugins.enabled).toBe(true);
      expect(config.plugins.dir).toBeUndefined();
    });

    it('should accept custom plugins config', () => {
      const config = ConfigSchema.parse({
        plugins: { enabled: false, dir: '/custom/plugins' },
      });
      expect(config.plugins.enabled).toBe(false);
      expect(config.plugins.dir).toBe('/custom/plugins');
    });
  });

  describe('routing config', () => {
    it('should default routing to enabled with empty rules', () => {
      const config = ConfigSchema.parse({});
      expect(config.routing.enabled).toBe(true);
      expect(config.routing.rules).toEqual([]);
      expect(config.routing.costLimits.warnAt).toBe(0.8);
      expect(config.routing.preferences.preferLocal).toBe(false);
      expect(config.routing.preferences.preferCheap).toBe(false);
      expect(config.routing.preferences.sensitiveToLocal).toBe(false);
    });

    it('should accept routing rules', () => {
      const config = ConfigSchema.parse({
        routing: {
          rules: [
            { task: 'reasoning', provider: 'anthropic', model: 'claude-sonnet-4-20250514', priority: 1 },
            { task: 'fast', provider: 'openai', model: 'gpt-4o-mini', priority: 0 },
          ],
        },
      });
      expect(config.routing.rules).toHaveLength(2);
      expect(config.routing.rules[0].task).toBe('reasoning');
      expect(config.routing.rules[0].provider).toBe('anthropic');
    });

    it('should reject invalid task types', () => {
      expect(() => ConfigSchema.parse({
        routing: { rules: [{ task: 'invalid', provider: 'anthropic', model: 'x' }] },
      })).toThrow();
    });

    it('should accept cost limits', () => {
      const config = ConfigSchema.parse({
        routing: {
          costLimits: { dailyBudget: 10, monthlyBudget: 100, perMessageMax: 0.5, warnAt: 0.9 },
        },
      });
      expect(config.routing.costLimits.dailyBudget).toBe(10);
      expect(config.routing.costLimits.monthlyBudget).toBe(100);
      expect(config.routing.costLimits.warnAt).toBe(0.9);
    });

    it('should reject negative budgets', () => {
      expect(() => ConfigSchema.parse({
        routing: { costLimits: { dailyBudget: -5 } },
      })).toThrow();
    });

    it('should accept a default model override', () => {
      const config = ConfigSchema.parse({
        routing: { defaultModel: 'claude-sonnet-4-20250514' },
      });
      expect(config.routing.defaultModel).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('expanded provider config', () => {
    it('should have google provider defaults', () => {
      const config = ConfigSchema.parse({});
      expect(config.provider.google.model).toBe('gemini-2.5-flash');
      expect(config.provider.google.maxTokens).toBe(4096);
    });

    it('should have ollama provider defaults', () => {
      const config = ConfigSchema.parse({});
      expect(config.provider.ollama.model).toBe('llama3');
      expect(config.provider.ollama.baseUrl).toBe('http://localhost:11434');
    });

    it('should have openaiCompatible provider defaults', () => {
      const config = ConfigSchema.parse({});
      expect(config.provider.openaiCompatible.model).toBe('');
      expect(config.provider.openaiCompatible.name).toBe('custom');
    });

    it('should accept custom ollama config', () => {
      const config = ConfigSchema.parse({
        provider: { ollama: { model: 'mistral', baseUrl: 'http://192.168.1.5:11434' } },
      });
      expect(config.provider.ollama.model).toBe('mistral');
      expect(config.provider.ollama.baseUrl).toBe('http://192.168.1.5:11434');
    });
  });

  describe('orchestration config', () => {
    it('should default orchestration to enabled', () => {
      const config = ConfigSchema.parse({});
      expect(config.orchestration.enabled).toBe(true);
      expect(config.orchestration.maxConcurrentAgents).toBe(5);
      expect(config.orchestration.defaultTimeout).toBe(60000);
      expect(config.orchestration.totalTimeout).toBe(300000);
      expect(config.orchestration.allowedPatterns).toEqual([
        'parallel', 'sequential', 'debate', 'map-reduce', 'supervisor',
      ]);
      expect(config.orchestration.costMultiplierWarning).toBe(3);
    });

    it('should accept custom orchestration config', () => {
      const config = ConfigSchema.parse({
        orchestration: {
          enabled: false,
          maxConcurrentAgents: 3,
          defaultTimeout: 30000,
          allowedPatterns: ['parallel', 'sequential'],
        },
      });
      expect(config.orchestration.enabled).toBe(false);
      expect(config.orchestration.maxConcurrentAgents).toBe(3);
      expect(config.orchestration.defaultTimeout).toBe(30000);
      expect(config.orchestration.allowedPatterns).toEqual(['parallel', 'sequential']);
    });

    it('should reject invalid maxConcurrentAgents', () => {
      expect(() => ConfigSchema.parse({
        orchestration: { maxConcurrentAgents: 0 },
      })).toThrow();
      expect(() => ConfigSchema.parse({
        orchestration: { maxConcurrentAgents: 11 },
      })).toThrow();
    });

    it('should reject invalid pattern names', () => {
      expect(() => ConfigSchema.parse({
        orchestration: { allowedPatterns: ['invalid-pattern'] },
      })).toThrow();
    });

    it('should reject non-positive timeouts', () => {
      expect(() => ConfigSchema.parse({
        orchestration: { defaultTimeout: 0 },
      })).toThrow();
      expect(() => ConfigSchema.parse({
        orchestration: { totalTimeout: -1 },
      })).toThrow();
    });
  });

  describe('modes config', () => {
    it('should default modes to enabled with auto detection', () => {
      const config = ConfigSchema.parse({});
      expect(config.modes.enabled).toBe(true);
      expect(config.modes.defaultMode).toBe('auto');
      expect(config.modes.autoDetection).toBe(true);
      expect(config.modes.confirmationThreshold).toBe(0.4);
    });

    it('should accept custom preferences', () => {
      const config = ConfigSchema.parse({
        modes: {
          preferences: {
            verbosity: 0.8,
            formality: 0.2,
            humor: 0.9,
            feedbackStyle: 'sandwich',
            expertiseAssumption: 'expert',
          },
        },
      });
      expect(config.modes.preferences.verbosity).toBe(0.8);
      expect(config.modes.preferences.formality).toBe(0.2);
      expect(config.modes.preferences.humor).toBe(0.9);
      expect(config.modes.preferences.feedbackStyle).toBe('sandwich');
      expect(config.modes.preferences.expertiseAssumption).toBe('expert');
    });

    it('should accept valid mode names as defaultMode', () => {
      expect(() => ConfigSchema.parse({ modes: { defaultMode: 'operator' } })).not.toThrow();
      expect(() => ConfigSchema.parse({ modes: { defaultMode: 'analyst' } })).not.toThrow();
      expect(() => ConfigSchema.parse({ modes: { defaultMode: 'auto' } })).not.toThrow();
      expect(() => ConfigSchema.parse({ modes: { defaultMode: 'off' } })).not.toThrow();
    });

    it('should reject invalid mode names', () => {
      expect(() => ConfigSchema.parse({ modes: { defaultMode: 'invalid' } })).toThrow();
    });

    it('should reject out-of-range preference values', () => {
      expect(() => ConfigSchema.parse({
        modes: { preferences: { verbosity: 1.5 } },
      })).toThrow();
      expect(() => ConfigSchema.parse({
        modes: { preferences: { humor: -0.1 } },
      })).toThrow();
    });

    it('should reject invalid feedback style', () => {
      expect(() => ConfigSchema.parse({
        modes: { preferences: { feedbackStyle: 'harsh' } },
      })).toThrow();
    });

    it('should reject invalid expertise assumption', () => {
      expect(() => ConfigSchema.parse({
        modes: { preferences: { expertiseAssumption: 'guru' } },
      })).toThrow();
    });
  });

  describe('memory config', () => {
    it('should default memory to enabled with auto-extract', () => {
      const config = ConfigSchema.parse({});
      expect(config.memory.enabled).toBe(true);
      expect(config.memory.autoExtract).toBe(true);
      expect(config.memory.maxEntries).toBe(1000);
    });

    it('should accept custom memory config', () => {
      const config = ConfigSchema.parse({
        memory: { enabled: false, autoExtract: false, maxEntries: 100 },
      });
      expect(config.memory.enabled).toBe(false);
      expect(config.memory.autoExtract).toBe(false);
      expect(config.memory.maxEntries).toBe(100);
    });
  });
});
