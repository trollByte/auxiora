import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { MAX_TTS_TEXT_LENGTH } from '../src/types.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { PiperTTS } from '../src/piper-tts.js';

const mockSpawn = vi.mocked(spawn);

interface MockProcess extends EventEmitter {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  kill: () => void;
}

function createMockProcess(outputChunks: Buffer[], exitCode = 0): MockProcess {
  const proc = new EventEmitter() as MockProcess;
  proc.stdout = new Readable({
    read() {
      for (const chunk of outputChunks) {
        this.push(chunk);
      }
      this.push(null);
    },
  });
  proc.stderr = new Readable({ read() { this.push(null); } });
  proc.stdin = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  proc.kill = vi.fn();

  // Emit close after stdout drains
  setTimeout(() => proc.emit('close', exitCode), 10);

  return proc;
}

describe('PiperTTS', () => {
  let tts: PiperTTS;

  beforeEach(() => {
    mockSpawn.mockReset();
    tts = new PiperTTS({
      binaryPath: '/usr/bin/piper',
      modelPath: '/models/en-us.onnx',
    });
  });

  it('should have name piper-local', () => {
    expect(tts.name).toBe('piper-local');
  });

  it('should synthesize text to PCM buffer', async () => {
    const audio = Buffer.from([1, 2, 3, 4, 5, 6]);
    const proc = createMockProcess([audio]);
    mockSpawn.mockReturnValueOnce(proc as never);

    const result = await tts.synthesize('Hello world');

    expect(result).toBeInstanceOf(Buffer);
    expect(result).toEqual(audio);
  });

  it('should stream audio chunks', async () => {
    const chunk1 = Buffer.from([10, 20, 30]);
    const chunk2 = Buffer.from([40, 50, 60]);

    const proc = createMockProcess([chunk1, chunk2]);
    mockSpawn.mockReturnValueOnce(proc as never);

    const chunks: Buffer[] = [];
    for await (const chunk of tts.stream('Test streaming')) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(Buffer.concat(chunks)).toEqual(Buffer.concat([chunk1, chunk2]));
  });

  it('should reject text exceeding max length', async () => {
    const longText = 'x'.repeat(MAX_TTS_TEXT_LENGTH + 1);
    await expect(tts.synthesize(longText)).rejects.toThrow('exceeds maximum');
  });

  it('should pass model path and output-raw flag to piper binary', async () => {
    const proc = createMockProcess([Buffer.from([0])]);
    mockSpawn.mockReturnValueOnce(proc as never);

    await tts.synthesize('test');

    expect(mockSpawn).toHaveBeenCalledWith(
      '/usr/bin/piper',
      ['--model', '/models/en-us.onnx', '--output-raw'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
  });

  it('should throw on non-zero exit code', async () => {
    const proc = new EventEmitter() as MockProcess;
    proc.stdout = new Readable({ read() { this.push(null); } });
    proc.stderr = new Readable({
      read() {
        this.push(Buffer.from('model not found'));
        this.push(null);
      },
    });
    proc.stdin = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    proc.kill = vi.fn();
    setTimeout(() => proc.emit('close', 1), 10);

    mockSpawn.mockReturnValueOnce(proc as never);

    await expect(tts.synthesize('test')).rejects.toThrow('Piper exited with code 1');
  });
});
