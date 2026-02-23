import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { getLogger } from '@auxiora/logger';

import { pcmToWav } from './pcm-to-wav.js';
import type { STTProvider, STTOptions, Transcription } from './types.js';

const logger = getLogger('stt:whisper-local');

const execFileAsync = promisify(execFile);

const MIN_AUDIO_BYTES = 16000; // 0.5s at 16kHz 16-bit mono

export interface WhisperLocalConfig {
  binaryPath: string;
  modelPath: string;
  timeoutMs?: number;
}

export class WhisperLocalSTT implements STTProvider {
  readonly name = 'whisper-local';
  private binaryPath: string;
  private modelPath: string;
  private timeoutMs: number;

  constructor(config: WhisperLocalConfig) {
    this.binaryPath = config.binaryPath;
    this.modelPath = config.modelPath;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async transcribe(audio: Buffer, options?: STTOptions): Promise<Transcription> {
    if (audio.length < MIN_AUDIO_BYTES) {
      throw new Error('Audio too short');
    }

    const sampleRate = options?.sampleRate ?? 16000;
    const wav = pcmToWav(audio, sampleRate);

    const tmpDir = await mkdtemp(join(tmpdir(), 'whisper-'));
    const tmpFile = join(tmpDir, 'audio.wav');

    try {
      await writeFile(tmpFile, wav);

      const args = [
        '--model', this.modelPath,
        '--output-format', 'json',
        '--file', tmpFile,
      ];

      if (options?.language) {
        args.push('--language', options.language);
      }

      logger.info('Running whisper.cpp', { binaryPath: this.binaryPath, audioBytes: audio.length, sampleRate });

      const { stdout } = await execFileAsync(this.binaryPath, args, {
        timeout: this.timeoutMs,
      });

      const parsed = JSON.parse(stdout) as { text: string; language?: string; duration?: number };

      logger.info('Transcription complete', {
        textLength: parsed.text.length,
        language: parsed.language,
        duration: parsed.duration,
      });

      return {
        text: parsed.text.trim(),
        language: parsed.language ?? options?.language ?? 'en',
        duration: parsed.duration ?? 0,
      };
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  }
}
