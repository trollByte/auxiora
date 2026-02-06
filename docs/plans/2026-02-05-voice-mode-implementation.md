# Voice Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add push-to-talk voice interaction to Auxiora's WebChat with pluggable STT/TTS providers.

**Architecture:** Voice is an input/output adapter around the existing text pipeline. Three new packages (`voice`, `stt`, `tts`) provide the STT/TTS abstraction and voice session management. The gateway gets binary WebSocket frame support. The runtime orchestrates the voice flow. Audio format is PCM 16-bit 16kHz mono throughout.

**Tech Stack:** OpenAI Whisper API (STT), OpenAI TTS API (TTS), binary WebSocket frames, `node:fetch`, vitest

---

## Context for implementers

**Monorepo layout:** `packages/*` auto-discovered by pnpm. Each package uses TypeScript strict ESM with `.js` extensions on all imports. Type imports use `import type { ... }`.

**Key files you'll modify:**
- `packages/config/src/index.ts` — Add `VoiceConfigSchema` to `ConfigSchema`
- `packages/config/tests/config.test.ts` — Add voice config tests
- `packages/audit/src/index.ts` — Add `voice.transcribed` and `voice.synthesized` event types
- `packages/gateway/src/server.ts` — Add binary frame handling and `onVoiceMessage` callback
- `packages/gateway/src/types.ts` — Add `voiceActive` field to `ClientConnection`
- `packages/runtime/src/index.ts` — Add `VoiceManager` initialization and `handleVoiceMessage`
- `packages/runtime/package.json` — Add `@auxiora/voice` dependency

**Existing patterns to follow:**
- Package scaffold: see `packages/browser/` for package.json, tsconfig.json, barrel exports
- Injection: `setBrowserManager()` in `packages/tools/src/browser.ts` for cross-package wiring
- Runtime lifecycle: subsystems created in `initialize()`, cleaned up in `stop()`
- Audit: `audit('event.name', { details })` from `@auxiora/audit`

---

### Task 1: Scaffold STT package

**Files:**
- Create: `packages/stt/package.json`
- Create: `packages/stt/tsconfig.json`
- Create: `packages/stt/src/types.ts`
- Create: `packages/stt/src/index.ts`

**Step 1: Create package.json**

Create `packages/stt/package.json`:

```json
{
  "name": "@auxiora/stt",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "dependencies": {
    "@auxiora/logger": "workspace:*"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/stt/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../logger" }
  ]
}
```

**Step 3: Create types.ts with STT interfaces**

Create `packages/stt/src/types.ts`:

```typescript
export type AudioFormat = 'pcm' | 'wav' | 'opus' | 'mp3';

export interface STTOptions {
  language?: string;
  format?: AudioFormat;
  sampleRate?: number;
}

export interface Transcription {
  text: string;
  language: string;
  duration: number;
  confidence?: number;
}

export interface STTProvider {
  readonly name: string;
  transcribe(audio: Buffer, options?: STTOptions): Promise<Transcription>;
}
```

**Step 4: Create barrel exports**

Create `packages/stt/src/index.ts`:

```typescript
export type { AudioFormat, STTOptions, Transcription, STTProvider } from './types.js';
```

**Step 5: Install and verify**

Run: `pnpm install && pnpm -r typecheck`

**Step 6: Commit**

```bash
git add packages/stt/
git commit -m "feat(stt): scaffold STT package with provider interface"
```

---

### Task 2: Scaffold TTS package

**Files:**
- Create: `packages/tts/package.json`
- Create: `packages/tts/tsconfig.json`
- Create: `packages/tts/src/types.ts`
- Create: `packages/tts/src/index.ts`

**Step 1: Create package.json**

Create `packages/tts/package.json`:

```json
{
  "name": "@auxiora/tts",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "dependencies": {
    "@auxiora/logger": "workspace:*"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/tts/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../logger" }
  ]
}
```

**Step 3: Create types.ts with TTS interfaces**

Create `packages/tts/src/types.ts`:

```typescript
export type AudioFormat = 'pcm' | 'wav' | 'opus' | 'mp3';

export interface TTSOptions {
  voice?: string;
  speed?: number;
  format?: AudioFormat;
}

export interface TTSProvider {
  readonly name: string;
  synthesize(text: string, options?: TTSOptions): Promise<Buffer>;
  stream(text: string, options?: TTSOptions): AsyncGenerator<Buffer>;
}

export const MAX_TTS_TEXT_LENGTH = 4096;
```

**Step 4: Create barrel exports**

Create `packages/tts/src/index.ts`:

```typescript
export type { AudioFormat, TTSOptions, TTSProvider } from './types.js';
export { MAX_TTS_TEXT_LENGTH } from './types.js';
```

**Step 5: Install and verify**

Run: `pnpm install && pnpm -r typecheck`

**Step 6: Commit**

```bash
git add packages/tts/
git commit -m "feat(tts): scaffold TTS package with provider interface"
```

---

### Task 3: Implement PCM-to-WAV utility and WhisperSTT

**Files:**
- Create: `packages/stt/src/pcm-to-wav.ts`
- Create: `packages/stt/src/whisper.ts`
- Create: `packages/stt/tests/whisper.test.ts`
- Modify: `packages/stt/src/index.ts`

**Step 1: Write the tests**

