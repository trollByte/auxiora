# Media Understanding Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Process media attachments (audio, images, video, files) from channel messages by auto-detecting available providers, converting media to text descriptions/transcripts, and injecting them into the user message before the AI processes it.

**Architecture:** A new `packages/media/` package with `MediaProcessor` orchestrator, provider interface with 3 built-in providers (Whisper for audio, Vision for images/video, FileExtractor for documents), auto-detection from vault API keys, and runtime integration in `handleChannelMessage()`.

**Tech Stack:** TypeScript strict ESM, Node >=22, vitest, OpenAI Whisper API, Anthropic/OpenAI vision APIs

---

## Codebase Context

**Attachment type** (`packages/channels/src/types.ts:16-23`):
```typescript
interface Attachment {
  type: 'image' | 'audio' | 'video' | 'file';
  url?: string;
  data?: Buffer;
  mimeType?: string;
  filename?: string;
  size?: number;
}
```

**Existing STT** (`packages/stt/src/whisper.ts`): `WhisperSTT` class using OpenAI `/v1/audio/transcriptions`. Takes `Buffer` audio, returns `{ text, language, duration }`. Used for voice WebSocket path only.

**Vault key access** (`packages/runtime/src/index.ts:1309-1315`):
```typescript
anthropicKey = this.vault.get('ANTHROPIC_API_KEY');
openaiKey = this.vault.get('OPENAI_API_KEY');
googleKey = this.vault.get('GOOGLE_API_KEY');
```

**InboundMessage** (`packages/channels/src/types.ts`): Has `attachments?: Attachment[]`.

**handleChannelMessage** (`packages/runtime/src/index.ts:2843-2998`): Currently ignores `inbound.attachments`. Only `inbound.content` is saved to session and sent to AI.

**Package pattern** (`packages/stt/package.json`): `@auxiora/stt`, `type: "module"`, `main: "dist/index.js"`, `types: "dist/index.d.ts"`, scripts: `build: tsc`, deps: `@auxiora/logger`.

---

## Task 1: Package Scaffold + Types + Formatter

**Files:**
- Create: `packages/media/package.json`
- Create: `packages/media/tsconfig.json`
- Create: `packages/media/src/types.ts`
- Create: `packages/media/src/format.ts`
- Create: `packages/media/src/index.ts`
- Create: `packages/media/tests/format.test.ts`

**Step 1: Create package.json**

Create `packages/media/package.json`:

```json
{
  "name": "@auxiora/media",
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

Create `packages/media/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create types**

Create `packages/media/src/types.ts`:

```typescript
export interface Attachment {
  type: 'image' | 'audio' | 'video' | 'file';
  url?: string;
  data?: Buffer;
  mimeType?: string;
  filename?: string;
  size?: number;
}

export interface MediaResult {
  type: 'audio' | 'image' | 'video' | 'file';
  success: boolean;
  text?: string;
  filename?: string;
  error?: string;
}

export interface MediaProvider {
  readonly id: string;
  readonly capabilities: ReadonlyArray<'audio' | 'image' | 'video' | 'file'>;
  processAttachment(attachment: Attachment): Promise<MediaResult>;
}

export interface MediaConfig {
  maxAudioBytes?: number;
  maxImageBytes?: number;
  maxVideoBytes?: number;
  maxFileBytes?: number;
  timeoutMs?: number;
}

export const DEFAULT_LIMITS: Required<MediaConfig> = {
  maxAudioBytes: 20 * 1024 * 1024,
  maxImageBytes: 10 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024,
  maxFileBytes: 5 * 1024 * 1024,
  timeoutMs: 60_000,
};
```

**Step 4: Create formatter**

Create `packages/media/src/format.ts`:

```typescript
import type { MediaResult } from './types.js';

export function formatMediaResults(results: MediaResult[], userText: string): string {
  const sections: string[] = [];

  for (const result of results) {
    if (!result.success || !result.text) continue;

    switch (result.type) {
      case 'audio':
        sections.push(`[Audio]\nTranscript: ${result.text}`);
        break;
      case 'image':
        sections.push(`[Image]\nDescription: ${result.text}`);
        break;
      case 'video':
        sections.push(`[Video]\nDescription: ${result.text}`);
        break;
      case 'file':
        sections.push(`[File: ${result.filename ?? 'unknown'}]\nContent: ${result.text}`);
        break;
    }
  }

  if (sections.length === 0) return userText;

  const mediaSection = sections.join('\n\n');
  return userText ? `${mediaSection}\n\n${userText}` : mediaSection;
}
```

