import type { ConversationConfig } from './types.js';
import { DEFAULT_CONVERSATION_CONFIG } from './types.js';

/** Audio stream direction. */
export type StreamDirection = 'inbound' | 'outbound';

/** Audio stream event. */
export interface AudioStreamEvent {
  direction: StreamDirection;
  timestamp: number;
  /** Audio data chunk. */
  data: Buffer;
  /** Whether voice activity was detected in this chunk. */
  voiceDetected?: boolean;
}

/**
 * Manages bidirectional audio streaming with VAD and echo cancellation hints.
 */
export class AudioStreamManager {
  private config: ConversationConfig;
  private inboundBuffer: Buffer[] = [];
  private outboundBuffer: Buffer[] = [];
  private active = false;
  private vadState = false;
  private listeners: Array<(event: AudioStreamEvent) => void> = [];

  constructor(config?: Partial<ConversationConfig>) {
    this.config = { ...DEFAULT_CONVERSATION_CONFIG, ...config };
  }

  /** Start the audio stream. */
  start(): void {
    this.active = true;
    this.inboundBuffer = [];
    this.outboundBuffer = [];
    this.vadState = false;
  }

  /** Stop the audio stream. */
  stop(): void {
    this.active = false;
    this.inboundBuffer = [];
    this.outboundBuffer = [];
  }

  /** Whether the stream is active. */
  isActive(): boolean {
    return this.active;
  }

  /** Push inbound audio (from microphone). */
  pushInbound(data: Buffer): void {
    if (!this.active) return;
    this.inboundBuffer.push(data);

    const voiceDetected = this.detectVoiceActivity(data);
    this.vadState = voiceDetected;

    this.emit({
      direction: 'inbound',
      timestamp: Date.now(),
      data,
      voiceDetected,
    });
  }

  /** Push outbound audio (to speaker). */
  pushOutbound(data: Buffer): void {
    if (!this.active) return;
    this.outboundBuffer.push(data);

    this.emit({
      direction: 'outbound',
      timestamp: Date.now(),
      data,
    });
  }

  /** Get accumulated inbound audio and clear the buffer. */
  flushInbound(): Buffer {
    const combined = Buffer.concat(this.inboundBuffer);
    this.inboundBuffer = [];
    return combined;
  }

  /** Get accumulated outbound audio and clear the buffer. */
  flushOutbound(): Buffer {
    const combined = Buffer.concat(this.outboundBuffer);
    this.outboundBuffer = [];
    return combined;
  }

  /** Whether voice activity is currently detected. */
  isVoiceActive(): boolean {
    return this.vadState;
  }

  /** Whether echo cancellation is enabled. */
  isEchoCancellationEnabled(): boolean {
    return this.config.echoCancellation;
  }

  /** Register an audio stream event listener. */
  onAudio(listener: (event: AudioStreamEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Simple energy-based voice activity detection.
   * Compares average sample amplitude against the sensitivity threshold.
   */
  private detectVoiceActivity(data: Buffer): boolean {
    if (data.length < 2) return false;

    let energy = 0;
    const samples = data.length / 2; // 16-bit samples
    for (let i = 0; i < data.length - 1; i += 2) {
      const sample = data.readInt16LE(i);
      energy += Math.abs(sample);
    }
    const avgEnergy = energy / samples;
    // Normalize to 0-1 range (Int16 max = 32767)
    const normalized = avgEnergy / 32767;
    return normalized > this.config.vadSensitivity;
  }

  private emit(event: AudioStreamEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
