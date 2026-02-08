import type { SoulConfig } from './types.js';
import { buildSoulMd } from './builder.js';

export interface ConversationQuestion {
  id: string;
  text: string;
  hint?: string;
}

export interface ConversationStep {
  question: ConversationQuestion;
  done: false;
}

export interface ConversationComplete {
  config: SoulConfig;
  soulMd: string;
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

const QUESTIONS: ConversationQuestion[] = [
  {
    id: 'name',
    text: 'What should I call myself? Pick a name for your AI assistant.',
    hint: 'e.g. Nova, Atlas, Jasper, or any name you like',
  },
  {
    id: 'error_style',
    text: 'When I make a mistake or hit an error, how should I communicate it?',
    hint: 'Options: professional, apologetic, matter_of_fact, self_deprecating',
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

export class SoulConversationBuilder {
  private currentStep = 0;
  private partial: PartialConfig = {};

  startConversation(): ConversationResult {
    this.currentStep = 0;
    this.partial = {};
    return {
      question: QUESTIONS[0],
      done: false,
    };
  }

  processAnswer(answer: string): ConversationResult {
    const questionId = QUESTIONS[this.currentStep].id;
    this.applyAnswer(questionId, answer.trim());
    this.currentStep++;

    if (this.currentStep >= QUESTIONS.length) {
      const config = this.buildConfig();
      return {
        config,
        soulMd: buildSoulMd(config),
        done: true,
      };
    }

    return {
      question: QUESTIONS[this.currentStep],
      done: false,
    };
  }

  getProgress(): number {
    return Math.round((this.currentStep / QUESTIONS.length) * 100);
  }

  private applyAnswer(questionId: string, answer: string): void {
    switch (questionId) {
      case 'name':
        this.partial.name = answer || 'Auxiora';
        break;

      case 'error_style': {
        const valid = ['professional', 'apologetic', 'matter_of_fact', 'self_deprecating'];
        const normalized = answer.toLowerCase().replace(/[\s-]/g, '_');
        this.partial.errorStyle = valid.includes(normalized) ? normalized : 'professional';
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
          this.partial.catchphrases = phrases;
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
