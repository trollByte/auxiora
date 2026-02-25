import type { VoicePersonality } from './types.js';
import { DEFAULT_VOICE_PERSONALITY } from './types.js';
import type { TTSOptions } from '@auxiora/tts';

/** Named personality templates mapped to voice parameters. */
const PERSONALITY_TEMPLATES: Record<string, VoicePersonality> = {
  friendly: {
    pace: 1.0,
    pitch: 0.1,
    fillerStyle: 0.3,
    pauseDuration: 250,
  },
  professional: {
    pace: 0.95,
    pitch: 0.0,
    fillerStyle: 0.05,
    pauseDuration: 350,
  },
  enthusiastic: {
    pace: 1.15,
    pitch: 0.2,
    fillerStyle: 0.4,
    pauseDuration: 200,
  },
  calm: {
    pace: 0.85,
    pitch: -0.1,
    fillerStyle: 0.1,
    pauseDuration: 450,
  },
  concise: {
    pace: 1.1,
    pitch: 0.0,
    fillerStyle: 0.0,
    pauseDuration: 200,
  },
};

/**
 * Maps personality templates to TTS voice parameters.
 */
export class VoicePersonalityAdapter {
  private personality: VoicePersonality;

  constructor(personality?: Partial<VoicePersonality>) {
    this.personality = { ...DEFAULT_VOICE_PERSONALITY, ...personality };
  }

  /** Load a named personality template. */
  static fromTemplate(name: string): VoicePersonalityAdapter {
    const template = PERSONALITY_TEMPLATES[name];
    if (!template) {
      return new VoicePersonalityAdapter();
    }
    return new VoicePersonalityAdapter(template);
  }

  /** List available personality template names. */
  static listTemplates(): string[] {
    return Object.keys(PERSONALITY_TEMPLATES);
  }

  /** Get the current voice personality settings. */
  getPersonality(): VoicePersonality {
    return { ...this.personality };
  }

  /** Convert personality to TTS options. */
  toTTSOptions(baseOptions?: TTSOptions): TTSOptions {
    return {
      ...baseOptions,
      speed: this.personality.pace,
    };
  }

  /** Get the natural pause duration for this personality. */
  getPauseDuration(): number {
    return this.personality.pauseDuration;
  }

  /** Whether this personality uses filler words. */
  useFillers(): boolean {
    return this.personality.fillerStyle > 0;
  }

  /** Get filler word probability (0-1). */
  getFillerProbability(): number {
    return this.personality.fillerStyle;
  }
}