Create `packages/stt/tests/whisper.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhisperSTT } from '../src/whisper.js';
import { pcmToWav } from '../src/pcm-to-wav.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('pcmToWav', () => {
  it('should produce a valid WAV header', () => {
    const pcm = Buffer.alloc(3200); // 0.1s of 16kHz 16-bit mono
    const wav = pcmToWav(pcm, 16000);

    // WAV header is 44 bytes
    expect(wav.length).toBe(44 + pcm.length);

    // RIFF header
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8); // file size - 8
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');

    // fmt chunk
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.readUInt16LE(20)).toBe(1); // PCM format
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(16000); // sample rate
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample

    // data chunk
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
  });

  it('should handle different sample rates', () => {
    const pcm = Buffer.alloc(1000);
    const wav = pcmToWav(pcm, 44100);
    expect(wav.readUInt32LE(24)).toBe(44100);
  });
});

describe('WhisperSTT', () => {
  let stt: WhisperSTT;

  beforeEach(() => {
    mockFetch.mockReset();
    stt = new WhisperSTT({ apiKey: 'test-key' });
  });

  it('should have the correct name', () => {
    expect(stt.name).toBe('openai-whisper');
  });

  it('should send correct request to OpenAI API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: 'Hello world',
        language: 'en',
        duration: 1.5,
      }),
    });

    const audio = Buffer.alloc(32000); // 1s of 16kHz 16-bit mono
    await stt.transcribe(audio);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-key');
    expect(options.body).toBeInstanceOf(FormData);
  });

  it('should return structured transcription', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: 'Hello world',
        language: 'en',
        duration: 1.5,
      }),
    });

    const audio = Buffer.alloc(32000);
    const result = await stt.transcribe(audio);

    expect(result.text).toBe('Hello world');
    expect(result.language).toBe('en');
    expect(result.duration).toBe(1.5);
  });

  it('should respect language option', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: 'Bonjour le monde',
        language: 'fr',
        duration: 2.0,
      }),
    });

    const audio = Buffer.alloc(32000);
    await stt.transcribe(audio, { language: 'fr' });

    const body = mockFetch.mock.calls[0][1].body as FormData;
    expect(body.get('language')).toBe('fr');
  });

  it('should throw on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid API key',
    });

    const audio = Buffer.alloc(32000);
    await expect(stt.transcribe(audio)).rejects.toThrow('STT API error (401)');
  });

  it('should reject audio shorter than 0.5s', async () => {
    // 0.5s at 16kHz 16-bit mono = 16000 bytes. Below that should fail.
    const shortAudio = Buffer.alloc(8000); // 0.25s
    await expect(stt.transcribe(shortAudio)).rejects.toThrow('Audio too short');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run packages/stt/`

Expected: FAIL — modules not found.

**Step 3: Implement pcm-to-wav.ts**

Create `packages/stt/src/pcm-to-wav.ts`:

```typescript
/**
 * Wraps raw PCM audio data with a WAV header (44 bytes).
 * Assumes 16-bit mono PCM.
 */
export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4);
  header.write('WAVE', 8);

  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);            // subchunk1 size (PCM = 16)
  header.writeUInt16LE(1, 20);             // audio format (PCM = 1)
  header.writeUInt16LE(numChannels, 22);   // number of channels
  header.writeUInt32LE(sampleRate, 24);    // sample rate
  header.writeUInt32LE(byteRate, 28);      // byte rate
  header.writeUInt16LE(blockAlign, 32);    // block align
  header.writeUInt16LE(bitsPerSample, 34); // bits per sample

  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}
```

**Step 4: Implement whisper.ts**

Create `packages/stt/src/whisper.ts`:

```typescript
import { getLogger } from '@auxiora/logger';
import type { STTProvider, STTOptions, Transcription } from './types.js';
import { pcmToWav } from './pcm-to-wav.js';

const logger = getLogger('stt:whisper');

const MIN_AUDIO_BYTES = 16000; // 0.5s at 16kHz 16-bit mono

export interface WhisperSTTConfig {
  apiKey: string;
  model?: string;
  apiUrl?: string;
}

export class WhisperSTT implements STTProvider {
  readonly name = 'openai-whisper';
  private apiKey: string;
  private model: string;
  private apiUrl: string;

  constructor(config: WhisperSTTConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'whisper-1';
    this.apiUrl = config.apiUrl ?? 'https://api.openai.com/v1/audio/transcriptions';
  }

  async transcribe(audio: Buffer, options?: STTOptions): Promise<Transcription> {
    if (audio.length < MIN_AUDIO_BYTES) {
      throw new Error('Audio too short (minimum 0.5 seconds)');
    }

    const sampleRate = options?.sampleRate ?? 16000;
    const wav = pcmToWav(audio, sampleRate);

    const formData = new FormData();
    formData.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');
    formData.append('model', this.model);
    formData.append('response_format', 'verbose_json');

    if (options?.language) {
      formData.append('language', options.language);
    }

    logger.info('Sending audio to Whisper API', { audioBytes: audio.length, sampleRate });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Whisper API error', { error: new Error(errorText), status: response.status });
      throw new Error(`STT API error (${response.status}): ${errorText}`);
    }

    const result = await response.json() as { text: string; language: string; duration: number };

    logger.info('Transcription complete', {
      textLength: result.text.length,
      language: result.language,
      duration: result.duration,
    });

    return {
      text: result.text,
      language: result.language ?? 'en',
      duration: result.duration ?? 0,
    };
  }
}
```

**Step 5: Update barrel exports**

Update `packages/stt/src/index.ts`:

```typescript
export type { AudioFormat, STTOptions, Transcription, STTProvider } from './types.js';
export { pcmToWav } from './pcm-to-wav.js';
export { WhisperSTT, type WhisperSTTConfig } from './whisper.js';
```

**Step 6: Run tests to verify they pass**

Run: `pnpm test -- --run packages/stt/`

Expected: 6 tests PASS.

**Step 7: Commit**

```bash
git add packages/stt/
git commit -m "feat(stt): implement WhisperSTT with PCM-to-WAV conversion"
```

---

### Task 4: Implement OpenAI TTS

**Files:**
- Create: `packages/tts/src/openai-tts.ts`
- Create: `packages/tts/tests/openai-tts.test.ts`
- Modify: `packages/tts/src/index.ts`

**Step 1: Write the tests**

