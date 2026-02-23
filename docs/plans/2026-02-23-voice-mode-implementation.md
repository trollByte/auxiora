# Voice Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add local voice providers (whisper.cpp STT, Piper TTS), expand config, auto-detect providers at startup, enable voice by default with graceful degradation.

**Architecture:** Local providers use Node.js `execFile` (no shell, safe from injection) to run CLI binaries. An auto-detection layer probes PATH and model files to select the best available provider. Config enums expand to include `'auto'` (default), which triggers detection. Runtime factory functions replace hardcoded provider instantiation.

**Tech Stack:** TypeScript ESM, Node.js >=22 `execFile` / `spawn` (no shell), Zod config schemas, vitest + mocking

---

## Workstream 1: Local STT Provider

### Task 1: WhisperLocalSTT — test transcription via CLI

**Files:**
- Create: `packages/stt/src/whisper-local.ts`
- Create: `packages/stt/tests/whisper-local.test.ts`
- Modify: `packages/stt/src/index.ts` (add re-export)

**Context:** The existing `STTProvider` interface is in `packages/stt/src/types.ts`. It has `name: string` and `transcribe(audio: Buffer, options?: STTOptions): Promise<Transcription>`. The existing `WhisperSTT` in `packages/stt/src/whisper.ts` calls the OpenAI API. Our new provider runs whisper.cpp locally via `execFile` (no shell).

**Step 1: Write the failing test**

Create `packages/stt/tests/whisper-local.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import { WhisperLocalSTT } from '../src/whisper-local.js';

vi.mock('node:child_process');
vi.mock('node:fs/promises');

const mockExecFile = vi.mocked(cp.execFile);

function mockExecFileSuccess(stdout: string) {
  mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
    callback(null, stdout, '');
    return {} as any;
  });
}

describe('WhisperLocalSTT', () => {
  let stt: WhisperLocalSTT;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.writeFile).mockResolvedValue();
    vi.mocked(fs.unlink).mockResolvedValue();
    vi.mocked(fs.mkdtemp).mockResolvedValue('/tmp/whisper-test');
    stt = new WhisperLocalSTT({
      binaryPath: '/usr/bin/whisper-cli',
      modelPath: '/models/ggml-base.en.bin',
    });
  });

  it('should have name whisper-local', () => {
    expect(stt.name).toBe('whisper-local');
  });

  it('should transcribe audio via CLI', async () => {
    const whisperOutput = JSON.stringify({ text: 'Hello world', language: 'en', duration: 1.5 });
    mockExecFileSuccess(whisperOutput);
    const audio = Buffer.alloc(32000);
    const result = await stt.transcribe(audio, { language: 'en', sampleRate: 16000 });
    expect(result.text).toBe('Hello world');
    expect(result.language).toBe('en');
    expect(result.duration).toBe(1.5);
    expect(mockExecFile).toHaveBeenCalledOnce();
  });

  it('should reject audio shorter than 0.5s', async () => {
    await expect(stt.transcribe(Buffer.alloc(100))).rejects.toThrow('too short');
  });

  it('should clean up temp file after transcription', async () => {
    mockExecFileSuccess(JSON.stringify({ text: 'hi', language: 'en', duration: 0.5 }));
    await stt.transcribe(Buffer.alloc(32000));
    expect(vi.mocked(fs.unlink)).toHaveBeenCalled();
  });

  it('should throw on CLI error', async () => {
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
      callback(new Error('whisper-cli not found'), '', 'not found');
      return {} as any;
    });
    await expect(stt.transcribe(Buffer.alloc(32000))).rejects.toThrow('whisper-cli');
  });

  it('should pass model path and language to CLI args', async () => {
    mockExecFileSuccess(JSON.stringify({ text: 'test', language: 'fr', duration: 1.0 }));
    await stt.transcribe(Buffer.alloc(32000), { language: 'fr' });
    const args = mockExecFile.mock.calls[0][1] as string[];
    expect(args).toContain('--model');
    expect(args).toContain('/models/ggml-base.en.bin');
    expect(args).toContain('--language');
    expect(args).toContain('fr');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/stt/tests/whisper-local.test.ts`
Expected: FAIL — module `../src/whisper-local.js` not found

