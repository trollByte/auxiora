import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectVoiceProviders } from '../src/detect-providers.js';

// Mock node:child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';

type ExecFileCallback = (error: Error | null, result?: { stdout: string; stderr: string }) => void;

function mockWhich(binMap: Record<string, string>) {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_cmd: string, args: string[], cb: ExecFileCallback) => {
      const binary = args[0];
      if (binMap[binary]) {
        cb(null, { stdout: binMap[binary] + '\n', stderr: '' });
      } else {
        cb(new Error(`${binary} not found`));
      }
    },
  );
}

function mockFileAccess(existingPaths: string[]) {
  (access as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (path: string) => {
      if (!existingPaths.includes(path)) {
        throw new Error('ENOENT');
      }
    },
  );
}

function createVault(keys: Record<string, string>) {
  return {
    get(key: string): string {
      if (key in keys) return keys[key];
      throw new Error(`Key not found: ${key}`);
    },
  };
}

describe('detectVoiceProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect whisper-local when binary and model exist', async () => {
    mockWhich({ 'whisper-cli': '/usr/bin/whisper-cli' });
    const modelPath = require('node:path').join(
      require('node:os').homedir(),
      '.local/share/whisper/ggml-base.en.bin',
    );
    mockFileAccess([modelPath]);

    const result = await detectVoiceProviders(
      { sttProvider: 'auto', ttsProvider: 'auto' },
    );

    expect(result.stt.provider).toBe('whisper-local');
    expect(result.stt.binaryPath).toBe('/usr/bin/whisper-cli');
    expect(result.stt.modelPath).toBe(modelPath);
  });

  it('should detect piper-local when binary and model exist', async () => {
    mockWhich({ piper: '/usr/bin/piper' });
    const modelPath = require('node:path').join(
      require('node:os').homedir(),
      '.local/share/piper/en_US-lessac-medium.onnx',
    );
    mockFileAccess([modelPath]);

    const result = await detectVoiceProviders(
      { sttProvider: 'auto', ttsProvider: 'auto' },
    );

    expect(result.tts.provider).toBe('piper-local');
    expect(result.tts.binaryPath).toBe('/usr/bin/piper');
    expect(result.tts.modelPath).toBe(modelPath);
  });

  it('should fall back to openai-whisper with API key', async () => {
    mockWhich({});
    mockFileAccess([]);
    const vault = createVault({ OPENAI_API_KEY: 'sk-test-123' });

    const result = await detectVoiceProviders(
      { sttProvider: 'auto', ttsProvider: 'auto' },
      vault,
    );

    expect(result.stt.provider).toBe('openai-whisper');
    expect(result.stt.reason).toContain('OPENAI_API_KEY');
  });

  it('should fall back to openai-tts with API key', async () => {
    mockWhich({});
    mockFileAccess([]);
    const vault = createVault({ OPENAI_API_KEY: 'sk-test-123' });

    const result = await detectVoiceProviders(
      { sttProvider: 'auto', ttsProvider: 'auto' },
      vault,
    );

    expect(result.tts.provider).toBe('openai-tts');
    expect(result.tts.reason).toContain('OPENAI_API_KEY');
  });

  it('should return null when nothing available', async () => {
    mockWhich({});
    mockFileAccess([]);

    const result = await detectVoiceProviders(
      { sttProvider: 'auto', ttsProvider: 'auto' },
    );

    expect(result.stt.provider).toBeNull();
    expect(result.tts.provider).toBeNull();
    expect(result.stt.reason).toContain('No STT provider');
    expect(result.tts.reason).toContain('No TTS provider');
  });

  it('should respect explicit provider choice', async () => {
    mockWhich({});
    mockFileAccess([]);

    const result = await detectVoiceProviders({
      sttProvider: 'openai-whisper',
      ttsProvider: 'piper-local',
    });

    expect(result.stt.provider).toBe('openai-whisper');
    expect(result.stt.reason).toContain('Explicit');
    expect(result.tts.provider).toBe('piper-local');
    expect(result.tts.reason).toContain('Explicit');
  });

  it('should detect elevenlabs-tts as TTS fallback', async () => {
    mockWhich({});
    mockFileAccess([]);
    const vault = createVault({ ELEVENLABS_API_KEY: 'el-test-123' });

    const result = await detectVoiceProviders(
      { sttProvider: 'auto', ttsProvider: 'auto' },
      vault,
    );

    expect(result.tts.provider).toBe('elevenlabs-tts');
    expect(result.tts.reason).toContain('ELEVENLABS_API_KEY');
  });
});
