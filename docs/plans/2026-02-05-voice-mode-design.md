# Voice Mode Design

## Goal

Add push-to-talk voice interaction to Auxiora's WebChat, giving users the ability to speak to the AI and hear spoken responses. STT and TTS are pluggable — ships with OpenAI Whisper and OpenAI TTS, with room for additional providers.

## Architecture

Voice mode is an input/output adapter around the existing text pipeline. Audio comes in, gets transcribed to text, enters the normal session/provider/tool flow, and the AI response is synthesized back to audio.

Three new packages, two extended:

- **`packages/voice`** — VoiceManager, session state machine, STT/TTS provider interfaces, audio buffer management
- **`packages/stt`** — Speech-to-text implementations (OpenAI Whisper initially)
- **`packages/tts`** — Text-to-speech implementations (OpenAI TTS initially)
- **`packages/gateway`** (extended) — Binary WebSocket frame handling, voice message types
- **`packages/runtime`** (extended) — Voice session orchestration, wiring into message flow

**Tech stack:** OpenAI Whisper API, OpenAI TTS API, Web Audio API, binary WebSocket frames, PCM 16-bit 16kHz mono.

---

## Provider Interfaces

### STT (Speech-to-Text)

```typescript
interface STTProvider {
  name: string;
  transcribe(audio: Buffer, options?: STTOptions): Promise<Transcription>;
}

interface STTOptions {
  language?: string;      // ISO 639-1, e.g. 'en'
  format?: AudioFormat;   // 'pcm' | 'wav' | 'opus' | 'mp3'
  sampleRate?: number;    // default 16000
}

interface Transcription {
  text: string;
  language: string;
  duration: number;       // seconds
  confidence?: number;    // 0-1
}
```

### TTS (Text-to-Speech)

```typescript
interface TTSProvider {
  name: string;
  synthesize(text: string, options?: TTSOptions): Promise<Buffer>;
  stream(text: string, options?: TTSOptions): AsyncGenerator<Buffer>;
}

interface TTSOptions {
  voice?: string;         // provider-specific voice ID
  speed?: number;         // 0.5-2.0, default 1.0
  format?: AudioFormat;   // output format
}
```

Both interfaces are minimal. `stream()` on TTS enables sending audio chunks to the client as they're generated rather than waiting for the full response.

---

## WebSocket Protocol Extension

Audio data uses binary WebSocket frames. Control messages stay as JSON text frames.

### Client → Server (text frames)

| Type | Payload | Description |
|------|---------|-------------|
| `voice_start` | `{ sessionId?, voice?, language? }` | Begin voice session |
| `voice_end` | `{ }` | User released mic button |
| `voice_cancel` | `{ }` | User cancelled mid-speech |

### Client → Server (binary frames)

Raw PCM audio chunks: 16-bit, 16kHz, mono. ~50ms intervals (~1600 bytes each). Only accepted when a voice session is active for that client.

### Server → Client (text frames)

| Type | Payload | Description |
|------|---------|-------------|
| `voice_ready` | `{ }` | Voice session established |
| `voice_transcript` | `{ text, final: boolean }` | What STT heard |
| `voice_text` | `{ content }` | AI response text for display |
| `voice_end` | `{ }` | Audio response complete |
| `voice_error` | `{ message }` | Error during voice pipeline |

### Server → Client (binary frames)

TTS audio chunks streamed as generated. Same format: PCM 16-bit 16kHz mono. Client plays through AudioWorklet for gapless playback.

### Push-to-talk flow

1. Client sends `voice_start` → server replies `voice_ready`
2. Client streams binary audio frames while mic is held
3. Client sends `voice_end` → server finalizes buffer, sends to STT
4. Server sends `voice_transcript { text, final: true }`
5. Text enters normal AI pipeline
6. AI response text → `voice_text` + TTS stream as binary frames
7. Server sends `voice_end` when TTS is done

### Audio format

PCM 16-bit 16kHz mono is the universal lowest-common-denominator. Whisper accepts it natively, OpenAI TTS can output it, and the Web Audio API handles it easily. No codec negotiation needed for v1.

---

## VoiceManager

Manages per-client voice sessions with the same lifecycle pattern as BrowserManager.

```
VoiceManager
├── sessions: Map<string, VoiceSession>
├── sttProvider: STTProvider
├── ttsProvider: TTSProvider
├── config: VoiceConfig
│
├── startSession(clientId, options)
├── endSession(clientId)
├── addAudioFrame(clientId, frame: Buffer)
├── transcribe(clientId, audio: Buffer): Promise<Transcription>
├── synthesize(clientId, text: string): AsyncGenerator<Buffer>
└── shutdown()
```

### VoiceSession state machine

```
idle → recording → transcribing → synthesizing → idle
         │                              │
         └── cancelled ─────────────────┘
```

---

## Gateway Changes

Three additions to `packages/gateway`:

**1. Binary frame routing.** The existing `ws.on('message')` handler gets a binary path:

```typescript
ws.on('message', (data, isBinary) => {
  if (isBinary) {
    this.handleAudioFrame(client, data as Buffer);
    return;
  }
  // existing JSON handling...
});
```

**2. Audio buffer management.** Gateway accumulates binary frames per client, forwards complete buffer to runtime on `voice_end`. Max buffer: 30 seconds (~960KB at 16kHz 16-bit mono).