**Step 3: Write minimal implementation**

Create `packages/stt/src/whisper-local.ts`:

```typescript
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { getLogger } from '@auxiora/logger';
import type { STTProvider, STTOptions, Transcription } from './types.js';
import { pcmToWav } from './pcm-to-wav.js';

const logger = getLogger('stt:whisper-local');
const MIN_AUDIO_BYTES = 16000;

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
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }

  async transcribe(audio: Buffer, options?: STTOptions): Promise<Transcription> {
    if (audio.length < MIN_AUDIO_BYTES) {
      throw new Error('Audio too short (minimum 0.5 seconds)');
    }

    const sampleRate = options?.sampleRate ?? 16000;
    const wav = pcmToWav(audio, sampleRate);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-'));
    const tmpFile = path.join(tmpDir, 'audio.wav');

    try {
      await fs.writeFile(tmpFile, wav);
      const args = ['--model', this.modelPath, '--output-format', 'json', '--file', tmpFile];
      if (options?.language) {
        args.push('--language', options.language);
      }

      logger.info('Running local whisper', { audioBytes: audio.length });
      const stdout = await this.run(args);
      const parsed = JSON.parse(stdout) as { text: string; language?: string; duration?: number };

      return {
        text: parsed.text.trim(),
        language: parsed.language ?? options?.language ?? 'en',
        duration: parsed.duration ?? audio.length / (sampleRate * 2),
      };
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(this.binaryPath, args, { timeout: this.timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          logger.error('whisper-cli failed', { error, stderr });
          reject(new Error(`whisper-cli error: ${error.message}`));
          return;
        }
        resolve(stdout);
      });
    });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/stt/tests/whisper-local.test.ts`
Expected: PASS (6 tests)

**Step 5: Add re-export**

Add to end of `packages/stt/src/index.ts`:
```typescript
export { WhisperLocalSTT, type WhisperLocalConfig } from './whisper-local.js';
```

**Step 6: Commit**

```bash
git add packages/stt/src/whisper-local.ts packages/stt/tests/whisper-local.test.ts packages/stt/src/index.ts
git commit -m "feat(stt): add WhisperLocalSTT provider using local whisper binary"
```

---

### Task 2: Verify existing STT tests still pass

**Step 1: Run all STT tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/stt/tests/`
Expected: All tests pass including the existing `whisper.test.ts`

---

## Workstream 2: Local TTS Provider

### Task 3: PiperTTS — test synthesis via spawn

**Files:**
- Create: `packages/tts/src/piper-tts.ts`
- Create: `packages/tts/tests/piper-tts.test.ts`
- Modify: `packages/tts/src/index.ts` (add re-export)

**Context:** The existing `TTSProvider` interface is in `packages/tts/src/types.ts`. It has `synthesize(text, options): Promise<Buffer>` and `stream(text, options): AsyncGenerator<Buffer>`. Piper reads text from stdin and outputs raw PCM to stdout. We use `spawn` (not `exec`) to pipe stdin/stdout.

**Step 1: Write the failing test**

Create `packages/tts/tests/piper-tts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter, Readable, Writable } from 'node:stream';
import * as cp from 'node:child_process';
import { PiperTTS } from '../src/piper-tts.js';

vi.mock('node:child_process');

function createMockProcess(outputChunks: Buffer[], exitCode = 0) {
  const stdout = new Readable({
    read() {
      for (const chunk of outputChunks) {
        this.push(chunk);
      }
      this.push(null);
    },
  });
  const stderr = new Readable({ read() { this.push(null); } });
  const stdin = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  const proc = Object.assign(new EventEmitter(), {
    stdout, stderr, stdin, kill: vi.fn(), pid: 1234,
  });
  setTimeout(() => proc.emit('close', exitCode), 10);
  return proc;
}

