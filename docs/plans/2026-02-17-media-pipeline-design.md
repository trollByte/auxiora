# Media Understanding Pipeline Design

**Date**: 2026-02-17
**Status**: Approved
**Inspired by**: OpenClaw media-understanding pipeline patterns

---

## Problem

Channel adapters parse media attachments (images, audio, video, files) into `InboundMessage.attachments`, but the runtime ignores them entirely. Only `inbound.content` (text) reaches the AI. Users who send photos, voice notes, documents, or videos get responses that are unaware of the media content.

## Solution

Add a `packages/media/` package with a `MediaProcessor` that processes attachments by type, auto-detects available providers from vault API keys, and returns formatted text sections to prepend to the user message before it enters the AI pipeline.

## Architecture

### Package: `packages/media/`

| File | Purpose | ~Lines |
|------|---------|--------|
| `src/types.ts` | `MediaProvider` interface, `MediaResult`, `MediaConfig` | ~40 |
| `src/processor.ts` | `MediaProcessor` orchestrator | ~80 |
| `src/providers/whisper.ts` | Audio transcription via OpenAI Whisper API | ~40 |
| `src/providers/vision.ts` | Image/video description via vision-capable models | ~60 |
| `src/providers/file-extractor.ts` | Text extraction from documents | ~40 |
| `src/auto-detect.ts` | Probe API keys to discover available providers | ~50 |
| `src/format.ts` | Format results into text sections | ~30 |
| `src/index.ts` | Barrel exports | ~10 |

### MediaProvider Interface

```typescript
interface MediaProvider {
  id: string;
  capabilities: Array<'audio' | 'image' | 'video' | 'file'>;
  transcribeAudio?(attachment: Attachment): Promise<MediaResult>;
  describeImage?(attachment: Attachment): Promise<MediaResult>;
  describeVideo?(attachment: Attachment): Promise<MediaResult>;
  extractFile?(attachment: Attachment): Promise<MediaResult>;
}

interface MediaResult {
  success: boolean;
  text?: string;
  error?: string;
}
```

### Built-in Providers

| Provider | Capability | API | Notes |
|----------|-----------|-----|-------|
| `WhisperProvider` | audio | OpenAI `/v1/audio/transcriptions` | Reuses pattern from existing `packages/stt/` |
| `VisionProvider` | image, video | Anthropic vision or OpenAI vision | Uses base64-encoded image in content blocks |
| `FileExtractor` | file | None (direct) | Reads text content from txt, csv, json, xml, yaml, md |

### Auto-Detection

`detectProviders(vault)` probes available API keys:

1. Check for OpenAI API key → enables `WhisperProvider` (audio) + `VisionProvider` (image, video)
2. Check for Anthropic API key → enables `VisionProvider` (image, video)
3. `FileExtractor` always available (no API key needed)

Priority: OpenAI for audio (Whisper is best-in-class), primary configured provider for vision.

### Runtime Integration

In `handleChannelMessage()`, after receiving `inbound` but before `sessions.addMessage()`:

```
InboundMessage { content, attachments? }
  → mediaProcessor.process(attachments)
    → [Audio] Transcript: ...
    → [Image] Description: ...
    → [Video] Description: ...
    → [File: name.csv] Content: ...
  → enrichedContent = mediaResults + inbound.content
  → sessions.addMessage(session.id, 'user', enrichedContent)
```

### Output Format

```
[Audio]
Transcript: The user said hello and asked about the weather.

[Image]
Description: A photo of a golden retriever sitting on a park bench.

[File: report.csv]
Content: name,age,city
Alice,30,NYC
Bob,25,LA

How do you interpret this data?
```

### Size Limits

| Type | Max Size | Timeout |
|------|----------|---------|
| Audio | 20 MB | 60s |
| Image | 10 MB | 30s |
| Video | 50 MB | 120s |
| File | 5 MB | 5s |

### Error Handling

- If processing fails for any attachment, skip it with a debug log — don't block the message
- If no providers are available for a media type, skip silently
- Size/timeout violations logged and skipped

## Testing Strategy

1. **Unit tests** for `MediaProcessor` (~6): process by type, skip unsupported, error handling
2. **Unit tests** for each provider (~4 each): WhisperProvider, VisionProvider, FileExtractor
3. **Unit tests** for auto-detect (~4): key probing, fallback ordering
4. **Unit tests** for formatter (~4): output format, multiple attachments, empty results
5. **Integration tests** for runtime wiring (~3)

## Non-Goals

- No per-channel scope rules (process all attachments from all channels)
- No concurrency limiting (process attachments sequentially for simplicity)
- No streaming of media results (batch before message)
- No media in outbound messages (AI doesn't generate media yet)
- No video frame extraction (pass full video to vision model)
