import type { ConversationConfig, TurnEvent } from './types.js';
import { DEFAULT_CONVERSATION_CONFIG } from './types.js';

/** Filler words used during thinking pauses. */
const FILLER_WORDS = ['um', 'uh', 'hmm', 'let me think', 'well'];

/** Backchannel responses to acknowledge the user. */
const BACKCHANNEL_RESPONSES = ['uh-huh', 'yeah', 'I see', 'right', 'got it', 'mm-hmm'];

/**
 * Manages turn-taking, natural pauses, backchanneling, and filler words.
 */
export class TurnManager {
  private config: ConversationConfig;
  private lastSpeechEnd = 0;
  private turnHistory: TurnEvent[] = [];

  constructor(config?: Partial<ConversationConfig>) {
    this.config = { ...DEFAULT_CONVERSATION_CONFIG, ...config };
  }

  /** Record the end of a speech turn. */
  recordTurnEnd(): void {
    this.lastSpeechEnd = Date.now();
  }

  /** Check if enough silence has passed to end the current turn. */
  isTurnComplete(): boolean {
    if (this.lastSpeechEnd === 0) return false;
    return (Date.now() - this.lastSpeechEnd) >= this.config.silenceTimeout;
  }

  /** Get a random filler word for thinking pauses. */
  getFiller(): string | null {
    if (!this.config.fillersEnabled) return null;
    return FILLER_WORDS[Math.floor(Math.random() * FILLER_WORDS.length)];
  }

  /** Get a backchannel response to acknowledge user speech. */
  getBackchannel(): string | null {
    if (!this.config.backchannelEnabled) return null;
    return BACKCHANNEL_RESPONSES[Math.floor(Math.random() * BACKCHANNEL_RESPONSES.length)];
  }

  /** Detect if the user is attempting to interrupt. */
  detectInterruption(speechDuration: number): boolean {
    if (!this.config.interruptionEnabled) return false;
    return speechDuration >= this.config.minSpeechDuration;
  }

  /** Calculate natural pause duration between sentences. */
  calculatePause(sentenceLength: number): number {
    // Longer sentences get slightly longer pauses
    const basePause = 200;
    const lengthFactor = Math.min(sentenceLength / 100, 2);
    return Math.round(basePause + lengthFactor * 150);
  }

  /** Add a turn event to history. */
  addToHistory(event: TurnEvent): void {
    this.turnHistory.push(event);
    // Keep last 50 turns
    if (this.turnHistory.length > 50) {
      this.turnHistory = this.turnHistory.slice(-50);
    }
  }

  /** Get recent turn history. */
  getHistory(limit = 10): TurnEvent[] {
    return this.turnHistory.slice(-limit);
  }

  /** Reset turn state. */
  reset(): void {
    this.lastSpeechEnd = 0;
    this.turnHistory = [];
  }
}
