import type {
  ConversationState,
  ConversationConfig,
  TurnEvent,
  TurnHandler,
  StateHandler,
} from './types.js';
import { DEFAULT_CONVERSATION_CONFIG } from './types.js';

/** Valid state transitions. */
const VALID_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  idle: ['listening'],
  listening: ['thinking', 'idle'],
  thinking: ['speaking', 'idle'],
  speaking: ['idle', 'interrupted'],
  interrupted: ['listening', 'idle'],
};

/**
 * Conversation engine — manages the state machine for real-time voice conversations.
 * State flow: idle -> listening -> thinking -> speaking -> idle
 * Interruption: speaking -> interrupted -> listening
 */
export class ConversationEngine {
  private state: ConversationState = 'idle';
  private config: ConversationConfig;
  private turnHandlers: TurnHandler[] = [];
  private stateHandlers: StateHandler[] = [];
  private turnCount = 0;

  constructor(config?: Partial<ConversationConfig>) {
    this.config = { ...DEFAULT_CONVERSATION_CONFIG, ...config };
  }

  /** Start a conversation session (idle -> listening). */
  start(): void {
    this.transition('listening');
  }

  /** Stop the conversation (any state -> idle). */
  stop(): void {
    this.state = 'idle';
    this.turnCount = 0;
    for (const handler of this.stateHandlers) {
      handler(this.state, 'idle');
    }
  }

  /** Get current state. */
  getState(): ConversationState {
    return this.state;
  }

  /** Get number of turns completed. */
  getTurnCount(): number {
    return this.turnCount;
  }

  /** Register a turn event handler. */
  onTurn(handler: TurnHandler): void {
    this.turnHandlers.push(handler);
  }

  /** Register a state change handler. */
  onStateChange(handler: StateHandler): void {
    this.stateHandlers.push(handler);
  }

  /** Transition to a new state. */
  transition(to: ConversationState): void {
    const from = this.state;
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid transition: ${from} -> ${to}`);
    }
    this.state = to;
    for (const handler of this.stateHandlers) {
      handler(from, to);
    }
  }

  /** Process user speech input. */
  async handleUserSpeech(text: string, audio?: Buffer): Promise<void> {
    if (this.state !== 'listening') {
      throw new Error(`Cannot process speech in state: ${this.state}`);
    }

    const event: TurnEvent = {
      type: 'user_speech',
      timestamp: Date.now(),
      text,
      audio,
    };

    await this.emitTurn(event);
    this.transition('thinking');
    this.turnCount++;
  }

  /** Process AI response. */
  async handleAIResponse(text: string, audio?: Buffer): Promise<void> {
    if (this.state !== 'thinking') {
      throw new Error(`Cannot send response in state: ${this.state}`);
    }

    this.transition('speaking');

    const event: TurnEvent = {
      type: 'ai_response',
      timestamp: Date.now(),
      text,
      audio,
    };

    await this.emitTurn(event);
  }

  /** Signal that speaking is complete, return to listening. */
  finishSpeaking(): void {
    if (this.state !== 'speaking') {
      throw new Error(`Cannot finish speaking in state: ${this.state}`);
    }
    this.transition('idle');
    this.transition('listening');
  }

  /** Handle an interruption (user starts talking while AI is speaking). */
  async handleInterruption(): Promise<void> {
    if (this.state !== 'speaking') {
      throw new Error(`Cannot interrupt in state: ${this.state}`);
    }

    if (!this.config.interruptionEnabled) return;

    this.transition('interrupted');

    const event: TurnEvent = {
      type: 'interruption',
      timestamp: Date.now(),
    };
    await this.emitTurn(event);

    this.transition('listening');
  }

  /** Get current config. */
  getConfig(): ConversationConfig {
    return { ...this.config };
  }

  private async emitTurn(event: TurnEvent): Promise<void> {
    for (const handler of this.turnHandlers) {
      await handler(event);
    }
  }
}
