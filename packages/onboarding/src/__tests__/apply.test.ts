import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { OnboardingAnswers } from '../types.js';

// We need to mock the config and core modules before importing apply
const mockConfig = {
  agent: { name: 'Auxiora', pronouns: 'they/them', personality: 'professional', tone: { warmth: 0.6, directness: 0.5, humor: 0.3, formality: 0.5 }, expertise: [], errorStyle: 'professional' as const, catchphrases: {}, boundaries: { neverJokeAbout: [], neverAdviseOn: [] } },
  provider: { primary: 'anthropic' as const, anthropic: { model: 'claude-sonnet-4-20250514', maxTokens: 4096 }, openai: { model: 'gpt-4o', maxTokens: 4096 } },
  channels: {
    webchat: { enabled: true },
    discord: { enabled: false, mentionOnly: true },
    telegram: { enabled: false, webhookMode: false },
    slack: { enabled: false, socketMode: true },
    twilio: { enabled: false, smsEnabled: true, whatsappEnabled: false },
  },
  gateway: { host: '0.0.0.0', port: 18800, corsOrigins: ['http://localhost:18800'] },
  auth: { mode: 'none' as const, jwtExpiresIn: '7d', refreshExpiresIn: '30d' },
  rateLimit: { enabled: true, windowMs: 60000, maxRequests: 60 },
  pairing: { enabled: true, codeLength: 6, expiryMinutes: 15 },
  session: { maxContextTokens: 100000, ttlMinutes: 1440, autoSave: true, compactionEnabled: true },
  logging: { level: 'info' as const, auditEnabled: true, maxFileSizeMb: 10, maxFiles: 5 },
  voice: { enabled: false, sttProvider: 'openai-whisper' as const, ttsProvider: 'openai-tts' as const, defaultVoice: 'alloy', language: 'en', maxAudioDuration: 30, sampleRate: 16000 },
  webhooks: { enabled: false, basePath: '/api/v1/webhooks', signatureHeader: 'x-webhook-signature', maxPayloadSize: 65536 },
  dashboard: { enabled: false, sessionTtlMs: 86400000 },
  plugins: { enabled: true },
  memory: { enabled: true, autoExtract: true, maxEntries: 500 },
};

let tmpDir: string;
let soulPath: string;

vi.mock('@auxiora/config', () => ({
  loadConfig: vi.fn(async () => JSON.parse(JSON.stringify(mockConfig))),
  saveConfig: vi.fn(async () => {}),
}));

vi.mock('@auxiora/core', () => {
  return {
    getSoulPath: () => soulPath,
    getWorkspacePath: () => path.dirname(soulPath),
  };
});

vi.mock('@auxiora/personality', () => ({
  PersonalityManager: vi.fn().mockImplementation(() => ({
    applyTemplate: vi.fn().mockRejectedValue(new Error('no templates dir')),
  })),
}));

// Import after mocks
const { applyOnboarding } = await import('../apply.js');
const { saveConfig } = await import('@auxiora/config');

describe('applyOnboarding', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarding-test-'));
    soulPath = path.join(tmpDir, 'workspace', 'SOUL.md');
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should save config with agent identity', async () => {
    const answers: OnboardingAnswers = {
      agentName: 'Luna',
      pronouns: 'she/her',
      personality: 'friendly',
      provider: 'anthropic',
      apiKey: 'sk-test',
      channels: ['webchat', 'discord'],
    };

    const result = await applyOnboarding(answers);

    expect(result.configSaved).toBe(true);
    expect(saveConfig).toHaveBeenCalledTimes(1);

    const savedConfig = vi.mocked(saveConfig).mock.calls[0][0];
    expect(savedConfig.agent.name).toBe('Luna');
    expect(savedConfig.agent.pronouns).toBe('she/her');
    expect(savedConfig.agent.personality).toBe('friendly');
    expect(savedConfig.provider.primary).toBe('anthropic');
  });

  it('should enable selected channels', async () => {
    const answers: OnboardingAnswers = {
      agentName: 'Test',
      pronouns: 'they/them',
      personality: 'professional',
      provider: 'openai',
      apiKey: 'sk-test',
      channels: ['discord', 'slack'],
    };

    await applyOnboarding(answers);

    const savedConfig = vi.mocked(saveConfig).mock.calls[0][0];
    expect(savedConfig.channels.discord.enabled).toBe(true);
    expect(savedConfig.channels.slack.enabled).toBe(true);
    expect(savedConfig.channels.webchat.enabled).toBe(false);
    expect(savedConfig.channels.telegram.enabled).toBe(false);
  });

  it('should write a fallback SOUL.md when templates are not available', async () => {
    const answers: OnboardingAnswers = {
      agentName: 'Bot',
      pronouns: 'it/its',
      personality: 'professional',
      provider: 'anthropic',
      apiKey: '',
      channels: ['webchat'],
    };

    const result = await applyOnboarding(answers);

    expect(result.personalityApplied).toBe(true);
    const soulContent = await fs.readFile(soulPath, 'utf-8');
    expect(soulContent).toContain('name: Bot');
    expect(soulContent).toContain('pronouns: it/its');
  });

  it('should return a summary with all configured options', async () => {
    const answers: OnboardingAnswers = {
      agentName: 'Aria',
      pronouns: 'she/her',
      personality: 'witty',
      provider: 'openai',
      apiKey: 'sk-test',
      channels: ['webchat', 'telegram'],
    };

    const result = await applyOnboarding(answers);

    expect(result.summary).toContain('Aria');
    expect(result.summary).toContain('she/her');
    expect(result.summary).toContain('witty');
    expect(result.summary).toContain('openai');
    expect(result.summary).toContain('webchat');
    expect(result.summary).toContain('telegram');
  });

  it('should return correct channelsEnabled list', async () => {
    const answers: OnboardingAnswers = {
      agentName: 'Test',
      pronouns: 'they/them',
      personality: 'professional',
      provider: 'anthropic',
      apiKey: '',
      channels: ['webchat', 'discord'],
    };

    const result = await applyOnboarding(answers);

    expect(result.channelsEnabled).toEqual(['webchat', 'discord']);
    expect(result.provider).toBe('anthropic');
  });
});