describe('PiperTTS', () => {
  let tts: PiperTTS;

  beforeEach(() => {
    vi.clearAllMocks();
    tts = new PiperTTS({
      binaryPath: '/usr/bin/piper',
      modelPath: '/models/en_US-lessac-medium.onnx',
    });
  });

  it('should have name piper-local', () => {
    expect(tts.name).toBe('piper-local');
  });

  it('should synthesize text to PCM buffer', async () => {
    const audioData = Buffer.alloc(8000, 0x42);
    vi.mocked(cp.spawn).mockReturnValue(createMockProcess([audioData]) as any);
    const result = await tts.synthesize('Hello world');
    expect(result.length).toBe(8000);
    expect(cp.spawn).toHaveBeenCalledOnce();
  });

  it('should stream audio chunks', async () => {
    const chunk1 = Buffer.alloc(4096, 0x01);
    const chunk2 = Buffer.alloc(4096, 0x02);
    vi.mocked(cp.spawn).mockReturnValue(createMockProcess([chunk1, chunk2]) as any);
    const chunks: Buffer[] = [];
    for await (const chunk of tts.stream('Hello')) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject text exceeding max length', async () => {
    const longText = 'a'.repeat(5000);
    await expect(tts.synthesize(longText)).rejects.toThrow('exceeds maximum');
  });

  it('should pass model path and output-raw flag to piper binary', async () => {
    vi.mocked(cp.spawn).mockReturnValue(createMockProcess([Buffer.alloc(100)]) as any);
    await tts.synthesize('test');
    const args = vi.mocked(cp.spawn).mock.calls[0][1] as string[];
    expect(args).toContain('--model');
    expect(args).toContain('/models/en_US-lessac-medium.onnx');
    expect(args).toContain('--output-raw');
  });

  it('should throw on non-zero exit code', async () => {
    vi.mocked(cp.spawn).mockReturnValue(createMockProcess([], 1) as any);
    await expect(tts.synthesize('test')).rejects.toThrow('piper exited');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/tts/tests/piper-tts.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/tts/src/piper-tts.ts`:

```typescript
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
    if (text.length > MAX_TTS_TEXT_LENGTH) {
      throw new Error(`Text length (${text.length}) exceeds maximum (${MAX_TTS_TEXT_LENGTH})`);
    }
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

    const args = ['--model', this.modelPath, '--output-raw'];
    logger.info('Spawning piper', { textLength: text.length, model: this.modelPath });

    const proc = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: this.timeoutMs,
    });

    proc.stdin.write(text);
    proc.stdin.end();

    for await (const chunk of proc.stdout) {
      yield Buffer.from(chunk);
    }

    await new Promise<void>((resolve, reject) => {
      proc.on('close', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`piper exited with code ${code}`));
        } else {
          resolve();
        }
      });
      proc.on('error', (err) => reject(new Error(`piper error: ${err.message}`)));
    });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/tts/tests/piper-tts.test.ts`
Expected: PASS (6 tests)

**Step 5: Add re-export**

Add to end of `packages/tts/src/index.ts`:
```typescript
export { PiperTTS, type PiperTTSConfig } from './piper-tts.js';
```

**Step 6: Commit**

```bash
git add packages/tts/src/piper-tts.ts packages/tts/tests/piper-tts.test.ts packages/tts/src/index.ts
git commit -m "feat(tts): add PiperTTS provider using local piper binary"
```

---

### Task 4: Verify existing TTS tests still pass

**Step 1: Run all TTS tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/tts/tests/`
Expected: All tests pass

---

## Workstream 3: Config Schema Changes

### Task 5: Expand voice config enums and flip default

**Files:**
- Modify: `packages/config/src/index.ts:161-169`
- Modify: `packages/config/tests/config.test.ts`

**Context:** Current voice config schema at `packages/config/src/index.ts` line 161 has `enabled: false`, `sttProvider: enum(['openai-whisper'])`, `ttsProvider: enum(['openai-tts'])`. We need to expand both enums and flip the default.

**Step 1: Write the failing test**

Find the voice-related test in `packages/config/tests/config.test.ts` and add/update:

```typescript
it('should default voice to enabled with auto providers', () => {
  const config = ConfigSchema.parse({});
  expect(config.voice.enabled).toBe(true);
  expect(config.voice.sttProvider).toBe('auto');
  expect(config.voice.ttsProvider).toBe('auto');
});

it('should accept all valid stt provider values', () => {
  for (const provider of ['openai-whisper', 'whisper-local', 'auto']) {
    const config = ConfigSchema.parse({ voice: { sttProvider: provider } });
    expect(config.voice.sttProvider).toBe(provider);
  }
});

it('should accept all valid tts provider values', () => {
  for (const provider of ['openai-tts', 'elevenlabs-tts', 'piper-local', 'auto']) {
    const config = ConfigSchema.parse({ voice: { ttsProvider: provider } });
    expect(config.voice.ttsProvider).toBe(provider);
  }
});

it('should reject invalid stt provider', () => {
  expect(() => ConfigSchema.parse({ voice: { sttProvider: 'invalid' } })).toThrow();
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/config/tests/config.test.ts`
Expected: FAIL — enum values not accepted, default still false

**Step 3: Update the config schema**

In `packages/config/src/index.ts` around line 161, replace:

```typescript
const VoiceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  sttProvider: z.enum(['openai-whisper']).default('openai-whisper'),
  ttsProvider: z.enum(['openai-tts']).default('openai-tts'),
```

With:

```typescript
const VoiceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  sttProvider: z.enum(['openai-whisper', 'whisper-local', 'auto']).default('auto'),
  ttsProvider: z.enum(['openai-tts', 'elevenlabs-tts', 'piper-local', 'auto']).default('auto'),
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/config/tests/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/config/src/index.ts packages/config/tests/config.test.ts
git commit -m "feat(config): expand voice provider enums, add auto detection, enable by default"
```

---

## Workstream 4: Auto-Detection and Runtime Wiring

### Task 6: Binary detection utility

**Files:**
- Create: `packages/voice/src/detect-providers.ts`
- Create: `packages/voice/tests/detect-providers.test.ts`
- Modify: `packages/voice/src/index.ts` (add re-export)

**Context:** We need a function that probes the system for available voice binaries (whisper-cli, piper) and cloud API keys, then returns which providers to use. Uses `execFile('which', [binaryName])` to check PATH — `execFile` with no shell, safe from injection.

**Step 1: Write the failing test**

Create `packages/voice/tests/detect-providers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import { detectVoiceProviders } from '../src/detect-providers.js';

vi.mock('node:child_process');
vi.mock('node:fs/promises');

const mockExecFile = vi.mocked(cp.execFile);

function mockWhich(found: Record<string, string>) {
  mockExecFile.mockImplementation((cmd: any, args: any, _opts: any, callback: any) => {
    const binary = (args as string[])[0];
    if (found[binary]) {
      callback(null, found[binary] + '\n', '');
    } else {
      callback(new Error('not found'), '', '');
    }
    return {} as any;
  });
}

describe('detectVoiceProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
  });

  it('should detect whisper-local when binary and model exist', async () => {
    mockWhich({ 'whisper-cli': '/usr/bin/whisper-cli' });
    vi.mocked(fs.access).mockResolvedValue();
    const result = await detectVoiceProviders({ sttProvider: 'auto', ttsProvider: 'auto' });
    expect(result.stt.provider).toBe('whisper-local');
    expect(result.stt.binaryPath).toBe('/usr/bin/whisper-cli');
  });

  it('should detect piper-local when binary and model exist', async () => {
    mockWhich({ piper: '/usr/bin/piper' });
    vi.mocked(fs.access).mockResolvedValue();
    const result = await detectVoiceProviders({ sttProvider: 'auto', ttsProvider: 'auto' });
    expect(result.tts.provider).toBe('piper-local');
    expect(result.tts.binaryPath).toBe('/usr/bin/piper');
  });

  it('should fall back to openai-whisper with API key', async () => {
    mockWhich({});
    const vault = { get: vi.fn().mockReturnValue('sk-test-key') };
    const result = await detectVoiceProviders({ sttProvider: 'auto', ttsProvider: 'auto' }, vault as any);
    expect(result.stt.provider).toBe('openai-whisper');
  });

  it('should fall back to openai-tts with API key', async () => {
    mockWhich({});
    const vault = { get: vi.fn().mockReturnValue('sk-test-key') };
    const result = await detectVoiceProviders({ sttProvider: 'auto', ttsProvider: 'auto' }, vault as any);
    expect(result.tts.provider).toBe('openai-tts');
  });

  it('should return null when nothing available', async () => {
    mockWhich({});
    const vault = { get: vi.fn().mockImplementation(() => { throw new Error('locked'); }) };
    const result = await detectVoiceProviders({ sttProvider: 'auto', ttsProvider: 'auto' }, vault as any);
    expect(result.stt.provider).toBeNull();
    expect(result.tts.provider).toBeNull();
  });

  it('should respect explicit provider choice', async () => {
    mockWhich({});
    const vault = { get: vi.fn().mockReturnValue('sk-key') };
    const result = await detectVoiceProviders(
      { sttProvider: 'openai-whisper', ttsProvider: 'elevenlabs-tts' },
      vault as any,
    );
    expect(result.stt.provider).toBe('openai-whisper');
    expect(result.tts.provider).toBe('elevenlabs-tts');
  });

  it('should detect elevenlabs-tts as TTS fallback', async () => {
    mockWhich({});
    const vault = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'ELEVENLABS_API_KEY') return 'el-key';
        throw new Error('not found');
      }),
    };
    const result = await detectVoiceProviders({ sttProvider: 'auto', ttsProvider: 'auto' }, vault as any);
    expect(result.tts.provider).toBe('elevenlabs-tts');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/voice/tests/detect-providers.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/voice/src/detect-providers.ts`:

```typescript
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('voice:detect');

export interface VoiceProviderConfig {
  sttProvider: string;
  ttsProvider: string;
}

export interface DetectedSTT {
  provider: 'whisper-local' | 'openai-whisper' | null;
  binaryPath?: string;
  modelPath?: string;
  reason: string;
}

export interface DetectedTTS {
  provider: 'piper-local' | 'openai-tts' | 'elevenlabs-tts' | null;
  binaryPath?: string;
  modelPath?: string;
  reason: string;
}

export interface DetectedProviders {
  stt: DetectedSTT;
  tts: DetectedTTS;
}

interface Vault {
  get(key: string): string;
}

const WHISPER_MODEL_DIR = path.join(os.homedir(), '.local', 'share', 'whisper');
const PIPER_MODEL_DIR = path.join(os.homedir(), '.local', 'share', 'piper');
const DEFAULT_WHISPER_MODEL = 'ggml-base.en.bin';
const DEFAULT_PIPER_MODEL = 'en_US-lessac-medium.onnx';

async function whichBinary(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('which', [name], { timeout: 5000 }, (error, stdout) => {
      if (error) resolve(null);
      else resolve(stdout.trim());
    });
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getVaultKey(vault: Vault | undefined, key: string): string | null {
  if (!vault) return null;
  try { return vault.get(key); }
  catch { return null; }
}

async function detectSTT(config: VoiceProviderConfig, vault?: Vault): Promise<DetectedSTT> {
  if (config.sttProvider !== 'auto') {
    return { provider: config.sttProvider as any, reason: 'explicit config' };
  }

  const whisperPath = await whichBinary('whisper-cli') ?? await whichBinary('whisper');
  if (whisperPath) {
    const modelPath = path.join(WHISPER_MODEL_DIR, DEFAULT_WHISPER_MODEL);
    const hasModel = await fileExists(modelPath);
    if (hasModel) {
      logger.info('Detected local whisper', { binaryPath: whisperPath, modelPath });
      return { provider: 'whisper-local', binaryPath: whisperPath, modelPath, reason: 'local binary + model found' };
    }
    return { provider: 'whisper-local', binaryPath: whisperPath, reason: 'local binary found (model path may need config)' };
  }

  const openaiKey = getVaultKey(vault, 'OPENAI_API_KEY');
  if (openaiKey) {
    return { provider: 'openai-whisper', reason: 'OPENAI_API_KEY found in vault' };
  }

  return { provider: null, reason: 'no whisper binary on PATH and no OPENAI_API_KEY' };
}

async function detectTTS(config: VoiceProviderConfig, vault?: Vault): Promise<DetectedTTS> {
  if (config.ttsProvider !== 'auto') {
    return { provider: config.ttsProvider as any, reason: 'explicit config' };
  }

  const piperPath = await whichBinary('piper');
  if (piperPath) {
    const modelPath = path.join(PIPER_MODEL_DIR, DEFAULT_PIPER_MODEL);
    const hasModel = await fileExists(modelPath);
    if (hasModel) {
      logger.info('Detected local piper', { binaryPath: piperPath, modelPath });
      return { provider: 'piper-local', binaryPath: piperPath, modelPath, reason: 'local binary + model found' };
    }
    return { provider: 'piper-local', binaryPath: piperPath, reason: 'local binary found (model path may need config)' };
  }

  const openaiKey = getVaultKey(vault, 'OPENAI_API_KEY');
  if (openaiKey) {
    return { provider: 'openai-tts', reason: 'OPENAI_API_KEY found in vault' };
  }

  const elevenKey = getVaultKey(vault, 'ELEVENLABS_API_KEY');
  if (elevenKey) {
    return { provider: 'elevenlabs-tts', reason: 'ELEVENLABS_API_KEY found in vault' };
  }

  return { provider: null, reason: 'no piper binary on PATH and no cloud API keys' };
}

export async function detectVoiceProviders(config: VoiceProviderConfig, vault?: Vault): Promise<DetectedProviders> {
  const [stt, tts] = await Promise.all([detectSTT(config, vault), detectTTS(config, vault)]);
  return { stt, tts };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/voice/tests/detect-providers.test.ts`