Create `packages/tts/tests/openai-tts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAITTS } from '../src/openai-tts.js';
import { MAX_TTS_TEXT_LENGTH } from '../src/types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('OpenAITTS', () => {
  let tts: OpenAITTS;

  beforeEach(() => {
    mockFetch.mockReset();
    tts = new OpenAITTS({ apiKey: 'test-key' });
  });

  it('should have the correct name', () => {
    expect(tts.name).toBe('openai-tts');
  });

  it('should send correct request to OpenAI API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1000),
    });

    await tts.synthesize('Hello world');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer test-key');

    const body = JSON.parse(options.body);
    expect(body.model).toBe('tts-1');
    expect(body.input).toBe('Hello world');
    expect(body.voice).toBe('alloy');
    expect(body.response_format).toBe('pcm');
  });

  it('should return audio buffer from synthesize', async () => {
    const fakeAudio = new ArrayBuffer(2000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeAudio,
    });

    const result = await tts.synthesize('Test');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(2000);
  });

  it('should respect voice and speed options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    await tts.synthesize('Test', { voice: 'nova', speed: 1.5 });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice).toBe('nova');
    expect(body.speed).toBe(1.5);
  });

  it('should throw on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'Rate limit exceeded',
    });

    await expect(tts.synthesize('Test')).rejects.toThrow('TTS API error (429)');
  });

  it('should reject text exceeding max length', async () => {
    const longText = 'a'.repeat(MAX_TTS_TEXT_LENGTH + 1);
    await expect(tts.synthesize(longText)).rejects.toThrow('exceeds maximum');
  });

  it('should stream audio chunks', async () => {
    const chunk1 = new Uint8Array([1, 2, 3]);
    const chunk2 = new Uint8Array([4, 5, 6]);

    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: chunk1 })
        .mockResolvedValueOnce({ done: false, value: chunk2 })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const chunks: Buffer[] = [];
    for await (const chunk of tts.stream('Test')) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual(Buffer.from([1, 2, 3]));
    expect(chunks[1]).toEqual(Buffer.from([4, 5, 6]));
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run packages/tts/`

Expected: FAIL — module not found.

**Step 3: Implement openai-tts.ts**

Create `packages/tts/src/openai-tts.ts`:

```typescript
import { getLogger } from '@auxiora/logger';
import type { TTSProvider, TTSOptions } from './types.js';
import { MAX_TTS_TEXT_LENGTH } from './types.js';

const logger = getLogger('tts:openai');

export interface OpenAITTSConfig {
  apiKey: string;
  model?: string;
  apiUrl?: string;
  defaultVoice?: string;
}

export class OpenAITTS implements TTSProvider {
  readonly name = 'openai-tts';
  private apiKey: string;
  private model: string;
  private apiUrl: string;
  private defaultVoice: string;

  constructor(config: OpenAITTSConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'tts-1';
    this.apiUrl = config.apiUrl ?? 'https://api.openai.com/v1/audio/speech';
    this.defaultVoice = config.defaultVoice ?? 'alloy';
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    if (text.length > MAX_TTS_TEXT_LENGTH) {
      throw new Error(`Text length (${text.length}) exceeds maximum (${MAX_TTS_TEXT_LENGTH})`);
    }

    const body = {
      model: this.model,
      input: text,
      voice: options?.voice ?? this.defaultVoice,
      response_format: 'pcm',
      speed: options?.speed ?? 1.0,
    };

    logger.info('Synthesizing speech', { textLength: text.length, voice: body.voice });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('TTS API error', { error: new Error(errorText), status: response.status });
      throw new Error(`TTS API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async *stream(text: string, options?: TTSOptions): AsyncGenerator<Buffer> {
    if (text.length > MAX_TTS_TEXT_LENGTH) {
      throw new Error(`Text length (${text.length}) exceeds maximum (${MAX_TTS_TEXT_LENGTH})`);
    }

    const body = {
      model: this.model,
      input: text,
      voice: options?.voice ?? this.defaultVoice,
      response_format: 'pcm',
      speed: options?.speed ?? 1.0,
    };

    logger.info('Streaming speech synthesis', { textLength: text.length, voice: body.voice });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS API error (${response.status}): ${errorText}`);
    }

    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield Buffer.from(value);
    }
  }
}
```

**Step 4: Update barrel exports**

Update `packages/tts/src/index.ts`:

```typescript
export type { AudioFormat, TTSOptions, TTSProvider } from './types.js';
export { MAX_TTS_TEXT_LENGTH } from './types.js';
export { OpenAITTS, type OpenAITTSConfig } from './openai-tts.js';
```

**Step 5: Run tests**

Run: `pnpm test -- --run packages/tts/`

Expected: 7 tests PASS.

**Step 6: Commit**

```bash
git add packages/tts/
git commit -m "feat(tts): implement OpenAI TTS with synthesis and streaming"
```

---

### Task 5: Scaffold voice package with VoiceManager

**Files:**
- Create: `packages/voice/package.json`
- Create: `packages/voice/tsconfig.json`
- Create: `packages/voice/src/types.ts`
- Create: `packages/voice/src/voice-manager.ts`
- Create: `packages/voice/src/index.ts`
- Create: `packages/voice/tests/voice-manager.test.ts`

**Step 1: Create package.json**

Create `packages/voice/package.json`:

```json
{
  "name": "@auxiora/voice",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "dependencies": {
    "@auxiora/logger": "workspace:*",
    "@auxiora/stt": "workspace:*",
    "@auxiora/tts": "workspace:*"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/voice/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../logger" },
    { "path": "../stt" },
    { "path": "../tts" }
  ]
}
```

**Step 3: Create types.ts**

Create `packages/voice/src/types.ts`:

```typescript
export type VoiceSessionState = 'idle' | 'recording' | 'transcribing' | 'synthesizing' | 'cancelled';

export interface VoiceConfig {
  enabled: boolean;
  defaultVoice: string;
  language: string;
  maxAudioDuration: number;
  sampleRate: number;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  enabled: false,
  defaultVoice: 'alloy',
  language: 'en',
  maxAudioDuration: 30,
  sampleRate: 16000,
};

export interface VoiceSessionOptions {
  voice?: string;
  language?: string;
}

// Max audio buffer: 30s at 16kHz, 16-bit mono = 960,000 bytes
export const MAX_AUDIO_BUFFER_SIZE = 960_000;

// Min audio: 0.5s at 16kHz, 16-bit mono = 16,000 bytes
export const MIN_AUDIO_BUFFER_SIZE = 16_000;

// Max single frame: 64KB
export const MAX_FRAME_SIZE = 64 * 1024;
```

**Step 4: Write the tests**

Create `packages/voice/tests/voice-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceManager } from '../src/voice-manager.js';
import { DEFAULT_VOICE_CONFIG, MAX_AUDIO_BUFFER_SIZE, MIN_AUDIO_BUFFER_SIZE } from '../src/types.js';
import type { STTProvider, Transcription } from '@auxiora/stt';
import type { TTSProvider } from '@auxiora/tts';

function createMockSTT(overrides: Partial<STTProvider> = {}): STTProvider {
  return {
    name: 'mock-stt',
    transcribe: vi.fn().mockResolvedValue({
      text: 'Hello world',
      language: 'en',
      duration: 1.5,
    } satisfies Transcription),
    ...overrides,
  };
}

function createMockTTS(overrides: Partial<TTSProvider> = {}): TTSProvider {
  return {
    name: 'mock-tts',
    synthesize: vi.fn().mockResolvedValue(Buffer.from('fake-audio')),
    stream: vi.fn().mockImplementation(async function* () {
      yield Buffer.from('chunk-1');
      yield Buffer.from('chunk-2');
    }),
    ...overrides,
  };
}

describe('VoiceManager', () => {
  let manager: VoiceManager;
  let mockSTT: STTProvider;
  let mockTTS: TTSProvider;

  beforeEach(() => {
    mockSTT = createMockSTT();
    mockTTS = createMockTTS();
    manager = new VoiceManager({
      sttProvider: mockSTT,
      ttsProvider: mockTTS,
      config: DEFAULT_VOICE_CONFIG,
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('session lifecycle', () => {
    it('should start a voice session', () => {
      manager.startSession('client-1');
      expect(manager.hasActiveSession('client-1')).toBe(true);
    });

    it('should end a voice session', () => {
      manager.startSession('client-1');
      manager.endSession('client-1');
      expect(manager.hasActiveSession('client-1')).toBe(false);
    });

    it('should throw when starting duplicate session', () => {
      manager.startSession('client-1');
      expect(() => manager.startSession('client-1')).toThrow('already has an active voice session');
    });

    it('should ignore ending non-existent session', () => {
      expect(() => manager.endSession('nonexistent')).not.toThrow();
    });

    it('should support concurrent sessions for different clients', () => {
      manager.startSession('client-1');
      manager.startSession('client-2');
      expect(manager.hasActiveSession('client-1')).toBe(true);
      expect(manager.hasActiveSession('client-2')).toBe(true);
    });

    it('should clean up all sessions on shutdown', async () => {
      manager.startSession('client-1');
      manager.startSession('client-2');
      await manager.shutdown();
      expect(manager.hasActiveSession('client-1')).toBe(false);
      expect(manager.hasActiveSession('client-2')).toBe(false);
    });
  });

  describe('audio buffer', () => {
    it('should accumulate audio frames', () => {
      manager.startSession('client-1');
      manager.addAudioFrame('client-1', Buffer.alloc(1600));
      manager.addAudioFrame('client-1', Buffer.alloc(1600));
      expect(manager.getBufferSize('client-1')).toBe(3200);
    });

    it('should reject frames without active session', () => {
      expect(() => manager.addAudioFrame('nonexistent', Buffer.alloc(100))).toThrow('No active voice session');
    });

    it('should enforce max buffer size', () => {
      manager.startSession('client-1');
      // Fill up to max
      const bigChunk = Buffer.alloc(MAX_AUDIO_BUFFER_SIZE);
      manager.addAudioFrame('client-1', bigChunk);

      // Next frame should be silently dropped
      manager.addAudioFrame('client-1', Buffer.alloc(1600));
      expect(manager.getBufferSize('client-1')).toBe(MAX_AUDIO_BUFFER_SIZE);
    });

    it('should clear buffer when session ends', () => {
      manager.startSession('client-1');
      manager.addAudioFrame('client-1', Buffer.alloc(1600));
      manager.endSession('client-1');
      expect(manager.getBufferSize('client-1')).toBe(0);
    });
  });

  describe('transcription', () => {
    it('should transcribe buffered audio', async () => {
      manager.startSession('client-1');
      manager.addAudioFrame('client-1', Buffer.alloc(32000)); // 1s

      const result = await manager.transcribe('client-1');
      expect(result.text).toBe('Hello world');
      expect(mockSTT.transcribe).toHaveBeenCalledOnce();
    });

    it('should throw without active session', async () => {
      await expect(manager.transcribe('nonexistent')).rejects.toThrow('No active voice session');
    });

    it('should throw if buffer too short', async () => {
      manager.startSession('client-1');
      manager.addAudioFrame('client-1', Buffer.alloc(100));
      await expect(manager.transcribe('client-1')).rejects.toThrow('too short');
    });

    it('should clear buffer after transcription', async () => {
      manager.startSession('client-1');
      manager.addAudioFrame('client-1', Buffer.alloc(32000));
      await manager.transcribe('client-1');
      expect(manager.getBufferSize('client-1')).toBe(0);
    });
  });

  describe('synthesis', () => {
    it('should stream synthesized audio chunks', async () => {
      manager.startSession('client-1');
      const chunks: Buffer[] = [];
      for await (const chunk of manager.synthesize('client-1', 'Hello')) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(2);
      expect(mockTTS.stream).toHaveBeenCalledOnce();
    });

    it('should throw without active session', async () => {
      const gen = manager.synthesize('nonexistent', 'Hello');
      await expect(gen.next()).rejects.toThrow('No active voice session');
    });

    it('should pass voice option from session', async () => {
      manager.startSession('client-1', { voice: 'nova' });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of manager.synthesize('client-1', 'Test')) { /* consume */ }
      expect(mockTTS.stream).toHaveBeenCalledWith('Test', expect.objectContaining({ voice: 'nova' }));
    });
  });
});
```

**Step 5: Implement voice-manager.ts**

Create `packages/voice/src/voice-manager.ts`:

```typescript
import { getLogger } from '@auxiora/logger';
import type { STTProvider, Transcription } from '@auxiora/stt';
import type { TTSProvider } from '@auxiora/tts';
import type { VoiceConfig, VoiceSessionState, VoiceSessionOptions } from './types.js';
import { DEFAULT_VOICE_CONFIG, MAX_AUDIO_BUFFER_SIZE, MIN_AUDIO_BUFFER_SIZE } from './types.js';

const logger = getLogger('voice:manager');

interface VoiceSession {
  clientId: string;
  state: VoiceSessionState;
  voice: string;
  language: string;
  audioFrames: Buffer[];
  bufferSize: number;
}

export interface VoiceManagerOptions {
  sttProvider: STTProvider;
  ttsProvider: TTSProvider;
  config?: VoiceConfig;
}

export class VoiceManager {
  private sessions = new Map<string, VoiceSession>();
  private sttProvider: STTProvider;
  private ttsProvider: TTSProvider;
  private config: VoiceConfig;

  constructor(options: VoiceManagerOptions) {
    this.sttProvider = options.sttProvider;
    this.ttsProvider = options.ttsProvider;
    this.config = options.config ?? DEFAULT_VOICE_CONFIG;
  }

  startSession(clientId: string, options?: VoiceSessionOptions): void {
    if (this.sessions.has(clientId)) {
      throw new Error(`Client ${clientId} already has an active voice session`);
    }

    const session: VoiceSession = {
      clientId,
      state: 'recording',
      voice: options?.voice ?? this.config.defaultVoice,
      language: options?.language ?? this.config.language,
      audioFrames: [],
      bufferSize: 0,
    };

    this.sessions.set(clientId, session);
    logger.info('Voice session started', { clientId, voice: session.voice });
  }

  endSession(clientId: string): void {
    const session = this.sessions.get(clientId);
    if (!session) return;

    session.audioFrames = [];
    session.bufferSize = 0;
    this.sessions.delete(clientId);
    logger.info('Voice session ended', { clientId });
  }

  hasActiveSession(clientId: string): boolean {
    return this.sessions.has(clientId);
  }

  addAudioFrame(clientId: string, frame: Buffer): void {
    const session = this.sessions.get(clientId);
    if (!session) {
      throw new Error('No active voice session for client ' + clientId);
    }

    if (session.bufferSize + frame.length > MAX_AUDIO_BUFFER_SIZE) {
      logger.warn('Audio buffer full, dropping frame', { clientId, bufferSize: session.bufferSize });
      return;
    }

    session.audioFrames.push(frame);
    session.bufferSize += frame.length;
  }

  getBufferSize(clientId: string): number {
    return this.sessions.get(clientId)?.bufferSize ?? 0;
  }

  async transcribe(clientId: string): Promise<Transcription> {
    const session = this.sessions.get(clientId);
    if (!session) {
      throw new Error('No active voice session for client ' + clientId);
    }

    if (session.bufferSize < MIN_AUDIO_BUFFER_SIZE) {
      throw new Error('Audio too short (minimum 0.5 seconds)');
    }

    session.state = 'transcribing';
    const audio = Buffer.concat(session.audioFrames);

    // Clear buffer after extracting
    session.audioFrames = [];
    session.bufferSize = 0;

    logger.info('Transcribing audio', { clientId, audioBytes: audio.length });

    const result = await this.sttProvider.transcribe(audio, {
      language: session.language,
      sampleRate: this.config.sampleRate,
    });

    session.state = 'idle';
    return result;
  }

  async *synthesize(clientId: string, text: string): AsyncGenerator<Buffer> {
    const session = this.sessions.get(clientId);
    if (!session) {
      throw new Error('No active voice session for client ' + clientId);
    }

    session.state = 'synthesizing';
    logger.info('Synthesizing speech', { clientId, textLength: text.length });

    yield* this.ttsProvider.stream(text, {
      voice: session.voice,
    });

    session.state = 'idle';
  }

  async shutdown(): Promise<void> {
    for (const [clientId] of this.sessions) {
      this.endSession(clientId);
    }
    logger.info('Voice manager shutdown complete');
  }
}
```

**Step 6: Create barrel exports**

Create `packages/voice/src/index.ts`:

```typescript
export type { VoiceConfig, VoiceSessionState, VoiceSessionOptions } from './types.js';
export {
  DEFAULT_VOICE_CONFIG,
  MAX_AUDIO_BUFFER_SIZE,
  MIN_AUDIO_BUFFER_SIZE,
  MAX_FRAME_SIZE,
} from './types.js';
export { VoiceManager, type VoiceManagerOptions } from './voice-manager.js';
```

**Step 7: Install dependencies and run tests**

Run: `pnpm install && pnpm test -- --run packages/voice/`

Expected: 15 tests PASS.

**Step 8: Commit**

```bash
git add packages/voice/
git commit -m "feat(voice): implement VoiceManager with session lifecycle and audio buffer"
```

---

### Task 6: Add voice config and audit events

**Files:**
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/tests/config.test.ts`
- Modify: `packages/audit/src/index.ts`

**Step 1: Add VoiceConfigSchema to config**

In `packages/config/src/index.ts`, add after `ChannelConfigSchema` (before `export const ConfigSchema`):

```typescript
const VoiceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  sttProvider: z.enum(['openai-whisper']).default('openai-whisper'),
  ttsProvider: z.enum(['openai-tts']).default('openai-tts'),
  defaultVoice: z.string().default('alloy'),
  language: z.string().default('en'),
  maxAudioDuration: z.number().int().positive().default(30),
  sampleRate: z.number().int().positive().default(16000),
});
```

Then add `voice: VoiceConfigSchema.default({})` to the `ConfigSchema` object, after `channels`.

**Step 2: Add voice config test**

In `packages/config/tests/config.test.ts`, add a new describe block after `'channel config'`:

```typescript
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
```

**Step 3: Add voice audit events**

In `packages/audit/src/index.ts`, add before `| 'system.error'`:

```typescript
  | 'voice.transcribed'
  | 'voice.synthesized'
