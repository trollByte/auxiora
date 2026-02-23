import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

/** Structural vault type — no cross-package import needed. */
interface Vault {
  get(key: string): string;
}

const DEFAULT_WHISPER_MODEL = join(
  homedir(),
  '.local',
  'share',
  'whisper',
  'ggml-base.en.bin',
);

const DEFAULT_PIPER_MODEL = join(
  homedir(),
  '.local',
  'share',
  'piper',
  'en_US-lessac-medium.onnx',
);

async function whichBinary(name: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [name]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function vaultGet(vault: Vault | undefined, key: string): string | null {
  if (!vault) return null;
  try {
    return vault.get(key);
  } catch {
    return null;
  }
}

async function detectSTT(
  config: VoiceProviderConfig,
  vault?: Vault,
): Promise<DetectedSTT> {
  if (config.sttProvider !== 'auto') {
    return {
      provider: config.sttProvider as DetectedSTT['provider'],
      reason: `Explicit provider choice: ${config.sttProvider}`,
    };
  }

  // Try whisper-cli first, then whisper
  for (const bin of ['whisper-cli', 'whisper']) {
    const binaryPath = await whichBinary(bin);
    if (binaryPath) {
      const modelExists = await fileExists(DEFAULT_WHISPER_MODEL);
      if (modelExists) {
        return {
          provider: 'whisper-local',
          binaryPath,
          modelPath: DEFAULT_WHISPER_MODEL,
          reason: `Found ${bin} binary and model file`,
        };
      }
    }
  }

  // Try OpenAI API key from vault
  const openaiKey = vaultGet(vault, 'OPENAI_API_KEY');
  if (openaiKey) {
    return {
      provider: 'openai-whisper',
      reason: 'OPENAI_API_KEY available in vault',
    };
  }

  return {
    provider: null,
    reason: 'No STT provider available: no local whisper binary/model and no OPENAI_API_KEY',
  };
}

async function detectTTS(
  config: VoiceProviderConfig,
  vault?: Vault,
): Promise<DetectedTTS> {
  if (config.ttsProvider !== 'auto') {
    return {
      provider: config.ttsProvider as DetectedTTS['provider'],
      reason: `Explicit provider choice: ${config.ttsProvider}`,
    };
  }

  // Try piper
  const piperPath = await whichBinary('piper');
  if (piperPath) {
    const modelExists = await fileExists(DEFAULT_PIPER_MODEL);
    if (modelExists) {
      return {
        provider: 'piper-local',
        binaryPath: piperPath,
        modelPath: DEFAULT_PIPER_MODEL,
        reason: 'Found piper binary and model file',
      };
    }
  }

  // Try OpenAI API key from vault
  const openaiKey = vaultGet(vault, 'OPENAI_API_KEY');
  if (openaiKey) {
    return {
      provider: 'openai-tts',
      reason: 'OPENAI_API_KEY available in vault',
    };
  }

  // Try ElevenLabs API key from vault
  const elevenLabsKey = vaultGet(vault, 'ELEVENLABS_API_KEY');
  if (elevenLabsKey) {
    return {
      provider: 'elevenlabs-tts',
      reason: 'ELEVENLABS_API_KEY available in vault',
    };
  }

  return {
    provider: null,
    reason: 'No TTS provider available: no local piper binary/model and no API keys',
  };
}

export async function detectVoiceProviders(
  config: VoiceProviderConfig,
  vault?: Vault,
): Promise<DetectedProviders> {
  const [stt, tts] = await Promise.all([
    detectSTT(config, vault),
    detectTTS(config, vault),
  ]);
  return { stt, tts };
}
