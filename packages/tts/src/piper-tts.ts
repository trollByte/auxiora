import { spawn } from 'node:child_process';
import { getLogger } from '@auxiora/logger';
import type { TTSProvider, TTSOptions } from './types.js';
import { MAX_TTS_TEXT_LENGTH } from './types.js';

const logger = getLogger('tts:piper');

export interface PiperTTSConfig {
  binaryPath: string;
  modelPath: string;
  sampleRate?: number;
  timeoutMs?: number;
}

export class PiperTTS implements TTSProvider {
  readonly name = 'piper-local';
  private binaryPath: string;
  private modelPath: string;
  private sampleRate: number;
  private timeoutMs: number;

  constructor(config: PiperTTSConfig) {
    this.binaryPath = config.binaryPath;
    this.modelPath = config.modelPath;
    this.sampleRate = config.sampleRate ?? 22050;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of this.stream(text, options)) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async *stream(text: string, _options?: TTSOptions): AsyncGenerator<Buffer> {
    if (text.length > MAX_TTS_TEXT_LENGTH) {
      throw new Error(`Text length (${text.length}) exceeds maximum (${MAX_TTS_TEXT_LENGTH})`);
    }

    logger.info('Spawning piper process', { textLength: text.length, model: this.modelPath });

    const proc = spawn(this.binaryPath, ['--model', this.modelPath, '--output-raw'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdin.write(text);
    proc.stdin.end();

    const stderrChunks: Buffer[] = [];
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    for await (const chunk of proc.stdout) {
      yield Buffer.from(chunk as Buffer);
    }

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`Piper process timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    if (exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString();
      logger.error('Piper process failed', { error: new Error(stderr), exitCode });
      throw new Error(`Piper exited with code ${exitCode}: ${stderr}`);
    }
  }
}