**Step 5: Create barrel export**

Create `packages/media/src/index.ts`:

```typescript
export type { Attachment, MediaResult, MediaProvider, MediaConfig } from './types.js';
export { DEFAULT_LIMITS } from './types.js';
export { formatMediaResults } from './format.js';
```

**Step 6: Write formatter tests**

Create `packages/media/tests/format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatMediaResults } from '../src/format.js';
import type { MediaResult } from '../src/types.js';

describe('formatMediaResults', () => {
  it('should return user text unchanged when no results', () => {
    expect(formatMediaResults([], 'Hello')).toBe('Hello');
  });

  it('should format audio transcript', () => {
    const results: MediaResult[] = [
      { type: 'audio', success: true, text: 'Hello world' },
    ];
    expect(formatMediaResults(results, 'check this')).toBe(
      '[Audio]\nTranscript: Hello world\n\ncheck this'
    );
  });

  it('should format image description', () => {
    const results: MediaResult[] = [
      { type: 'image', success: true, text: 'A cat on a mat' },
    ];
    expect(formatMediaResults(results, '')).toBe('[Image]\nDescription: A cat on a mat');
  });

  it('should format file content with filename', () => {
    const results: MediaResult[] = [
      { type: 'file', success: true, text: 'col1,col2\na,b', filename: 'data.csv' },
    ];
    expect(formatMediaResults(results, 'analyze this')).toBe(
      '[File: data.csv]\nContent: col1,col2\na,b\n\nanalyze this'
    );
  });

  it('should format multiple results', () => {
    const results: MediaResult[] = [
      { type: 'audio', success: true, text: 'Voice note text' },
      { type: 'image', success: true, text: 'Photo of a dog' },
    ];
    const output = formatMediaResults(results, 'What do you think?');
    expect(output).toContain('[Audio]\nTranscript: Voice note text');
    expect(output).toContain('[Image]\nDescription: Photo of a dog');
    expect(output).toContain('What do you think?');
  });

  it('should skip failed results', () => {
    const results: MediaResult[] = [
      { type: 'audio', success: false, error: 'API error' },
      { type: 'image', success: true, text: 'A photo' },
    ];
    expect(formatMediaResults(results, 'test')).toBe('[Image]\nDescription: A photo\n\ntest');
  });

  it('should format video description', () => {
    const results: MediaResult[] = [
      { type: 'video', success: true, text: 'A person walking' },
    ];
    expect(formatMediaResults(results, '')).toBe('[Video]\nDescription: A person walking');
  });
});
```

**Step 7: Install dependencies and run tests**

Run: `cd /home/ai-work/git/auxiora && pnpm install`
Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/media/tests/format.test.ts`
Expected: PASS (7 tests)

**Step 8: Commit**

```bash
git add packages/media/
git commit -m "feat(media): scaffold package with types, formatter, and tests"
```

---

## Task 2: File Extractor Provider

**Files:**
- Create: `packages/media/src/providers/file-extractor.ts`
- Create: `packages/media/tests/file-extractor.test.ts`
- Modify: `packages/media/src/index.ts`

**Step 1: Write tests**

Create `packages/media/tests/file-extractor.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { FileExtractor } from '../src/providers/file-extractor.js';
import type { Attachment } from '../src/types.js';