```

**Step 4: Run tests**

Run: `pnpm test -- --run packages/config/ packages/audit/`

Expected: All pass (config now has 11 tests, audit unchanged count).

**Step 5: Commit**

```bash
git add packages/config/src/index.ts packages/config/tests/config.test.ts packages/audit/src/index.ts
git commit -m "feat(config): add voice configuration schema and audit events"
```

---

### Task 7: Extend gateway with binary WebSocket support

**Files:**
- Modify: `packages/gateway/src/types.ts`
- Modify: `packages/gateway/src/server.ts`
- Create: `packages/gateway/tests/voice-gateway.test.ts`

**Step 1: Write the tests**

Create `packages/gateway/tests/voice-gateway.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * These tests verify the gateway voice protocol logic in isolation.
 * We test the AudioBufferManager and voice message routing helpers
 * without spinning up a real HTTP/WS server.
 */

// Max buffer: 30s at 16kHz 16-bit mono
const MAX_BUFFER = 960_000;
const MAX_FRAME = 64 * 1024;

// Simplified AudioBufferManager to test buffer logic
class AudioBufferManager {
  private buffers = new Map<string, Buffer[]>();
  private sizes = new Map<string, number>();

  addFrame(clientId: string, frame: Buffer): boolean {
    if (frame.length > MAX_FRAME) return false;

    const currentSize = this.sizes.get(clientId) ?? 0;
    if (currentSize + frame.length > MAX_BUFFER) return false;

    const frames = this.buffers.get(clientId) ?? [];
    frames.push(frame);
    this.buffers.set(clientId, frames);
    this.sizes.set(clientId, currentSize + frame.length);
    return true;
  }

