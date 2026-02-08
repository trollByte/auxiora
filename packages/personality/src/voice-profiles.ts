/** Voice profile settings for a personality template. */
export interface VoiceProfile {
  /** TTS voice name (e.g., 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'). */
  voice: string;
  /** Speaking speed multiplier (0.5 - 2.0). */
  speed: number;
  /** Pause duration between sentences in ms. */
  pauseDuration: number;
  /** Whether to use filler words. */
  useFillers: boolean;
  /** Filler frequency (0-1). */
  fillerFrequency: number;
}

/** Voice profiles mapped to personality template IDs. */
const VOICE_PROFILES: Record<string, VoiceProfile> = {
  professional: {
    voice: 'onyx',
    speed: 0.95,
    pauseDuration: 350,
    useFillers: false,
    fillerFrequency: 0,
  },
  friendly: {
    voice: 'nova',
    speed: 1.0,
    pauseDuration: 250,
    useFillers: true,
    fillerFrequency: 0.2,
  },
  creative: {
    voice: 'fable',
    speed: 1.05,
    pauseDuration: 300,
    useFillers: true,
    fillerFrequency: 0.3,
  },
  minimal: {
    voice: 'echo',
    speed: 1.1,
    pauseDuration: 200,
    useFillers: false,
    fillerFrequency: 0,
  },
  empathetic: {
    voice: 'shimmer',
    speed: 0.9,
    pauseDuration: 400,
    useFillers: true,
    fillerFrequency: 0.15,
  },
  chill: {
    voice: 'nova',
    speed: 0.95,
    pauseDuration: 300,
    useFillers: true,
    fillerFrequency: 0.15,
  },
  mentor: {
    voice: 'shimmer',
    speed: 0.9,
    pauseDuration: 350,
    useFillers: false,
    fillerFrequency: 0,
  },
};

/** Default voice profile. */
export const DEFAULT_VOICE_PROFILE: VoiceProfile = {
  voice: 'alloy',
  speed: 1.0,
  pauseDuration: 300,
  useFillers: false,
  fillerFrequency: 0,
};

/**
 * Get the voice profile for a given personality template.
 * Falls back to the default profile if no match is found.
 */
export function getVoiceProfile(templateId: string): VoiceProfile {
  return VOICE_PROFILES[templateId] ?? DEFAULT_VOICE_PROFILE;
}

/** List all available voice profile template IDs. */
export function listVoiceProfiles(): string[] {
  return Object.keys(VOICE_PROFILES);
}
