import type { VoiceManager } from './voice-manager.js';

/** State of a continuous conversation session. */
export type ContinuousState = 'idle' | 'active' | 'paused';

/** Event emitted during continuous conversation. */
export interface ContinuousEvent {
  type: 'started' | 'paused' | 'resumed' | 'ended' | 'turn_complete';
  timestamp: number;
  turnCount?: number;
}

/**
 * Continuous conversation support for voice.
 * Wraps VoiceManager to enable multi-turn voice conversations
 * without requiring manual start/stop for each turn.
 */
export class ContinuousConversation {
  private voiceManager: VoiceManager;
  private state: ContinuousState = 'idle';
  private turnCount = 0;
  private listeners: Array<(event: ContinuousEvent) => void> = [];

  constructor(voiceManager: VoiceManager) {
    this.voiceManager = voiceManager;
  }

  /** Start continuous conversation for a client. */
  start(clientId: string, options?: { voice?: string; language?: string }): void {
    if (this.state === 'active') return;
    this.voiceManager.startSession(clientId, options);
    this.state = 'active';
    this.turnCount = 0;
    this.emit({ type: 'started', timestamp: Date.now() });
  }

  /** Pause continuous conversation. */
  pause(clientId: string): void {
    if (this.state !== 'active') return;
    this.voiceManager.endSession(clientId);
    this.state = 'paused';
    this.emit({ type: 'paused', timestamp: Date.now() });
  }

  /** Resume continuous conversation. */
  resume(clientId: string, options?: { voice?: string; language?: string }): void {
    if (this.state !== 'paused') return;
    this.voiceManager.startSession(clientId, options);
    this.state = 'active';
    this.emit({ type: 'resumed', timestamp: Date.now() });
  }

  /** End continuous conversation. */
  end(clientId: string): void {
    if (this.state === 'idle') return;
    if (this.voiceManager.hasActiveSession(clientId)) {
      this.voiceManager.endSession(clientId);
    }
    this.state = 'idle';
    this.emit({ type: 'ended', timestamp: Date.now(), turnCount: this.turnCount });
  }

  /** Mark a turn as complete, increment counter. */
  completeTurn(): void {
    this.turnCount++;
    this.emit({ type: 'turn_complete', timestamp: Date.now(), turnCount: this.turnCount });
  }

  /** Get current state. */
  getState(): ContinuousState {
    return this.state;
  }

  /** Get turn count. */
  getTurnCount(): number {
    return this.turnCount;
  }

  /** Register event listener. */
  onEvent(listener: (event: ContinuousEvent) => void): void {
    this.listeners.push(listener);
  }

  private emit(event: ContinuousEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

/** Bidirectional audio streaming types for voice. */
export interface BidirectionalStreamConfig {
  /** Whether to stream audio in real-time. */
  streamInbound: boolean;
  /** Whether to stream TTS output in real-time. */
  streamOutbound: boolean;
  /** Chunk size for streaming in bytes. */
  chunkSize: number;
  /** Sample rate in Hz. */
  sampleRate: number;
}

export const DEFAULT_BIDIRECTIONAL_CONFIG: BidirectionalStreamConfig = {
  streamInbound: true,
  streamOutbound: true,
  chunkSize: 4096,
  sampleRate: 16000,
};
