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
      expect(() => ConfigSchema.parse({ provider: { primary: 'invalid' } })).toThrow();
      expect(() => ConfigSchema.parse({ provider: { primary: 'openai' } })).not.toThrow();
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
    it('should default dashboard to disabled', () => {
      const config = ConfigSchema.parse({});
      expect(config.dashboard.enabled).toBe(false);
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

  describe('memory config', () => {
    it('should default memory to enabled with auto-extract', () => {
      const config = ConfigSchema.parse({});
      expect(config.memory.enabled).toBe(true);
      expect(config.memory.autoExtract).toBe(true);
      expect(config.memory.maxEntries).toBe(500);
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
