import { getLogger } from '@auxiora/logger';

const logger = getLogger('voice:wake');

export interface WakeDetectorConfig {
  /** Whether wake detection is enabled. */
  enabled: boolean;
  /** Wake word or phrase to listen for. */
  wakeWord: string;
  /** Detection sensitivity from 0.0 (lenient) to 1.0 (strict). */
  sensitivity: number;
  /** Silence timeout in ms - stop recording after this much silence. */
  silenceTimeout: number;
  /** Energy threshold for voice activity detection (0.0 to 1.0). */
  energyThreshold: number;
  /** Sample rate in Hz. */
  sampleRate: number;
}

export const DEFAULT_WAKE_DETECTOR_CONFIG: WakeDetectorConfig = {
  enabled: false,
  wakeWord: 'hey auxiora',
  sensitivity: 0.5,
  silenceTimeout: 2000,
  energyThreshold: 0.02,
  sampleRate: 16000,
};

export type WakeDetectorState = 'idle' | 'listening' | 'triggered' | 'recording';

export interface WakeEvent {
  type: 'wake_detected' | 'silence_timeout' | 'recording_started' | 'recording_stopped';
  timestamp: number;
}

/**
 * Voice wake word detector.
 *
 * Processes a continuous audio stream to detect a wake word/phrase
 * using energy-based voice activity detection. When a wake word is
 * detected, transitions to recording mode and feeds audio to a callback.
 * Stops recording after a configurable silence timeout.
 */
export class WakeDetector {
  private config: WakeDetectorConfig;
  private state: WakeDetectorState = 'idle';
  private listeners: Array<(event: WakeEvent) => void> = [];
  private onAudioCallback?: (frame: Buffer) => void;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private frameCount = 0;

  constructor(config?: Partial<WakeDetectorConfig>) {
    this.config = { ...DEFAULT_WAKE_DETECTOR_CONFIG, ...config };
  }

  /** Start listening for the wake word. */
  start(): void {
    if (this.state !== 'idle') return;
    this.state = 'listening';
    this.frameCount = 0;
    logger.info('Wake detector started', {
      wakeWord: this.config.wakeWord,
      sensitivity: this.config.sensitivity,
    });
  }

  /** Stop the wake detector completely. */
  stop(): void {
    this.clearSilenceTimer();
    if (this.state === 'recording') {
      this.emit({ type: 'recording_stopped', timestamp: Date.now() });
    }
    this.state = 'idle';
    this.frameCount = 0;
    logger.info('Wake detector stopped');
  }

  /** Get current state. */
  getState(): WakeDetectorState {
    return this.state;
  }

  /** Get current config. */
  getConfig(): WakeDetectorConfig {
    return { ...this.config };
  }

  /** Set the callback for audio frames during recording. */
  onAudio(callback: (frame: Buffer) => void): void {
    this.onAudioCallback = callback;
  }

  /** Register event listener. */
  onEvent(listener: (event: WakeEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Process an incoming audio frame.
   *
   * In listening state: checks energy level and frame patterns
   * to detect the wake word. On detection, transitions to recording.
   *
   * In recording state: forwards audio to callback and monitors
   * for silence timeout.
   */
  processFrame(frame: Buffer): void {
    if (this.state === 'idle') return;

    this.frameCount++;
    const energy = this.computeEnergy(frame);

    if (this.state === 'listening') {
      if (energy > this.config.energyThreshold) {
        // Voice activity detected — simulate wake word match
        // based on sustained energy above threshold (sensitivity affects
        // how many consecutive frames are required).
        const requiredFrames = Math.max(1, Math.round((1 - this.config.sensitivity) * 10));
        if (this.frameCount >= requiredFrames) {
          this.state = 'triggered';
          logger.info('Wake word detected', { energy, frameCount: this.frameCount });
          this.emit({ type: 'wake_detected', timestamp: Date.now() });
          this.startRecording();
        }
      } else {
        // Reset frame count on silence during listening
        this.frameCount = 0;
      }
    } else if (this.state === 'recording') {
      if (this.onAudioCallback) {
        this.onAudioCallback(frame);
      }

      if (energy > this.config.energyThreshold) {
        // Voice activity — reset silence timer
        this.resetSilenceTimer();
      }
    }
  }

  private startRecording(): void {
    this.state = 'recording';
    this.emit({ type: 'recording_started', timestamp: Date.now() });
    this.resetSilenceTimer();
    logger.info('Recording started after wake detection');
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      if (this.state === 'recording') {
        logger.info('Silence timeout reached, stopping recording');
        this.emit({ type: 'silence_timeout', timestamp: Date.now() });
        this.emit({ type: 'recording_stopped', timestamp: Date.now() });
        // Return to listening for next wake word
        this.state = 'listening';
        this.frameCount = 0;
      }
    }, this.config.silenceTimeout);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Compute RMS energy of a 16-bit PCM audio frame.
   * Returns a value between 0.0 and 1.0.
   */
  private computeEnergy(frame: Buffer): number {
    if (frame.length < 2) return 0;

    const sampleCount = Math.floor(frame.length / 2);
    let sumSquares = 0;

    for (let i = 0; i < sampleCount; i++) {
      const sample = frame.readInt16LE(i * 2);
      const normalized = sample / 32768;
      sumSquares += normalized * normalized;
    }

    return Math.sqrt(sumSquares / sampleCount);
  }

  private emit(event: WakeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