describe('FileExtractor', () => {
  const extractor = new FileExtractor();

  it('should have id and capabilities', () => {
    expect(extractor.id).toBe('file-extractor');
    expect(extractor.capabilities).toContain('file');
  });

  it('should extract text from a Buffer', async () => {
    const attachment: Attachment = {
      type: 'file',
      data: Buffer.from('Hello, World!'),
      filename: 'test.txt',
      mimeType: 'text/plain',
    };
    const result = await extractor.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('Hello, World!');
    expect(result.filename).toBe('test.txt');
  });

  it('should fetch and extract from URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"key": "value"}'),
    }));

    const attachment: Attachment = {
      type: 'file',
      url: 'https://example.com/data.json',
      filename: 'data.json',
      mimeType: 'application/json',
    };
    const result = await extractor.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('{"key": "value"}');

    vi.unstubAllGlobals();
  });

  it('should reject non-text MIME types', async () => {
    const attachment: Attachment = {
      type: 'file',
      data: Buffer.from('binary'),
      filename: 'image.png',
      mimeType: 'image/png',
    };
    const result = await extractor.processAttachment(attachment);
    expect(result.success).toBe(false);
    expect(result.error).toContain('unsupported');
  });

  it('should handle missing data and URL gracefully', async () => {
    const attachment: Attachment = { type: 'file', filename: 'empty.txt' };
    const result = await extractor.processAttachment(attachment);
    expect(result.success).toBe(false);
  });

  it('should truncate large files', async () => {
    const bigText = 'x'.repeat(100_000);
    const attachment: Attachment = {
      type: 'file',
      data: Buffer.from(bigText),
      filename: 'big.txt',
      mimeType: 'text/plain',
    };
    const result = await extractor.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text!.length).toBeLessThanOrEqual(50_001); // 50k + truncation notice
  });
});
```

**Step 2: Implement FileExtractor**

Create `packages/media/src/providers/file-extractor.ts`:

```typescript
import type { Attachment, MediaProvider, MediaResult } from '../types.js';

const MAX_TEXT_CHARS = 50_000;

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml', 'application/yaml', 'application/csv'];
const TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.log', '.ini', '.toml', '.env', '.html', '.css', '.js', '.ts', '.py', '.sh'];

function isTextFile(attachment: Attachment): boolean {
  if (attachment.mimeType) {
    return TEXT_MIME_PREFIXES.some((p) => attachment.mimeType!.startsWith(p));
  }
  if (attachment.filename) {
    const ext = attachment.filename.slice(attachment.filename.lastIndexOf('.'));
    return TEXT_EXTENSIONS.includes(ext.toLowerCase());
  }
  return false;
}

export class FileExtractor implements MediaProvider {
  readonly id = 'file-extractor';
  readonly capabilities = ['file'] as const;

  async processAttachment(attachment: Attachment): Promise<MediaResult> {
    if (!isTextFile(attachment)) {
      return { type: 'file', success: false, error: 'unsupported file type', filename: attachment.filename };
    }

    try {
      let text: string;

      if (attachment.data) {
        text = attachment.data.toString('utf-8');
      } else if (attachment.url) {
        const response = await fetch(attachment.url);
        if (!response.ok) {
          return { type: 'file', success: false, error: `Fetch failed: ${response.status}`, filename: attachment.filename };
        }
        text = await response.text();
      } else {
        return { type: 'file', success: false, error: 'No data or URL', filename: attachment.filename };
      }

      if (text.length > MAX_TEXT_CHARS) {
        text = text.slice(0, MAX_TEXT_CHARS) + '\n[truncated]';
      }

      return { type: 'file', success: true, text, filename: attachment.filename };
    } catch (error) {
      return { type: 'file', success: false, error: error instanceof Error ? error.message : 'Unknown error', filename: attachment.filename };
    }
  }
}
```

**Step 3: Add to barrel export**

In `packages/media/src/index.ts`, add:

```typescript
export { FileExtractor } from './providers/file-extractor.js';
```

**Step 4: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/media/tests/file-extractor.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add packages/media/src/providers/file-extractor.ts packages/media/tests/file-extractor.test.ts packages/media/src/index.ts
git commit -m "feat(media): add FileExtractor provider for text-based documents"
```

---

## Task 3: Whisper Audio Provider

**Files:**
- Create: `packages/media/src/providers/whisper.ts`
- Create: `packages/media/tests/whisper.test.ts`
- Modify: `packages/media/src/index.ts`

**Step 1: Write tests**

