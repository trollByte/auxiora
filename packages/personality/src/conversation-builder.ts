import type { SoulConfig, ToneSettings } from './types.js';
import { buildSoulMd } from './builder.js';
import { scanAllStringFields } from './marketplace/scanner.js';

export interface ConversationQuestion {
  id: string;
  text: string;
  hint?: string;
}

export interface ConversationStep {
  question: ConversationQuestion;
  warning?: string;
  done: false;
}

export interface ConversationComplete {
  config: SoulConfig;
  soulMd: string;
  warnings?: string[];
  done: true;
}

export type ConversationResult = ConversationStep | ConversationComplete;

interface PartialConfig {
  name?: string;
  pronouns?: string;
  errorStyle?: string;
  humor?: number;
  communicationStyle?: string;
  expertise?: string[];
  boundaries?: { neverJokeAbout: string[]; neverAdviseOn: string[] };
  catchphrases?: Record<string, string>;
}

const NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,63}$/;

const VALID_ERROR_STYLES = [
  'professional',
  'apologetic',
  'matter_of_fact',
  'self_deprecating',
  'gentle',
  'detailed',
  'encouraging',
  'terse',
  'educational',
];

const QUESTIONS: ConversationQuestion[] = [
  {
    id: 'name',
    text: 'What should I call myself? Pick a name for your AI assistant.',
    hint: 'e.g. Nova, Atlas, Jasper, or any name you like',
  },
  {
    id: 'error_style',
    text: 'When I make a mistake or hit an error, how should I communicate it?',
    hint: 'Options: professional, apologetic, matter_of_fact, self_deprecating, gentle, detailed, encouraging, terse, educational',
  },
  {
    id: 'humor',
    text: 'How much humor should I use? (0 = serious, 10 = maximum fun)',
    hint: 'Enter a number from 0 to 10',
  },
  {
    id: 'advice_boundaries',
    text: 'Are there topics I should never give advice on? (comma-separated, or "none")',
    hint: 'e.g. legal, medical, financial',
  },
  {
    id: 'joke_boundaries',
    text: 'Are there topics I should never joke about? (comma-separated, or "none")',
    hint: 'e.g. health, politics, religion',
  },
  {
    id: 'expertise',
    text: 'What are my areas of expertise? (comma-separated, or "general")',
    hint: 'e.g. TypeScript, DevOps, Python, Data Science',
  },
  {
    id: 'catchphrases',
    text: 'Any catchphrases you want me to use? Format: greeting=Hello there!, farewell=See ya! (or "none")',
    hint: 'key=value pairs separated by commas',
  },
  {
    id: 'communication_style',
    text: 'Describe your preferred communication style in a few words.',
    hint: 'e.g. warm and casual, formal and precise, brief and direct',
  },
];

/** Check tone values for unusual combinations. */
function checkToneCoherence(tone: ToneSettings): string[] {
  const warnings: string[] = [];
  if (tone.humor > 0.8 && tone.formality > 0.8) {
    warnings.push('High humor + high formality is unusual. The result may feel inconsistent.');
  }
  if (tone.warmth < 0.2 && tone.humor > 0.6) {
    warnings.push('Low warmth + high humor can come across as mean-spirited.');
  }
  if (tone.directness > 0.9 && tone.warmth > 0.9) {
    warnings.push('Very direct + very warm can feel contradictory.');
  }
  return warnings;
}

export class SoulConversationBuilder {
  private currentStep = 0;
  private partial: PartialConfig = {};
  private lastWarning?: string;

  startConversation(): ConversationResult {
    this.currentStep = 0;
    this.partial = {};
    this.lastWarning = undefined;
    return {
      question: QUESTIONS[0],
      done: false,
    };
  }

  processAnswer(answer: string): ConversationResult {
    const questionId = QUESTIONS[this.currentStep].id;
    this.lastWarning = undefined;
    this.applyAnswer(questionId, answer.trim());
    this.currentStep++;

    if (this.currentStep >= QUESTIONS.length) {
      const config = this.buildConfig();
      const warnings = checkToneCoherence(config.tone);
      return {
        config,
        soulMd: buildSoulMd(config),
        warnings: warnings.length > 0 ? warnings : undefined,
        done: true,
      };
    }

    const step: ConversationStep = {
      question: QUESTIONS[this.currentStep],
      done: false,
    };
    if (this.lastWarning) {
      step.warning = this.lastWarning;
    }
    return step;
  }

  getProgress(): number {
    return Math.round((this.currentStep / QUESTIONS.length) * 100);
  }