Expected: PASS (7 tests)

**Step 5: Add exports to voice barrel**

Add to `packages/voice/src/index.ts`:
```typescript
export {
  detectVoiceProviders,
  type DetectedProviders,
  type DetectedSTT,
  type DetectedTTS,
  type VoiceProviderConfig,
} from './detect-providers.js';
```

**Step 6: Commit**

```bash
git add packages/voice/src/detect-providers.ts packages/voice/tests/detect-providers.test.ts packages/voice/src/index.ts
git commit -m "feat(voice): add provider auto-detection for whisper-cli, piper, cloud fallback"
```

---

### Task 7: Provider factory functions

**Files:**
- Create: `packages/voice/src/provider-factory.ts`
- Create: `packages/voice/tests/provider-factory.test.ts`
- Modify: `packages/voice/src/index.ts` (add re-export)

**Context:** Factory functions that create the correct STT/TTS provider instance based on the detected provider name. These bridge detection results to concrete provider objects.

**Step 1: Write the failing test**

Create `packages/voice/tests/provider-factory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createSTTProvider, createTTSProvider } from '../src/provider-factory.js';

describe('createSTTProvider', () => {
  it('should create WhisperLocalSTT for whisper-local', () => {
    const provider = createSTTProvider('whisper-local', {
      binaryPath: '/usr/bin/whisper-cli',
      modelPath: '/models/base.bin',
    });
    expect(provider.name).toBe('whisper-local');
  });

  it('should create WhisperSTT for openai-whisper', () => {
    const provider = createSTTProvider('openai-whisper', { apiKey: 'sk-test' });
    expect(provider.name).toBe('openai-whisper');
  });

  it('should throw for unknown provider', () => {
    expect(() => createSTTProvider('unknown', {})).toThrow('Unknown STT provider');
  });
});

describe('createTTSProvider', () => {
  it('should create PiperTTS for piper-local', () => {
    const provider = createTTSProvider('piper-local', {
      binaryPath: '/usr/bin/piper',
      modelPath: '/models/voice.onnx',
    });
    expect(provider.name).toBe('piper-local');
  });

  it('should create OpenAITTS for openai-tts', () => {
    const provider = createTTSProvider('openai-tts', { apiKey: 'sk-test' });
    expect(provider.name).toBe('openai-tts');
  });

  it('should create ElevenLabsTTS for elevenlabs-tts', () => {
    const provider = createTTSProvider('elevenlabs-tts', { apiKey: 'el-key' });
    expect(provider.name).toBe('elevenlabs-tts');
  });

  it('should throw for unknown provider', () => {
    expect(() => createTTSProvider('unknown', {})).toThrow('Unknown TTS provider');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/voice/tests/provider-factory.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/voice/src/provider-factory.ts`:

```typescript
import type { STTProvider } from '@auxiora/stt';
import type { TTSProvider } from '@auxiora/tts';
import { WhisperSTT, WhisperLocalSTT } from '@auxiora/stt';
import { OpenAITTS, ElevenLabsTTS, PiperTTS } from '@auxiora/tts';

export interface STTProviderOptions {
  apiKey?: string;
  binaryPath?: string;
  modelPath?: string;
}

export interface TTSProviderOptions {
  apiKey?: string;
  binaryPath?: string;
  modelPath?: string;
  defaultVoice?: string;
}

export function createSTTProvider(provider: string, options: STTProviderOptions): STTProvider {
  switch (provider) {
    case 'whisper-local':
      return new WhisperLocalSTT({
        binaryPath: options.binaryPath!,
        modelPath: options.modelPath!,
      });
    case 'openai-whisper':
      return new WhisperSTT({ apiKey: options.apiKey! });
    default:
      throw new Error(`Unknown STT provider: ${provider}`);
  }
}

export function createTTSProvider(provider: string, options: TTSProviderOptions): TTSProvider {
  switch (provider) {
    case 'piper-local':
      return new PiperTTS({
        binaryPath: options.binaryPath!,
        modelPath: options.modelPath!,
      });
    case 'openai-tts':
      return new OpenAITTS({
        apiKey: options.apiKey!,
        defaultVoice: options.defaultVoice,
      });
    case 'elevenlabs-tts':
      return new ElevenLabsTTS({ apiKey: options.apiKey! });
    default:
      throw new Error(`Unknown TTS provider: ${provider}`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/voice/tests/provider-factory.test.ts`
Expected: PASS (7 tests)

**Step 5: Add exports to voice barrel**

Add to `packages/voice/src/index.ts`:
```typescript
export {
  createSTTProvider,
  createTTSProvider,
  type STTProviderOptions,
  type TTSProviderOptions,
} from './provider-factory.js';
```

**Step 6: Commit**

```bash
git add packages/voice/src/provider-factory.ts packages/voice/tests/provider-factory.test.ts packages/voice/src/index.ts
git commit -m "feat(voice): add provider factory functions for STT and TTS"
```

---

### Task 8: Wire detection + factory into runtime

**Files:**
- Modify: `packages/runtime/src/index.ts` (imports at line ~55-57, voice init at ~773-802)

**Context:** Currently imports `WhisperSTT` from `@auxiora/stt` and `OpenAITTS` from `@auxiora/tts` directly, and hardcodes provider creation. We replace with `detectVoiceProviders` and `createSTTProvider`/`createTTSProvider` from `@auxiora/voice`.

**Step 1: Update imports**

Replace:
```typescript
import { VoiceManager } from '@auxiora/voice';
import { WhisperSTT } from '@auxiora/stt';
import { OpenAITTS } from '@auxiora/tts';
```

With:
```typescript
import { VoiceManager, detectVoiceProviders, createSTTProvider, createTTSProvider } from '@auxiora/voice';
```

**Step 2: Replace voice init block (~lines 773-802)**

Replace the entire voice initialization section with:

```typescript
    // Initialize voice system (if enabled — auto-detects providers)
    if (this.config.voice?.enabled) {
      const detected = await detectVoiceProviders(
        {
          sttProvider: this.config.voice.sttProvider ?? 'auto',
          ttsProvider: this.config.voice.ttsProvider ?? 'auto',
        },
        this.vault,
      );

      if (detected.stt.provider && detected.tts.provider) {
        let openaiKey: string | undefined;
        let elevenKey: string | undefined;
        try { openaiKey = this.vault.get('OPENAI_API_KEY'); } catch { /* */ }
        try { elevenKey = this.vault.get('ELEVENLABS_API_KEY'); } catch { /* */ }

        const sttProvider = createSTTProvider(detected.stt.provider, {
          apiKey: openaiKey,
          binaryPath: detected.stt.binaryPath,
          modelPath: detected.stt.modelPath,
        });
        const ttsProvider = createTTSProvider(detected.tts.provider, {
          apiKey: detected.tts.provider === 'elevenlabs-tts' ? elevenKey : openaiKey,
          binaryPath: detected.tts.binaryPath,
          modelPath: detected.tts.modelPath,
          defaultVoice: this.config.voice.defaultVoice,
        });

        this.voiceManager = new VoiceManager({
          sttProvider,
          ttsProvider,
          config: {
            enabled: true,
            defaultVoice: this.config.voice.defaultVoice,
            language: this.config.voice.language,
            maxAudioDuration: this.config.voice.maxAudioDuration,
            sampleRate: this.config.voice.sampleRate,
          },
        });
        this.gateway.onVoiceMessage(this.handleVoiceMessage.bind(this));
        this.logger.info('Voice mode enabled', {
          stt: detected.stt.provider,
          tts: detected.tts.provider,
        });
      } else {
        this.logger.warn('Voice mode enabled but no providers available', {
          stt: detected.stt.reason,
          tts: detected.tts.reason,
        });
      }
    }
```