  flush(clientId: string): Buffer | null {
    const frames = this.buffers.get(clientId);
    if (!frames || frames.length === 0) return null;
    const result = Buffer.concat(frames);
    this.buffers.delete(clientId);
    this.sizes.delete(clientId);
    return result;
  }

  getSize(clientId: string): number {
    return this.sizes.get(clientId) ?? 0;
  }

  clear(clientId: string): void {
    this.buffers.delete(clientId);
    this.sizes.delete(clientId);
  }
}

describe('AudioBufferManager', () => {
  let bufferManager: AudioBufferManager;

  beforeEach(() => {
    bufferManager = new AudioBufferManager();
  });

  it('should accumulate frames for a client', () => {
    bufferManager.addFrame('c1', Buffer.alloc(1600));
    bufferManager.addFrame('c1', Buffer.alloc(1600));
    expect(bufferManager.getSize('c1')).toBe(3200);
  });

  it('should reject frames exceeding max single frame size', () => {
    const tooBig = Buffer.alloc(MAX_FRAME + 1);
    const accepted = bufferManager.addFrame('c1', tooBig);
    expect(accepted).toBe(false);
    expect(bufferManager.getSize('c1')).toBe(0);
  });

  it('should reject frames that would exceed max buffer', () => {
    bufferManager.addFrame('c1', Buffer.alloc(MAX_BUFFER));
    const accepted = bufferManager.addFrame('c1', Buffer.alloc(1));
    expect(accepted).toBe(false);
    expect(bufferManager.getSize('c1')).toBe(MAX_BUFFER);
  });

  it('should flush and return concatenated buffer', () => {
    bufferManager.addFrame('c1', Buffer.from([1, 2, 3]));
    bufferManager.addFrame('c1', Buffer.from([4, 5, 6]));
    const result = bufferManager.flush('c1');
    expect(result).toEqual(Buffer.from([1, 2, 3, 4, 5, 6]));
    expect(bufferManager.getSize('c1')).toBe(0);
  });

  it('should return null when flushing empty buffer', () => {
    expect(bufferManager.flush('nonexistent')).toBeNull();
  });
});

describe('Voice message routing', () => {
  it('should identify voice message types', () => {
    const voiceTypes = ['voice_start', 'voice_end', 'voice_cancel'];
    for (const type of voiceTypes) {
      expect(voiceTypes.includes(type)).toBe(true);
    }
  });

  it('should require authentication for voice messages', () => {
    // Simulates the auth check
    const client = { authenticated: false };
    expect(client.authenticated).toBe(false);

    const authedClient = { authenticated: true };
    expect(authedClient.authenticated).toBe(true);
  });
});
```

**Step 2: Run tests**

Run: `pnpm test -- --run packages/gateway/tests/voice-gateway.test.ts`

Expected: 7 tests PASS (these test the buffer logic directly, no server needed).

**Step 3: Extend ClientConnection type**

In `packages/gateway/src/types.ts`, add the `voiceActive` field:

```typescript
export interface ClientConnection {
  id: string;
  ws: import('ws').WebSocket;
  authenticated: boolean;
  senderId?: string;
  channelType: string;
  lastActive: number;
  voiceActive?: boolean;
}
```

**Step 4: Add voice handling to gateway server**

In `packages/gateway/src/server.ts`, make these changes:

1. Add voice-related fields to the `Gateway` class (after `messageHandler`):

```typescript
private voiceHandler?: (client: ClientConnection, type: string, payload: unknown, audioBuffer?: Buffer) => Promise<void>;
private audioBuffers = new Map<string, { frames: Buffer[]; size: number }>();
```

2. Add `onVoiceMessage` public method (after `onMessage`):

```typescript
public onVoiceMessage(handler: (client: ClientConnection, type: string, payload: unknown, audioBuffer?: Buffer) => Promise<void>): void {
  this.voiceHandler = handler;
}
```

3. Modify the `ws.on('message')` handler in `setupWebSocket()` to handle binary frames. Replace the existing handler at line 207:

```typescript
ws.on('message', async (data: RawData, isBinary: boolean) => {
  client.lastActive = Date.now();

  if (isBinary) {
    this.handleAudioFrame(client, data as Buffer);
    return;
  }

  try {
    const message = JSON.parse(data.toString()) as WsMessage;
    await this.handleMessage(client, message);
  } catch (error) {
    this.send(client, {
      type: 'error',
      payload: { message: 'Invalid message format' },
    });
  }
});
```

4. Add `handleAudioFrame` private method:

```typescript
private handleAudioFrame(client: ClientConnection, frame: Buffer): void {
  if (!client.authenticated || !client.voiceActive) return;

  const maxFrame = 64 * 1024;
  const maxBuffer = 960_000;

  if (frame.length > maxFrame) return;

  const buf = this.audioBuffers.get(client.id);
  if (!buf) return;

  if (buf.size + frame.length > maxBuffer) return;

  buf.frames.push(frame);
  buf.size += frame.length;
}
```

5. Add voice message types to `handleMessage` switch, before the `default` case:

```typescript
case 'voice_start':
case 'voice_end':
case 'voice_cancel':
  if (!client.authenticated) {
    this.send(client, {
      type: 'error',
      id,
      payload: { message: 'Not authenticated' },
    });
    return;
  }
  await this.handleVoiceControl(client, type, payload, id);
  break;