Create `packages/media/tests/whisper.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhisperProvider } from '../src/providers/whisper.js';
import type { Attachment } from '../src/types.js';

describe('WhisperProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should have id and capabilities', () => {
    const provider = new WhisperProvider({ apiKey: 'test-key' });
    expect(provider.id).toBe('whisper');
    expect(provider.capabilities).toContain('audio');
  });

  it('should transcribe audio from URL', async () => {
    const audioBuffer = Buffer.alloc(32000); // 1s of silence at 16kHz

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(audioBuffer.buffer) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'Hello world', language: 'en', duration: 1.5 }),
      })
    );

    const provider = new WhisperProvider({ apiKey: 'test-key' });
    const attachment: Attachment = { type: 'audio', url: 'https://example.com/audio.ogg' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('Hello world');
    expect(result.type).toBe('audio');

    vi.unstubAllGlobals();
  });

  it('should transcribe audio from Buffer data', async () => {
    const audioBuffer = Buffer.alloc(32000);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'Buffer audio', language: 'en', duration: 2.0 }),
    }));

    const provider = new WhisperProvider({ apiKey: 'test-key' });
    const attachment: Attachment = { type: 'audio', data: audioBuffer };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('Buffer audio');

    vi.unstubAllGlobals();
  });

  it('should handle API errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(Buffer.alloc(32000).buffer) })
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('Rate limited'), status: 429 })
    );

    const provider = new WhisperProvider({ apiKey: 'test-key' });
    const attachment: Attachment = { type: 'audio', url: 'https://example.com/audio.ogg' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(false);
    expect(result.error).toContain('429');

    vi.unstubAllGlobals();
  });

  it('should handle missing data and URL', async () => {
    const provider = new WhisperProvider({ apiKey: 'test-key' });
    const attachment: Attachment = { type: 'audio' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Implement WhisperProvider**

Create `packages/media/src/providers/whisper.ts`:

```typescript
import { getLogger } from '@auxiora/logger';
import type { Attachment, MediaProvider, MediaResult } from '../types.js';

const logger = getLogger('media:whisper');

export interface WhisperProviderConfig {
  apiKey: string;
  model?: string;
  apiUrl?: string;
}

export class WhisperProvider implements MediaProvider {
  readonly id = 'whisper';
  readonly capabilities = ['audio'] as const;
  private apiKey: string;
  private model: string;
  private apiUrl: string;

  constructor(config: WhisperProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'whisper-1';
    this.apiUrl = config.apiUrl ?? 'https://api.openai.com/v1/audio/transcriptions';
  }