**3. Voice message routing.** New `onVoiceMessage` callback set by runtime:

```typescript
gateway.onVoiceMessage(async (client, type, payload, audioBuffer?) => {
  // handle voice_start, voice_end (with audio), voice_cancel
});
```

### Security

- Binary frames only accepted from authenticated clients with active voice session
- Max single frame: 64KB
- Max total buffer: 960KB (30s)
- Frames from unauthenticated clients dropped silently

---

## Runtime Integration

Voice enters the existing text pipeline. The runtime adds a `handleVoiceMessage` method:

1. `voice_start` → create VoiceSession, reply `voice_ready`
2. Binary frames → accumulate in buffer (handled by gateway)
3. `voice_end` → transcribe → feed text into `processMessage()` → synthesize response → stream audio back

**Refactor:** Extract `processMessage(client, text): Promise<string>` from `handleMessage` so both text and voice paths share the session/provider/tool pipeline.

---

## STT Implementation: OpenAI Whisper

```
packages/stt/
├── src/
│   ├── index.ts           # barrel exports
│   ├── types.ts           # STTProvider, STTOptions, Transcription, AudioFormat
│   ├── whisper.ts         # WhisperSTT class
│   └── pcm-to-wav.ts      # PCM buffer → WAV header utility (~20 lines)
└── tests/
    └── whisper.test.ts
```

Calls `POST https://api.openai.com/v1/audio/transcriptions` with model `whisper-1`. PCM is wrapped with a WAV header (44 bytes) before sending since the API requires a file format.

## TTS Implementation: OpenAI TTS

```
packages/tts/
├── src/
│   ├── index.ts           # barrel exports
│   ├── types.ts           # TTSProvider, TTSOptions, AudioFormat
│   └── openai-tts.ts      # OpenAITTS class
└── tests/
    └── openai-tts.test.ts
```

Calls `POST https://api.openai.com/v1/audio/speech` with model `tts-1`, response format `pcm`. Supports both full synthesis and streaming.

### API key reuse

Both use the `OPENAI_API_KEY` already in the vault. No new credentials needed. If the user only has an Anthropic key, voice mode is unavailable with a clear error message.

### Dependencies

Each package uses `node:fetch` — no new HTTP dependencies.

---

## Configuration

New `voice` section in config schema:

```typescript
voice: z.object({
  enabled: z.boolean().default(false),
  sttProvider: z.enum(['openai-whisper']).default('openai-whisper'),
  ttsProvider: z.enum(['openai-tts']).default('openai-tts'),
  defaultVoice: z.string().default('alloy'),
  language: z.string().default('en'),
  maxAudioDuration: z.number().default(30),
  sampleRate: z.number().default(16000),
})
```

Voice is disabled by default. Opt in via config file or `AUXIORA_VOICE_ENABLED=true`.

Available OpenAI voices: alloy, echo, fable, onyx, nova, shimmer.

---

## Security & Guardrails

| Concern | Mitigation |
|---------|-----------|
| Audio in transit | WSS (TLS) covers it |
| Memory exhaustion | Max 30s buffer (960KB), enforced at gateway |
| API cost abuse | Same rate limiter as text messages |
| Unauthorized voice | Only authenticated clients can send `voice_start` |
| Sensitive audio storage | Audio buffers never persisted — transcribed in memory, then discarded |
| Large TTS requests | Max 4096 chars per synthesis call |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| STT API fails | Send `voice_error`, fall back to text-only for that turn |
| TTS API fails | Send `voice_text` (user sees text), send `voice_error` for audio |
| No OpenAI key | Voice unavailable, clear message at startup and on `voice_start` |
| Audio too short (<0.5s) | Ignore, send `voice_error` with "Audio too short" |
| Audio too long (>30s) | Buffer truncated at 30s, transcribe what we have |
| Client disconnects mid-voice | Clean up voice session, discard buffer |

---

## Audit Events

| Event | Details |
|-------|---------|
| `voice.transcribed` | duration, language, character count (not the audio) |
| `voice.synthesized` | character count, voice name, duration |

---

## Testing Strategy

Unit tests mock STT/TTS API calls. No real audio or API keys needed.

- **VoiceManager tests** (~15): session lifecycle, buffer limits, state machine, concurrent sessions, error handling
- **WhisperSTT tests** (~6): API request format, PCM-to-WAV conversion, response parsing, error handling, options
- **OpenAITTS tests** (~6): API request format, full synthesis, streaming, error handling, options, text length limit
- **Gateway voice tests** (~5): binary frame routing, rejection without session, buffer limit, message routing, auth check
- **Integration tests** (~3): full voice flow, voice-disabled error, missing API key error

~35 new tests, bringing project total to ~235.

---

## Future Scope (not v1.5)

- **Continuous conversation mode** — VAD (voice activity detection), always-on listening
- **Twilio phone calls** — Voice over telephone network using existing Twilio adapter
- **Local Whisper** — whisper.cpp for offline/private STT
- **ElevenLabs TTS** — Higher quality voices, voice cloning
- **Interrupt handling** — User speaks while AI is responding, cancel TTS
- **Multilingual auto-detect** — Let Whisper detect language, respond in same language