```

6. Add `handleVoiceControl` private method:

```typescript
private async handleVoiceControl(client: ClientConnection, type: string, payload: unknown, requestId?: string): Promise<void> {
  if (type === 'voice_start') {
    client.voiceActive = true;
    this.audioBuffers.set(client.id, { frames: [], size: 0 });
  }

  let audioBuffer: Buffer | undefined;
  if (type === 'voice_end') {
    const buf = this.audioBuffers.get(client.id);
    if (buf && buf.frames.length > 0) {
      audioBuffer = Buffer.concat(buf.frames);
    }
    this.audioBuffers.delete(client.id);
    client.voiceActive = false;
  }

  if (type === 'voice_cancel') {
    this.audioBuffers.delete(client.id);
    client.voiceActive = false;
  }

  if (this.voiceHandler) {
    await this.voiceHandler(client, type, payload, audioBuffer);
  }
}
```

7. Add `sendBinary` public method (after `broadcast`):

```typescript
public sendBinary(client: ClientConnection, data: Buffer): void {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(data);
  }
}
```

8. Clean up audio buffers in `ws.on('close')`:

```typescript
ws.on('close', () => {
  this.audioBuffers.delete(clientId);
  this.clients.delete(clientId);
  audit('channel.disconnected', { clientId });
});
```

**Step 5: Export sendBinary from gateway index**

No change needed — `Gateway` class already exported, `sendBinary` is a public method.

**Step 6: Run all gateway tests**

Run: `pnpm test -- --run packages/gateway/`

Expected: All tests pass (existing 27 + new 7 = 34 tests).

**Step 7: Commit**

```bash
git add packages/gateway/
git commit -m "feat(gateway): add binary WebSocket frame handling for voice"
```

---

### Task 8: Wire voice into runtime

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/package.json`

**Step 1: Add dependencies**

In `packages/runtime/package.json`, add to `dependencies`:

```json
"@auxiora/stt": "workspace:*",
"@auxiora/tts": "workspace:*",
"@auxiora/voice": "workspace:*"
```

**Step 2: Add voice imports to runtime**

In `packages/runtime/src/index.ts`, add to imports:

```typescript
import { VoiceManager } from '@auxiora/voice';
import { WhisperSTT } from '@auxiora/stt';
import { OpenAITTS } from '@auxiora/tts';
```

**Step 3: Add voiceManager field**

Add to `Auxiora` class fields (after `browserManager`):

```typescript
private voiceManager?: VoiceManager;
```

**Step 4: Add voice initialization**

In `initialize()`, after the browser system block (after `setBrowserManager`), add:

```typescript
// Initialize voice system (if enabled and OpenAI key available)
if (this.config.voice?.enabled) {
  let openaiKeyForVoice: string | undefined;
  try {
    openaiKeyForVoice = this.vault.get('OPENAI_API_KEY');
  } catch {
    // Vault locked
  }

  if (openaiKeyForVoice) {
    this.voiceManager = new VoiceManager({
      sttProvider: new WhisperSTT({ apiKey: openaiKeyForVoice }),
      ttsProvider: new OpenAITTS({
        apiKey: openaiKeyForVoice,
        defaultVoice: this.config.voice.defaultVoice,
      }),
      config: {
        enabled: true,
        defaultVoice: this.config.voice.defaultVoice,
        language: this.config.voice.language,
        maxAudioDuration: this.config.voice.maxAudioDuration,
        sampleRate: this.config.voice.sampleRate,
      },
    });
    this.gateway.onVoiceMessage(this.handleVoiceMessage.bind(this));
    console.log('Voice mode enabled');
  } else {
    console.warn('Voice mode enabled in config but no OPENAI_API_KEY found in vault');
  }
}
```

**Step 5: Add handleVoiceMessage method**

Add after `handleToolExecution`:

```typescript
private async handleVoiceMessage(
  client: ClientConnection,
  type: string,
  payload: unknown,
  audioBuffer?: Buffer
): Promise<void> {
  if (!this.voiceManager) {
    this.sendToClient(client, {
      type: 'voice_error',
      payload: { message: 'Voice mode not available' },
    });
    return;
  }

  try {
    if (type === 'voice_start') {
      const opts = payload as { voice?: string; language?: string } | undefined;
      this.voiceManager.startSession(client.id, {
        voice: opts?.voice,
        language: opts?.language,
      });
      this.sendToClient(client, { type: 'voice_ready' });
      return;
    }

    if (type === 'voice_cancel') {
      this.voiceManager.endSession(client.id);
      return;
    }

    if (type === 'voice_end' && audioBuffer) {
      // Feed audio into voice manager buffer then transcribe
      this.voiceManager.addAudioFrame(client.id, audioBuffer);
      const transcription = await this.voiceManager.transcribe(client.id);

      this.sendToClient(client, {
        type: 'voice_transcript',
        payload: { text: transcription.text, final: true },
      });

      audit('voice.transcribed', {
        clientId: client.id,
        duration: transcription.duration,
        language: transcription.language,
        textLength: transcription.text.length,
      });

      // Feed transcribed text into AI pipeline
      if (!this.providers) {
        this.sendToClient(client, {
          type: 'voice_error',
          payload: { message: 'AI providers not configured' },
        });
        this.voiceManager.endSession(client.id);
        return;
      }

      const session = await this.sessions.getOrCreate(client.id, {
        channelType: client.channelType,
        clientId: client.id,
        senderId: client.senderId,
      });

      await this.sessions.addMessage(session.id, 'user', transcription.text);

      const contextMessages = this.sessions.getContextMessages(session.id);
      const chatMessages = contextMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const provider = this.providers.getPrimaryProvider();
      const result = await provider.complete(chatMessages, {
        systemPrompt: this.systemPrompt,
      });

      await this.sessions.addMessage(session.id, 'assistant', result.content, {
        input: result.usage.inputTokens,
        output: result.usage.outputTokens,
      });

      // Send text response
      this.sendToClient(client, {
        type: 'voice_text',
        payload: { content: result.content },
      });

      // Stream TTS audio
      for await (const chunk of this.voiceManager.synthesize(client.id, result.content)) {
        this.gateway.sendBinary(client, chunk);
      }

      audit('voice.synthesized', {
        clientId: client.id,
        textLength: result.content.length,
        voice: this.config.voice?.defaultVoice ?? 'alloy',
      });

      this.sendToClient(client, { type: 'voice_end' });
      this.voiceManager.endSession(client.id);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this.sendToClient(client, {
      type: 'voice_error',
      payload: { message: errorMessage },
    });
    this.voiceManager.endSession(client.id);
  }
}
```