  async processAttachment(attachment: Attachment): Promise<MediaResult> {
    try {
      let audioBuffer: Buffer;

      if (attachment.data) {
        audioBuffer = attachment.data;
      } else if (attachment.url) {
        const response = await fetch(attachment.url);
        if (!response.ok) {
          return { type: 'audio', success: false, error: `Fetch failed: ${response.status}` };
        }
        const arrayBuf = await response.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuf);
      } else {
        return { type: 'audio', success: false, error: 'No data or URL' };
      }

      const mimeType = attachment.mimeType ?? 'audio/ogg';
      const ext = mimeType.includes('mp3') ? 'mp3'
        : mimeType.includes('wav') ? 'wav'
        : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
        : mimeType.includes('webm') ? 'webm'
        : 'ogg';

      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`);
      formData.append('model', this.model);
      formData.append('response_format', 'verbose_json');

      logger.info('Sending audio to Whisper API', { bytes: audioBuffer.length });

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { type: 'audio', success: false, error: `Whisper API error (${response.status}): ${errorText}` };
      }

      const result = await response.json() as { text: string; language: string; duration: number };
      logger.info('Audio transcribed', { textLength: result.text.length, duration: result.duration });

      return { type: 'audio', success: true, text: result.text };
    } catch (error) {
      return { type: 'audio', success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
```

**Step 3: Add to barrel export**

In `packages/media/src/index.ts`, add:

```typescript
export { WhisperProvider, type WhisperProviderConfig } from './providers/whisper.js';
```

**Step 4: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/media/tests/whisper.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add packages/media/src/providers/whisper.ts packages/media/tests/whisper.test.ts packages/media/src/index.ts
git commit -m "feat(media): add WhisperProvider for audio transcription"
```

---

## Task 4: Vision Provider (Images + Video)

**Files:**
- Create: `packages/media/src/providers/vision.ts`
- Create: `packages/media/tests/vision.test.ts`
- Modify: `packages/media/src/index.ts`

**Step 1: Write tests**

Create `packages/media/tests/vision.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VisionProvider } from '../src/providers/vision.js';
import type { Attachment } from '../src/types.js';

describe('VisionProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should have id and capabilities', () => {
    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'anthropic' });
    expect(provider.id).toBe('vision-anthropic');
    expect(provider.capabilities).toContain('image');
    expect(provider.capabilities).toContain('video');
  });

  it('should describe image from URL (Anthropic)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('fake-png').buffer),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'A golden retriever sitting on grass' }],
        }),
      })
    );

    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'anthropic' });
    const attachment: Attachment = { type: 'image', url: 'https://example.com/photo.jpg', mimeType: 'image/jpeg' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('A golden retriever sitting on grass');

    vi.unstubAllGlobals();
  });

  it('should describe image from URL (OpenAI)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'A sunset over mountains' } }],
        }),
      })
    );

    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'openai' });
    const attachment: Attachment = { type: 'image', url: 'https://example.com/photo.jpg', mimeType: 'image/jpeg' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('A sunset over mountains');

    vi.unstubAllGlobals();
  });

  it('should handle video attachments', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('fake-video').buffer),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'A person walking in a park' }],
        }),
      })
    );

    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'anthropic' });
    const attachment: Attachment = { type: 'video', url: 'https://example.com/clip.mp4', mimeType: 'video/mp4' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('A person walking in a park');

    vi.unstubAllGlobals();
  });

  it('should handle API errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('fake').buffer),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      })
    );

    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'anthropic' });
    const attachment: Attachment = { type: 'image', url: 'https://example.com/photo.jpg', mimeType: 'image/jpeg' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(false);
    expect(result.error).toContain('500');

    vi.unstubAllGlobals();
  });

  it('should handle missing data and URL', async () => {
    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'anthropic' });
    const attachment: Attachment = { type: 'image' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Implement VisionProvider**

Create `packages/media/src/providers/vision.ts`:

```typescript
import { getLogger } from '@auxiora/logger';
import type { Attachment, MediaProvider, MediaResult } from '../types.js';

const logger = getLogger('media:vision');

export interface VisionProviderConfig {
  apiKey: string;
  provider: 'anthropic' | 'openai';
  model?: string;
}

export class VisionProvider implements MediaProvider {
  readonly id: string;
  readonly capabilities = ['image', 'video'] as const;
  private apiKey: string;
  private provider: 'anthropic' | 'openai';
  private model: string;

  constructor(config: VisionProviderConfig) {
    this.apiKey = config.apiKey;
    this.provider = config.provider;
    this.model = config.model ?? (config.provider === 'anthropic' ? 'claude-sonnet-4-5-20250929' : 'gpt-4o-mini');
    this.id = `vision-${config.provider}`;
  }

  async processAttachment(attachment: Attachment): Promise<MediaResult> {
    const resultType = attachment.type === 'video' ? 'video' : 'image';
    try {
      let base64Data: string;
      let mediaType = attachment.mimeType ?? 'image/jpeg';

      if (attachment.data) {
        base64Data = attachment.data.toString('base64');
      } else if (attachment.url) {
        if (this.provider === 'openai') {
          return this.describeWithOpenAI(attachment.url, resultType);
        }
        const response = await fetch(attachment.url);
        if (!response.ok) {
          return { type: resultType, success: false, error: `Fetch failed: ${response.status}` };
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        base64Data = buffer.toString('base64');
      } else {
        return { type: resultType, success: false, error: 'No data or URL' };
      }

      if (this.provider === 'openai') {
        return this.describeWithOpenAI(`data:${mediaType};base64,${base64Data}`, resultType);
      }

      return this.describeWithAnthropic(base64Data, mediaType, resultType);
    } catch (error) {
      return { type: resultType, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async describeWithAnthropic(base64Data: string, mediaType: string, resultType: 'image' | 'video'): Promise<MediaResult> {
    const prompt = resultType === 'video'
      ? 'Describe what happens in this video. Be concise.'
      : 'Describe this image concisely. Focus on key visual elements.';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { type: resultType, success: false, error: `Anthropic vision error (${response.status}): ${errorText}` };
    }

    const result = await response.json() as { content: Array<{ type: string; text: string }> };
    const text = result.content.find((c) => c.type === 'text')?.text ?? '';

    logger.info('Vision description complete', { type: resultType, textLength: text.length });
    return { type: resultType, success: true, text };
  }

  private async describeWithOpenAI(imageUrl: string, resultType: 'image' | 'video'): Promise<MediaResult> {
    const prompt = resultType === 'video'
      ? 'Describe what happens in this video. Be concise.'
      : 'Describe this image concisely. Focus on key visual elements.';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { type: resultType, success: false, error: `OpenAI vision error (${response.status}): ${errorText}` };
    }

    const result = await response.json() as { choices: Array<{ message: { content: string } }> };
    const text = result.choices[0]?.message?.content ?? '';

    logger.info('Vision description complete', { type: resultType, textLength: text.length });
    return { type: resultType, success: true, text };
  }
}
```

**Step 3: Add to barrel export**

In `packages/media/src/index.ts`, add:

```typescript
export { VisionProvider, type VisionProviderConfig } from './providers/vision.js';
```

**Step 4: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/media/tests/vision.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add packages/media/src/providers/vision.ts packages/media/tests/vision.test.ts packages/media/src/index.ts
git commit -m "feat(media): add VisionProvider for image and video description"
```

---

## Task 5: MediaProcessor + Auto-Detection + Runtime Integration

**Files:**
- Create: `packages/media/src/processor.ts`
- Create: `packages/media/src/auto-detect.ts`
- Create: `packages/media/tests/processor.test.ts`
- Modify: `packages/media/src/index.ts`
- Modify: `packages/runtime/src/index.ts`

**Step 1: Write auto-detect**

Create `packages/media/src/auto-detect.ts`:

```typescript
import { getLogger } from '@auxiora/logger';
import type { MediaProvider } from './types.js';
import { WhisperProvider } from './providers/whisper.js';
import { VisionProvider } from './providers/vision.js';
import { FileExtractor } from './providers/file-extractor.js';

const logger = getLogger('media:auto-detect');

export interface VaultLike {
  get(key: string): string | undefined;
}

export function detectProviders(vault: VaultLike): MediaProvider[] {
  const providers: MediaProvider[] = [];

  // File extractor always available
  providers.push(new FileExtractor());

  // Audio: OpenAI Whisper
  const openaiKey = vault.get('OPENAI_API_KEY');
  if (openaiKey) {
    providers.push(new WhisperProvider({ apiKey: openaiKey }));
    logger.info('Audio provider detected: OpenAI Whisper');
  }

  // Vision: prefer Anthropic, fall back to OpenAI
  const anthropicKey = vault.get('ANTHROPIC_API_KEY');
  if (anthropicKey) {
    providers.push(new VisionProvider({ apiKey: anthropicKey, provider: 'anthropic' }));
    logger.info('Vision provider detected: Anthropic');
  } else if (openaiKey) {
    providers.push(new VisionProvider({ apiKey: openaiKey, provider: 'openai' }));
    logger.info('Vision provider detected: OpenAI');
  }

  return providers;
}
```

**Step 2: Write MediaProcessor**

Create `packages/media/src/processor.ts`:

```typescript
import { getLogger } from '@auxiora/logger';
import type { Attachment, MediaProvider, MediaResult, MediaConfig } from './types.js';
import { DEFAULT_LIMITS } from './types.js';
import { formatMediaResults } from './format.js';

const logger = getLogger('media:processor');

export class MediaProcessor {
  private providers: Map<string, MediaProvider> = new Map();
  private config: Required<MediaConfig>;

  constructor(providers: MediaProvider[], config?: MediaConfig) {
    for (const provider of providers) {
      for (const cap of provider.capabilities) {
        if (!this.providers.has(cap)) {
          this.providers.set(cap, provider);
        }
      }
    }
    this.config = { ...DEFAULT_LIMITS, ...config };
  }

  hasCapability(type: 'audio' | 'image' | 'video' | 'file'): boolean {
    return this.providers.has(type);
  }

  async process(attachments: Attachment[], userText: string): Promise<string> {
    if (!attachments || attachments.length === 0) return userText;

    const results: MediaResult[] = [];

    for (const attachment of attachments) {
      const provider = this.providers.get(attachment.type);
      if (!provider) {
        logger.debug(`No provider for attachment type: ${attachment.type}`);
        continue;
      }

      // Size check
      const maxBytes = this.getMaxBytes(attachment.type);
      if (attachment.size && attachment.size > maxBytes) {
        logger.debug(`Attachment too large: ${attachment.size} > ${maxBytes}`);
        continue;
      }

      try {
        const result = await provider.processAttachment(attachment);
        results.push(result);
      } catch (error) {
        logger.debug('Attachment processing failed', {
          type: attachment.type,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return formatMediaResults(results, userText);
  }

  private getMaxBytes(type: string): number {
    switch (type) {
      case 'audio': return this.config.maxAudioBytes;
      case 'image': return this.config.maxImageBytes;
      case 'video': return this.config.maxVideoBytes;
      case 'file': return this.config.maxFileBytes;
      default: return this.config.maxFileBytes;
    }
  }
}
```

**Step 3: Write processor tests**

Create `packages/media/tests/processor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaProcessor } from '../src/processor.js';
import type { Attachment, MediaProvider, MediaResult } from '../src/types.js';
import { detectProviders } from '../src/auto-detect.js';

function mockProvider(caps: string[], handler: (a: Attachment) => Promise<MediaResult>): MediaProvider {
  return {
    id: `mock-${caps.join('-')}`,
    capabilities: caps as any,
    processAttachment: handler,
  };
}

describe('MediaProcessor', () => {
  it('should return user text unchanged when no attachments', async () => {
    const processor = new MediaProcessor([]);
    expect(await processor.process([], 'Hello')).toBe('Hello');
  });

  it('should process audio attachment', async () => {
    const audioProvider = mockProvider(['audio'], async () => ({
      type: 'audio', success: true, text: 'Transcribed text',
    }));
    const processor = new MediaProcessor([audioProvider]);

    const result = await processor.process(
      [{ type: 'audio', url: 'https://example.com/audio.ogg' }],
      'Check this'
    );
    expect(result).toContain('[Audio]\nTranscript: Transcribed text');
    expect(result).toContain('Check this');
  });

  it('should skip attachments with no provider', async () => {
    const processor = new MediaProcessor([]);
    const result = await processor.process(
      [{ type: 'image', url: 'https://example.com/photo.jpg' }],
      'Describe this'
    );
    expect(result).toBe('Describe this');
  });

  it('should skip oversized attachments', async () => {
    const imageProvider = mockProvider(['image'], async () => ({
      type: 'image', success: true, text: 'A photo',
    }));
    const processor = new MediaProcessor([imageProvider]);

    const result = await processor.process(
      [{ type: 'image', url: 'https://example.com/huge.jpg', size: 999_999_999 }],
      'Describe'
    );
    expect(result).toBe('Describe');
  });

  it('should handle provider errors gracefully', async () => {
    const badProvider = mockProvider(['audio'], async () => {
      throw new Error('API down');
    });
    const processor = new MediaProcessor([badProvider]);

    const result = await processor.process(
      [{ type: 'audio', url: 'https://example.com/audio.ogg' }],
      'Check'
    );
    expect(result).toBe('Check');
  });

  it('should process multiple attachments', async () => {
    const audioProvider = mockProvider(['audio'], async () => ({
      type: 'audio', success: true, text: 'Voice note',
    }));
    const imageProvider = mockProvider(['image'], async () => ({
      type: 'image', success: true, text: 'A cat',
    }));
    const processor = new MediaProcessor([audioProvider, imageProvider]);

    const result = await processor.process(
      [
        { type: 'audio', url: 'https://example.com/voice.ogg' },
        { type: 'image', url: 'https://example.com/cat.jpg' },
      ],
      ''
    );
    expect(result).toContain('[Audio]\nTranscript: Voice note');
    expect(result).toContain('[Image]\nDescription: A cat');
  });

  it('should report capabilities', () => {
    const audioProvider = mockProvider(['audio'], async () => ({
      type: 'audio', success: true, text: 'test',
    }));
    const processor = new MediaProcessor([audioProvider]);

    expect(processor.hasCapability('audio')).toBe(true);
    expect(processor.hasCapability('image')).toBe(false);
  });
});

describe('detectProviders', () => {
  it('should always include FileExtractor', () => {
    const providers = detectProviders({ get: () => undefined });
    expect(providers.some((p) => p.id === 'file-extractor')).toBe(true);
  });

  it('should detect Whisper when OpenAI key is available', () => {
    const vault = { get: (k: string) => k === 'OPENAI_API_KEY' ? 'sk-test' : undefined };
    const providers = detectProviders(vault);
    expect(providers.some((p) => p.id === 'whisper')).toBe(true);
  });

  it('should prefer Anthropic for vision', () => {
    const vault = { get: (k: string) => {
      if (k === 'ANTHROPIC_API_KEY') return 'ant-test';
      if (k === 'OPENAI_API_KEY') return 'sk-test';
      return undefined;
    }};
    const providers = detectProviders(vault);
    expect(providers.some((p) => p.id === 'vision-anthropic')).toBe(true);
    expect(providers.some((p) => p.id === 'vision-openai')).toBe(false);
  });

  it('should fall back to OpenAI for vision when no Anthropic key', () => {
    const vault = { get: (k: string) => k === 'OPENAI_API_KEY' ? 'sk-test' : undefined };
    const providers = detectProviders(vault);
    expect(providers.some((p) => p.id === 'vision-openai')).toBe(true);
  });
});
```

**Step 4: Update barrel export**

In `packages/media/src/index.ts`, add:

```typescript
export { MediaProcessor } from './processor.js';
export { detectProviders, type VaultLike } from './auto-detect.js';
```

**Step 5: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/media/tests/processor.test.ts`
Expected: PASS (11 tests)

**Step 6: Wire into runtime**

In `packages/runtime/src/index.ts`:

Add import near the top (with other package imports):
```typescript
import { MediaProcessor, detectProviders } from '@auxiora/media';
```

Add a `mediaProcessor` class field and initialize it during `initialize()` after vault is unlocked and providers are set up (~around line 1320 after the API key reading block):
```typescript
    // Initialize media processor with auto-detected providers
    this.mediaProcessor = new MediaProcessor(detectProviders(this.vault));
```

In `handleChannelMessage()`, after the line `await this.sessions.addMessage(session.id, 'user', inbound.content);` (~line 2870), add media processing:

```typescript
    // Process media attachments
    let enrichedContent = inbound.content;
    if (inbound.attachments && inbound.attachments.length > 0 && this.mediaProcessor) {
      enrichedContent = await this.mediaProcessor.process(inbound.attachments, inbound.content);
      if (enrichedContent !== inbound.content) {
        // Update the stored message with media context
        await this.sessions.updateLastMessage(session.id, enrichedContent);
      }
    }
```

Wait — check if `sessions.updateLastMessage` exists. If not, change the approach: process media BEFORE `addMessage`, then save the enriched content:

Replace the addMessage + media processing section. Currently:
```typescript
    // Add user message
    await this.sessions.addMessage(session.id, 'user', inbound.content);
```

Replace with:
```typescript
    // Process media attachments and add user message
    let messageContent = inbound.content;
    if (inbound.attachments && inbound.attachments.length > 0 && this.mediaProcessor) {
      messageContent = await this.mediaProcessor.process(inbound.attachments, inbound.content);
    }
    await this.sessions.addMessage(session.id, 'user', messageContent);
```

**Step 7: Add `@auxiora/media` as dependency**

In `packages/runtime/package.json`, add to dependencies:
```json
"@auxiora/media": "workspace:*"
```

Then run: `pnpm install`

**Step 8: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: PASS (all tests)

**Step 9: Commit**

```bash
git add packages/media/src/processor.ts packages/media/src/auto-detect.ts packages/media/tests/processor.test.ts packages/media/src/index.ts packages/runtime/src/index.ts packages/runtime/package.json pnpm-lock.yaml
git commit -m "feat(media): add MediaProcessor with auto-detection and runtime integration"
```

---

## Test Summary

| Task | Component | Test File | New Tests |
|------|-----------|-----------|-----------|
| 1 | Formatter + types | `format.test.ts` | 7 |
| 2 | FileExtractor | `file-extractor.test.ts` | 6 |
| 3 | WhisperProvider | `whisper.test.ts` | 5 |
| 4 | VisionProvider | `vision.test.ts` | 6 |
| 5 | MediaProcessor + auto-detect | `processor.test.ts` | 11 |
| **Total** | | | **35** |
