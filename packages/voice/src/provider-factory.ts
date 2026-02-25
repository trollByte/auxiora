import { WhisperLocalSTT, WhisperSTT } from '@auxiora/stt';
import { PiperTTS, OpenAITTS, ElevenLabsTTS } from '@auxiora/tts';
import type { STTProvider } from '@auxiora/stt';
import type { TTSProvider } from '@auxiora/tts';

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

export function createSTTProvider(
  provider: string,
  options: STTProviderOptions,
): STTProvider {
  switch (provider) {
    case 'whisper-local': {
      if (!options.binaryPath || !options.modelPath) {
        throw new Error('whisper-local requires binaryPath and modelPath');
      }
      return new WhisperLocalSTT({
        binaryPath: options.binaryPath,
        modelPath: options.modelPath,
      });
    }
    case 'openai-whisper': {
      if (!options.apiKey) {
        throw new Error('openai-whisper requires apiKey');
      }
      return new WhisperSTT({ apiKey: options.apiKey });
    }
    default:
      throw new Error(`Unknown STT provider: ${provider}`);
  }
}

export function createTTSProvider(
  provider: string,
  options: TTSProviderOptions,
): TTSProvider {
  switch (provider) {
    case 'piper-local': {
      if (!options.binaryPath || !options.modelPath) {
        throw new Error('piper-local requires binaryPath and modelPath');
      }
      return new PiperTTS({
        binaryPath: options.binaryPath,
        modelPath: options.modelPath,
      });
    }
    case 'openai-tts': {
      if (!options.apiKey) {
        throw new Error('openai-tts requires apiKey');
      }
      return new OpenAITTS({
        apiKey: options.apiKey,
        defaultVoice: options.defaultVoice,
      });
    }
    case 'elevenlabs-tts': {
      if (!options.apiKey) {
        throw new Error('elevenlabs-tts requires apiKey');
      }
      return new ElevenLabsTTS({ apiKey: options.apiKey });
    }
    default:
      throw new Error(`Unknown TTS provider: ${provider}`);
  }
}
