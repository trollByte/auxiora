# Voice Mode — Design Document

**Date**: 2026-02-23
**Goal**: Make voice mode production-ready with local + cloud provider support, enabled by default.

**Problem**: Voice infrastructure exists (`@auxiora/voice`, `@auxiora/stt`, `@auxiora/tts`) with session management, wake detection, continuous conversation, and gateway WebSocket protocol — but STT is locked to OpenAI Whisper API and TTS to OpenAI/ElevenLabs. No local alternatives exist. Voice defaults to off, requiring both manual config change and an OpenAI API key.

**Strategy**: Add local providers (whisper.cpp for STT, Piper for TTS), expand config enums, auto-detect available providers at startup, enable voice by default with graceful degradation.

---

## 1. Local STT — whisper.cpp via Child Process

### New File: `packages/stt/src/whisper-local.ts`

Implements the existing `STTProvider` interface:
```typescript
interface STTProvider {
  readonly name: string;
  transcribe(audio: Buffer, options?: STTOptions): Promise<Transcription>;
}
```

### How It Works

1. Writes PCM audio to a temp WAV file (reuses existing `pcmToWav()`)
2. Spawns whisper binary via `execFile` (no shell — safe from injection)
3. Passes `--model <path>` `--language <lang>` `--output-format json` flags
4. Parses JSON stdout → returns `Transcription { text, language, duration }`
5. Cleans up temp file

### Config

```typescript
interface WhisperLocalConfig {
  binaryPath?: string;   // default: auto-detect on PATH
  modelPath?: string;    // default: ~/.local/share/whisper/ggml-base.en.bin
  modelSize?: 'tiny' | 'base' | 'small' | 'medium';  // used for default model path
}
```

### Auto-Detection

`detectWhisperLocal()` checks:
1. `which whisper-cli` → whisper.cpp CLI
2. `which whisper` → might be whisper.cpp or python whisper
3. Default model paths: `~/.local/share/whisper/ggml-{size}.en.bin`

---

## 2. Local TTS — Piper via Child Process

### New File: `packages/tts/src/piper-tts.ts`

Implements the existing `TTSProvider` interface:
```typescript
interface TTSProvider {
  readonly name: string;
  synthesize(text: string, options?: TTSOptions): Promise<Buffer>;
  stream(text: string, options?: TTSOptions): AsyncGenerator<Buffer>;
}
```

### How It Works

1. Spawns `piper` binary with `--model <path> --output-raw` flags
2. Pipes text via stdin
3. Reads raw 16-bit PCM from stdout
4. For `stream()`: reads stdout in 4096-byte chunks as async generator
5. For `synthesize()`: collects all stdout into a single Buffer

All subprocess execution uses `execFile` (no shell) to prevent command injection.

### Config

```typescript
interface PiperTTSConfig {
  binaryPath?: string;   // default: auto-detect 'piper' on PATH
  modelPath?: string;    // default: ~/.local/share/piper/en_US-lessac-medium.onnx
  sampleRate?: number;   // default: 22050 (Piper default)
}
```

### Auto-Detection

`detectPiperLocal()` checks:
1. `which piper` on PATH
2. Default model path exists

---

## 3. Config Schema Changes

### `packages/config/src/index.ts`

```typescript
const VoiceConfigSchema = z.object({
  enabled: z.boolean().default(true),  // was false
  sttProvider: z.enum(['openai-whisper', 'whisper-local', 'auto']).default('auto'),
  ttsProvider: z.enum(['openai-tts', 'elevenlabs-tts', 'piper-local', 'auto']).default('auto'),
  defaultVoice: z.string().default('alloy'),
  language: z.string().default('en'),
  maxAudioDuration: z.number().int().positive().default(30),
  sampleRate: z.number().int().positive().default(16000),
});
```

The `'auto'` provider means: detect local binary → fall back to cloud API key → graceful no-op.

---

## 4. Provider Auto-Detection

### New File: `packages/voice/src/detect-providers.ts`

```typescript
interface DetectedProviders {
  stt: { provider: 'whisper-local' | 'openai-whisper' | null; reason: string };
  tts: { provider: 'piper-local' | 'openai-tts' | 'elevenlabs-tts' | null; reason: string };
}

async function detectVoiceProviders(config: VoiceConfig, vault?: Vault): Promise<DetectedProviders>;
```

Priority order for `auto`:
1. **STT**: whisper binary on PATH + model exists → `whisper-local`. Else OPENAI_API_KEY in vault → `openai-whisper`. Else `null`.
2. **TTS**: piper on PATH + model exists → `piper-local`. Else OPENAI_API_KEY → `openai-tts`. Else ELEVENLABS_API_KEY → `elevenlabs-tts`. Else `null`.

---

## 5. Runtime Wiring Changes

### `packages/runtime/src/index.ts` (~lines 773-802)

Replace hardcoded `WhisperSTT` + `OpenAITTS` with provider factory:

```typescript
if (this.config.voice?.enabled) {
  const detected = await detectVoiceProviders(this.config.voice, this.vault);

  if (detected.stt.provider && detected.tts.provider) {
    const sttProvider = createSTTProvider(detected.stt.provider, this.config, this.vault);
    const ttsProvider = createTTSProvider(detected.tts.provider, this.config, this.vault);
    this.voiceManager = new VoiceManager({ sttProvider, ttsProvider, config: ... });
    this.gateway.onVoiceMessage(this.handleVoiceMessage.bind(this));
    this.logger.info('Voice mode enabled', { stt: detected.stt, tts: detected.tts });
  } else {
    this.logger.warn('Voice mode enabled but no providers available', { detected });
  }
}
```

### Provider Factory Functions

```typescript
function createSTTProvider(provider: string, config: VoiceConfig, vault?: Vault): STTProvider;
function createTTSProvider(provider: string, config: VoiceConfig, vault?: Vault): TTSProvider;
```

---

## 6. Graceful Degradation

- Voice defaults to enabled (`true`)
- `auto` provider detection runs at startup
- If no local binary AND no API key: logs WARN, skips voice init (same as channels pattern)
- No crash, no error — just "Voice: no providers available"
- Feature status dashboard shows: "Voice — needs whisper-cli or OPENAI_API_KEY"

---

## Testing Strategy

- **WhisperLocalSTT**: mock `node:child_process` `execFile` — verify args, parse JSON output, handle errors
- **PiperTTS**: mock `node:child_process` `spawn` — verify stdin pipe, stdout chunk reading, error handling
- **Auto-detection**: mock `which` lookups and file existence checks
- **Config**: update existing config tests for new enum values and `auto` default
- **Provider factory**: unit test each branch (local, cloud, null)
- **Runtime integration**: verify voice init with mocked detection results
- **Existing tests**: must still pass unchanged (mock STT/TTS providers are interface-compatible)

## Scope

~15 TDD tasks across 4 workstreams. Changes span `packages/stt/`, `packages/tts/`, `packages/voice/`, `packages/config/`, `packages/runtime/`.
