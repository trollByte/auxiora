# Voice Mode

> Talk to Auxiora with your voice. Wake-word detection, real-time conversation, multiple TTS voices.

## Overview

Voice Mode lets you interact with Auxiora through speech instead of text. It combines speech-to-text transcription, text-to-speech synthesis, optional wake-word activation, and a conversation engine that manages the full real-time dialogue lifecycle. Voice works alongside all other features -- the assistant still has access to memory, personality, connectors, and behaviors while speaking with you.

## Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **STT (Speech-to-Text)** | OpenAI Whisper | Transcribes spoken audio into text for the assistant to process |
| **TTS (Text-to-Speech)** | OpenAI TTS, ElevenLabs | Converts the assistant's text responses into natural-sounding speech |
| **Wake Word** | Configurable keyword | Enables hands-free activation without pressing any button |
| **Conversation Engine** | State machine | Manages real-time voice dialogue: listening, processing, speaking, and idle states |

### Conversation Engine States

The conversation engine is a state machine with four states:

| State | Description | Transitions To |
|-------|-------------|----------------|
| **idle** | Waiting for activation (wake word or push-to-talk) | listening |
| **listening** | Capturing audio input from the microphone | processing |
| **processing** | Transcribing speech, generating response, synthesizing audio | speaking |
| **speaking** | Playing back the assistant's spoken response | idle, listening |

The engine supports barge-in -- speaking while the assistant is responding will interrupt playback and transition back to listening.

## Setup

### API Keys

Voice Mode requires at least an OpenAI API key for Whisper transcription. ElevenLabs is optional but provides additional high-quality voice options.

```bash
auxiora vault add OPENAI_API_KEY          # Required: powers Whisper STT + OpenAI TTS
auxiora vault add ELEVENLABS_API_KEY      # Optional: enables ElevenLabs TTS voices
```

### Configuration

Configure voice settings in `~/.auxiora/config.json`:

```json
{
  "voice": {
    "enabled": true,
    "stt": {
      "provider": "whisper",
      "model": "whisper-1",
      "language": "en"
    },
    "tts": {
      "provider": "openai",
      "voice": "alloy",
      "speed": 1.0
    },
    "wakeWord": {
      "enabled": false,
      "keyword": "hey auxiora"
    },
    "inputMode": "push-to-talk"
  }
}
```

### TTS Provider Selection

| Provider | Voices | Quality | Latency | Cost |
|----------|--------|---------|---------|------|
| **OpenAI TTS** | alloy, echo, fable, onyx, nova, shimmer | High | Low | Per-character |
| **ElevenLabs** | Large voice library + voice cloning | Very high | Medium | Per-character (separate billing) |

Switch providers by changing the `tts.provider` field:

```json
{
  "voice": {
    "tts": {
      "provider": "elevenlabs",
      "voice": "rachel",
      "stability": 0.5,
      "similarityBoost": 0.75
    }
  }
}
```

### Voice Selection

Each provider has its own set of available voices:

**OpenAI voices:** `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

**ElevenLabs voices:** Browse the full library at [elevenlabs.io/voice-library](https://elevenlabs.io/voice-library). Use the voice name or ID in the configuration.

### Wake Word

When enabled, the assistant listens continuously for a configurable keyword phrase. Upon detection, it transitions to active listening without requiring any button press.

```json
{
  "voice": {
    "wakeWord": {
      "enabled": true,
      "keyword": "hey auxiora",
      "sensitivity": 0.5
    }
  }
}
```

Sensitivity ranges from 0 (least sensitive, fewer false activations) to 1 (most sensitive, may trigger on similar-sounding phrases). The default of 0.5 balances reliability with responsiveness.

### Input Mode

| Mode | How It Works | Best For |
|------|-------------|----------|
| **push-to-talk** | Hold a key/button to speak, release to send | Noisy environments, precise control |
| **continuous** | Always listening after wake word activation | Hands-free usage, quiet environments |

Set the mode in configuration:

```json
{
  "voice": {
    "inputMode": "push-to-talk"
  }
}
```

Or switch at runtime via CLI:

```bash
auxiora voice mode push-to-talk
auxiora voice mode continuous
```

## Desktop App Integration

The [Desktop Companion App](desktop.md) provides native voice controls that work across all applications on your computer.

### Push-to-Talk Overlay

A floating overlay appears when voice mode is active. Press and hold the configured hotkey to speak from any application -- no need to switch windows. The overlay shows a visual indicator of the current conversation engine state (listening, processing, speaking).

### Global Hotkey

Configure a system-wide keyboard shortcut to activate voice input:

```json
{
  "desktop": {
    "hotkeys": {
      "pushToTalk": "CommandOrControl+Shift+V"
    }
  }
}
```

The default hotkey is `Ctrl+Shift+V` (Windows/Linux) or `Cmd+Shift+V` (macOS). This works even when Auxiora is not the focused application.

### Menu Bar Microphone Toggle

The menu bar / system tray icon includes a microphone toggle:

- **Green microphone** -- Voice mode active, ready to listen
- **Red microphone** -- Voice mode muted
- **Gray microphone** -- Voice mode disabled (no API key configured)

Click the icon to toggle between active and muted states.

## Use Cases

### 1. Hands-Free Assistant

Activate wake word detection with "Hey Auxiora" while cooking, exercising, or doing housework. Ask for recipe conversions, set timers, add items to your grocery list, or check your calendar -- all without touching a device. The assistant responds audibly through your speakers, and the conversation flows naturally with follow-up questions.

### 2. Meeting Notes

During a meeting, use push-to-talk to capture key moments: "Summarize what we just discussed and create action items." The assistant transcribes your spoken summary, cross-references it with your calendar and any connected project management tools (Linear, Notion), and generates structured notes with assigned action items. Results are saved to memory and optionally sent to a connected channel.

### 3. Accessibility

Voice Mode provides a complete voice-first interface for users who prefer or require alternatives to keyboard and mouse input. Combined with the TTS output, the full interaction loop -- asking questions, receiving answers, giving follow-up instructions -- happens entirely through speech. The assistant's personality and memory work identically in voice mode, so the experience matches the text-based interface.

## Related Documentation

- [Desktop App](desktop.md) -- Native push-to-talk overlay and global hotkeys
- [Personality System](personality.md) -- Personality and tone apply equally to voice responses
- [Messaging Channels](channels.md) -- Voice transcriptions can be forwarded to channels
- [CLI Reference](cli.md) -- Full command reference for `auxiora voice`
