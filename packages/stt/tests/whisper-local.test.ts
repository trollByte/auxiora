import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/whisper-abc123'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}));

import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, unlink } from 'node:fs/promises';
import { WhisperLocalSTT } from '../src/whisper-local.js';

const mockExecFile = vi.mocked(execFile);
const mockUnlink = vi.mocked(unlink);

function makeAudio(bytes: number): Buffer {
  return Buffer.alloc(bytes, 0x42);
}

const defaultConfig = {
  binaryPath: '/usr/local/bin/whisper',
  modelPath: '/models/ggml-base.bin',
};

describe('WhisperLocalSTT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdtemp).mockResolvedValue('/tmp/whisper-abc123');
    vi.mocked(writeFile).mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it('should have name whisper-local', () => {
    const stt = new WhisperLocalSTT(defaultConfig);
    expect(stt.name).toBe('whisper-local');
  });

  it('should transcribe audio via CLI', async () => {
    const jsonResponse = JSON.stringify({
      text: '  Hello world  ',
      language: 'en',
      duration: 1.5,
    });
    mockExecFile.mockResolvedValue({ stdout: jsonResponse, stderr: '' } as never);

    const stt = new WhisperLocalSTT(defaultConfig);
    const result = await stt.transcribe(makeAudio(32000));

    expect(result.text).toBe('Hello world');
    expect(result.language).toBe('en');
    expect(result.duration).toBe(1.5);
  });

  it('should reject audio shorter than 0.5s', async () => {
    const stt = new WhisperLocalSTT(defaultConfig);

    await expect(stt.transcribe(makeAudio(100))).rejects.toThrow('Audio too short');
  });

  it('should clean up temp file after transcription', async () => {
    const jsonResponse = JSON.stringify({ text: 'test', language: 'en', duration: 1 });
    mockExecFile.mockResolvedValue({ stdout: jsonResponse, stderr: '' } as never);

    const stt = new WhisperLocalSTT(defaultConfig);
    await stt.transcribe(makeAudio(32000));

    expect(mockUnlink).toHaveBeenCalledWith('/tmp/whisper-abc123/audio.wav');
  });

  it('should throw on CLI error', async () => {
    mockExecFile.mockRejectedValue(new Error('CLI crashed'));

    const stt = new WhisperLocalSTT(defaultConfig);

    await expect(stt.transcribe(makeAudio(32000))).rejects.toThrow('CLI crashed');
    // Temp file should still be cleaned up
    expect(mockUnlink).toHaveBeenCalled();
  });

  it('should pass model path and language to CLI args', async () => {
    const jsonResponse = JSON.stringify({ text: 'Hola', language: 'es', duration: 2 });
    mockExecFile.mockResolvedValue({ stdout: jsonResponse, stderr: '' } as never);

    const stt = new WhisperLocalSTT({
      binaryPath: '/opt/whisper',
      modelPath: '/models/large.bin',
    });

    await stt.transcribe(makeAudio(32000), { language: 'es' });

    expect(mockExecFile).toHaveBeenCalledWith(
      '/opt/whisper',
      expect.arrayContaining([
        '--model', '/models/large.bin',
        '--output-format', 'json',
        '--language', 'es',
      ]),
      expect.objectContaining({ timeout: 30_000 }),
    );
  });
});