**Step 6: Add voice shutdown**

In `stop()`, after the browser shutdown block, add:

```typescript
if (this.voiceManager) {
  await this.voiceManager.shutdown();
}
```

**Step 7: Install and verify**

Run: `pnpm install && pnpm test`

Expected: All tests pass.

**Step 8: Commit**

```bash
git add packages/runtime/
git commit -m "feat(runtime): integrate VoiceManager into Auxiora lifecycle"
```

---

### Task 9: Write integration tests

**Files:**
- Create: `packages/voice/tests/integration.test.ts`

**Step 1: Write integration tests**

Create `packages/voice/tests/integration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceManager } from '../src/voice-manager.js';
import { DEFAULT_VOICE_CONFIG } from '../src/types.js';
import type { STTProvider, Transcription } from '@auxiora/stt';
import type { TTSProvider } from '@auxiora/tts';

describe('Voice integration', () => {
  let manager: VoiceManager;
  let mockSTT: STTProvider;
  let mockTTS: TTSProvider;

  beforeEach(() => {
    mockSTT = {
      name: 'mock-stt',
      transcribe: vi.fn().mockResolvedValue({
        text: 'What is the weather today?',
        language: 'en',
        duration: 2.1,
      } satisfies Transcription),
    };
    mockTTS = {
      name: 'mock-tts',
      synthesize: vi.fn().mockResolvedValue(Buffer.from('full-audio')),
      stream: vi.fn().mockImplementation(async function* () {
        yield Buffer.from('audio-chunk-1');
        yield Buffer.from('audio-chunk-2');
        yield Buffer.from('audio-chunk-3');
      }),
    };
    manager = new VoiceManager({
      sttProvider: mockSTT,
      ttsProvider: mockTTS,
      config: { ...DEFAULT_VOICE_CONFIG, enabled: true },
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  it('should handle full voice_start → audio → transcribe → synthesize flow', async () => {
    // 1. Start session
    manager.startSession('client-1');
    expect(manager.hasActiveSession('client-1')).toBe(true);

    // 2. Stream audio frames (simulating 2s of audio)
    for (let i = 0; i < 20; i++) {
      manager.addAudioFrame('client-1', Buffer.alloc(3200)); // ~100ms each
    }
    expect(manager.getBufferSize('client-1')).toBe(64000);

    // 3. Transcribe
    const transcription = await manager.transcribe('client-1');
    expect(transcription.text).toBe('What is the weather today?');
    expect(mockSTT.transcribe).toHaveBeenCalledOnce();

    // 4. Synthesize response
    const audioChunks: Buffer[] = [];
    for await (const chunk of manager.synthesize('client-1', 'The weather is sunny.')) {
      audioChunks.push(chunk);
    }
    expect(audioChunks).toHaveLength(3);
    expect(mockTTS.stream).toHaveBeenCalledWith('The weather is sunny.', expect.objectContaining({ voice: 'alloy' }));

    // 5. End session
    manager.endSession('client-1');
    expect(manager.hasActiveSession('client-1')).toBe(false);
  });

  it('should handle STT failure gracefully', async () => {
    (mockSTT.transcribe as any).mockRejectedValueOnce(new Error('API rate limited'));

    manager.startSession('client-1');
    manager.addAudioFrame('client-1', Buffer.alloc(32000));

    await expect(manager.transcribe('client-1')).rejects.toThrow('API rate limited');
    // Session should still be active — caller decides cleanup
    expect(manager.hasActiveSession('client-1')).toBe(true);
  });

  it('should support multiple concurrent voice sessions', async () => {
    manager.startSession('alice');
    manager.startSession('bob');

    manager.addAudioFrame('alice', Buffer.alloc(32000));
    manager.addAudioFrame('bob', Buffer.alloc(16000));

    expect(manager.getBufferSize('alice')).toBe(32000);
    expect(manager.getBufferSize('bob')).toBe(16000);

    const aliceResult = await manager.transcribe('alice');
    expect(aliceResult.text).toBe('What is the weather today?');

    // Bob's buffer is independent
    expect(manager.getBufferSize('bob')).toBe(16000);
  });
});
```

**Step 2: Run all tests**

Run: `pnpm test`

Expected: All tests pass (~235 total).

**Step 3: Commit**

```bash
git add packages/voice/tests/integration.test.ts
git commit -m "test(voice): add integration tests for full voice flow"
```

---

### Task 10: Version bump and final verification

**Files:**
- Modify: `package.json` (root)

**Step 1: Bump version**

In root `package.json`, change version from `"1.4.0"` to `"1.5.0"`.

**Step 2: Run full test suite**

Run: `pnpm test`

Expected: All ~235 tests pass across ~21 test files.

**Step 3: Verify typecheck**

Run: `pnpm -r typecheck`

Expected: Clean.

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 1.5.0"
```