**Step 3: Run runtime tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/`
Expected: All tests pass (voice is mocked in runtime tests)

**Step 4: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): wire voice provider auto-detection and factory into startup"
```

---

### Task 9: Update feature status API for voice

**Files:**
- Modify: `packages/gateway/src/server.ts` (~line 208)

**Context:** The feature status endpoint currently reports voice with minimal info. Enhance it to show what's needed when voice isn't fully configured.

**Step 1: Find and update the voice entry**

In `packages/gateway/src/server.ts`, find the voice entry in the features array (~line 208). Update it to include `configured`, `active`, and `missing` fields matching the `FeatureStatus` interface:

```typescript
{
  id: 'voice',
  name: 'Voice',
  category: 'capability',
  enabled: this.config.voice?.enabled ?? false,
  configured: !!this.voiceManager,
  active: !!this.voiceManager,
  missing: this.voiceManager ? undefined : ['whisper-cli or OPENAI_API_KEY (STT)', 'piper or OPENAI_API_KEY (TTS)'],
  settingsPath: '/settings/voice',
},
```

**Step 2: Run feature status tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/gateway/tests/feature-status.test.ts`
Expected: PASS (update test expectations if needed)

**Step 3: Commit**

```bash
git add packages/gateway/src/server.ts
git commit -m "feat(gateway): enhance voice feature status with provider requirements"
```

---

### Task 10: Verify existing voice tests still pass

**Step 1: Run all voice tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/voice/tests/`
Expected: All 5 test files pass (voice-manager, wake-detector, integration, detect-providers, provider-factory)

---

### Task 11: Add voice.skipped audit event

**Files:**
- Modify: `packages/audit/src/index.ts` (add event type)
- Modify: `packages/runtime/src/index.ts` (log audit event)

**Context:** When voice is enabled but no providers are detected, we should audit this the same way channels use `channel.skipped`.

**Step 1: Add `'voice.skipped'` to AuditEventType**

In `packages/audit/src/index.ts`, find `'voice.synthesized'` and add after it:
```typescript
  | 'voice.skipped'
```

**Step 2: Add audit call to runtime**

In the voice init's `else` branch (no providers available), add before the warn log:
```typescript
audit('voice.skipped', { sttReason: detected.stt.reason, ttsReason: detected.tts.reason });
```

Import `audit` if not already imported (it likely already is since channels use it).

**Step 3: Run audit tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/audit/`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/audit/src/index.ts packages/runtime/src/index.ts
git commit -m "feat(audit): add voice.skipped event for graceful degradation"
```

---

### Task 12: Final verification

**Step 1: Build all packages**

Run: `cd /home/ai-work/git/auxiora && pnpm -r --filter '!@auxiora/desktop' build`
Expected: Clean build, no TypeScript errors

**Step 2: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run --exclude 'packages/desktop/**'`
Expected: All tests pass

**Step 3: Fix any issues and commit**

---

## Summary

| Task | Component | New Tests |
|------|-----------|-----------|
| 1 | WhisperLocalSTT provider | 6 |
| 2 | Existing STT tests pass | 0 |
| 3 | PiperTTS provider | 6 |
| 4 | Existing TTS tests pass | 0 |
| 5 | Config schema expansion | 4 |
| 6 | Provider auto-detection | 7 |
| 7 | Provider factory | 7 |
| 8 | Runtime wiring | 0 |
| 9 | Feature status API | 0 |
| 10 | Voice tests still pass | 0 |
| 11 | Audit event + degradation | 0 |
| 12 | Final verification | 0 |
| **Total** | | **~30 new tests** |