  private applyAnswer(questionId: string, answer: string): void {
    switch (questionId) {
      case 'name':
        if (answer && NAME_REGEX.test(answer)) {
          this.partial.name = answer;
        } else if (answer) {
          this.partial.name = 'Auxiora';
          this.lastWarning = `Name "${answer}" contains invalid characters. Using default "Auxiora".`;
        } else {
          this.partial.name = 'Auxiora';
        }
        break;

      case 'error_style': {
        const normalized = answer.toLowerCase().replace(/[\s-]/g, '_');
        this.partial.errorStyle = VALID_ERROR_STYLES.includes(normalized) ? normalized : 'professional';
        break;
      }

      case 'humor': {
        const parsed = parseInt(answer, 10);
        this.partial.humor = Number.isNaN(parsed) ? 0.3 : Math.max(0, Math.min(10, parsed)) / 10;
        break;
      }

      case 'advice_boundaries': {
        if (answer.toLowerCase() === 'none' || !answer) {
          this.partial.boundaries = { ...this.partial.boundaries ?? { neverJokeAbout: [], neverAdviseOn: [] }, neverAdviseOn: [] };
        } else {
          const items = answer.split(',').map(s => s.trim()).filter(Boolean);
          this.partial.boundaries = { ...this.partial.boundaries ?? { neverJokeAbout: [], neverAdviseOn: [] }, neverAdviseOn: items };
        }
        break;
      }

      case 'joke_boundaries': {
        if (answer.toLowerCase() === 'none' || !answer) {
          this.partial.boundaries = { ...this.partial.boundaries ?? { neverJokeAbout: [], neverAdviseOn: [] }, neverJokeAbout: [] };
        } else {
          const items = answer.split(',').map(s => s.trim()).filter(Boolean);
          this.partial.boundaries = { ...this.partial.boundaries ?? { neverJokeAbout: [], neverAdviseOn: [] }, neverJokeAbout: items };
        }
        break;
      }

      case 'expertise': {
        if (answer.toLowerCase() === 'general' || !answer) {
          this.partial.expertise = [];
        } else {
          this.partial.expertise = answer.split(',').map(s => s.trim()).filter(Boolean);
        }
        break;
      }

      case 'catchphrases': {
        if (answer.toLowerCase() === 'none' || !answer) {
          this.partial.catchphrases = {};
        } else {
          const phrases: Record<string, string> = {};
          const pairs = answer.split(',');
          for (const pair of pairs) {
            const eqIndex = pair.indexOf('=');
            if (eqIndex > 0) {
              const key = pair.slice(0, eqIndex).trim();
              const value = pair.slice(eqIndex + 1).trim();
              if (key && value) {
                phrases[key] = value;
              }
            }
          }

          // Scan catchphrases for injection patterns
          const scanResult = scanAllStringFields(phrases);
          if (!scanResult.clean) {
            this.partial.catchphrases = {};
            this.lastWarning = 'Catchphrases contain disallowed patterns and were rejected.';
          } else {
            this.partial.catchphrases = phrases;
          }
        }
        break;
      }

      case 'communication_style':
        this.partial.communicationStyle = answer || 'balanced';
        break;
    }
  }

  private buildConfig(): SoulConfig {
    const style = this.partial.communicationStyle?.toLowerCase() ?? 'balanced';
    const tone = this.inferTone(style);

    return {
      name: this.partial.name ?? 'Auxiora',
      pronouns: this.partial.pronouns ?? 'they/them',
      tone: {
        warmth: tone.warmth,
        directness: tone.directness,
        humor: this.partial.humor ?? 0.3,
        formality: tone.formality,
      },
      expertise: this.partial.expertise ?? [],
      errorStyle: this.partial.errorStyle ?? 'professional',
      catchphrases: this.partial.catchphrases ?? {},
      boundaries: this.partial.boundaries ?? { neverJokeAbout: [], neverAdviseOn: [] },
    };
  }

  private inferTone(style: string): { warmth: number; directness: number; formality: number } {
    if (/warm|friendly|casual/.test(style)) {
      return { warmth: 0.8, directness: 0.5, formality: 0.2 };
    }
    if (/formal|precise|professional/.test(style)) {
      return { warmth: 0.4, directness: 0.7, formality: 0.8 };
    }
    if (/brief|direct|concise/.test(style)) {
      return { warmth: 0.4, directness: 0.9, formality: 0.5 };
    }
    if (/playful|fun/.test(style)) {
      return { warmth: 0.9, directness: 0.4, formality: 0.1 };
    }
    return { warmth: 0.6, directness: 0.6, formality: 0.5 };
  }
}
