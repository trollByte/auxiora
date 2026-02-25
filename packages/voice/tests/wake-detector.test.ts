import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WakeDetector, DEFAULT_WAKE_DETECTOR_CONFIG } from '../src/wake-detector.js';
import type { WakeEvent } from '../src/wake-detector.js';

/** Create a 16-bit PCM buffer with a constant amplitude. */
function createPcmFrame(amplitude: number, samples = 160): Buffer {
  const buf = Buffer.alloc(samples * 2);
  const value = Math.round(amplitude * 32767);
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(value, i * 2);
  }
  return buf;
}

/** Create a silent PCM frame. */
function createSilentFrame(samples = 160): Buffer {
  return Buffer.alloc(samples * 2);
}

describe('WakeDetector', () => {
  let detector: WakeDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    detector = new WakeDetector({
      enabled: true,
      sensitivity: 0.5,
      silenceTimeout: 2000,
      energyThreshold: 0.02,
    });
  });

  afterEach(() => {
    detector.stop();
    vi.useRealTimers();
  });

  describe('lifecycle', () => {
    it('should start in idle state', () => {
      expect(detector.getState()).toBe('idle');
    });

    it('should transition to listening on start', () => {
      detector.start();
      expect(detector.getState()).toBe('listening');
    });

    it('should transition to idle on stop', () => {
      detector.start();
      detector.stop();
      expect(detector.getState()).toBe('idle');
    });

    it('should ignore start if not idle', () => {
      detector.start();
      detector.start(); // Should not throw or change state
      expect(detector.getState()).toBe('listening');
    });

    it('should return config copy', () => {
      const config = detector.getConfig();
      expect(config.wakeWord).toBe('hey auxiora');
      expect(config.sensitivity).toBe(0.5);
    });
  });

  describe('defaults', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_WAKE_DETECTOR_CONFIG.enabled).toBe(false);
      expect(DEFAULT_WAKE_DETECTOR_CONFIG.wakeWord).toBe('hey auxiora');
      expect(DEFAULT_WAKE_DETECTOR_CONFIG.sensitivity).toBe(0.5);
      expect(DEFAULT_WAKE_DETECTOR_CONFIG.silenceTimeout).toBe(2000);
      expect(DEFAULT_WAKE_DETECTOR_CONFIG.energyThreshold).toBe(0.02);
      expect(DEFAULT_WAKE_DETECTOR_CONFIG.sampleRate).toBe(16000);
    });
  });

  describe('wake detection', () => {
    it('should ignore frames when idle', () => {
      const events: WakeEvent[] = [];
      detector.onEvent(e => events.push(e));
      detector.processFrame(createPcmFrame(0.5));
      expect(events).toHaveLength(0);
      expect(detector.getState()).toBe('idle');
    });

    it('should detect wake word on sustained energy', () => {
      const events: WakeEvent[] = [];
      detector.onEvent(e => events.push(e));
      detector.start();

      // Send enough frames above threshold to trigger detection
      // sensitivity=0.5 -> requiredFrames = round((1-0.5)*10) = 5
      for (let i = 0; i < 5; i++) {
        detector.processFrame(createPcmFrame(0.1));
      }

      const wakeEvent = events.find(e => e.type === 'wake_detected');
      expect(wakeEvent).toBeDefined();
      expect(detector.getState()).toBe('recording');
    });

    it('should require more frames with lower sensitivity', () => {
      const strictDetector = new WakeDetector({
        enabled: true,
        sensitivity: 0.1,
        silenceTimeout: 2000,
        energyThreshold: 0.02,
      });
      const events: WakeEvent[] = [];
      strictDetector.onEvent(e => events.push(e));
      strictDetector.start();

      // sensitivity=0.1 -> requiredFrames = round((1-0.1)*10) = 9
      for (let i = 0; i < 8; i++) {
        strictDetector.processFrame(createPcmFrame(0.1));
      }
      expect(strictDetector.getState()).toBe('listening');

      strictDetector.processFrame(createPcmFrame(0.1));
      expect(strictDetector.getState()).toBe('recording');
      strictDetector.stop();
    });

    it('should reset frame count on silence during listening', () => {
      const events: WakeEvent[] = [];
      detector.onEvent(e => events.push(e));
      detector.start();

      // Send 3 loud frames, then a silent one
      for (let i = 0; i < 3; i++) {
        detector.processFrame(createPcmFrame(0.1));
      }
      detector.processFrame(createSilentFrame());

      // Then 3 more loud frames — still not enough since count reset
      for (let i = 0; i < 3; i++) {
        detector.processFrame(createPcmFrame(0.1));
      }

      expect(detector.getState()).toBe('listening');
    });

    it('should not detect on frames below energy threshold', () => {
      detector.start();
      for (let i = 0; i < 20; i++) {
        detector.processFrame(createPcmFrame(0.001)); // Very quiet
      }
      expect(detector.getState()).toBe('listening');
    });
  });

  describe('recording', () => {
    function triggerWake(det: WakeDetector): void {
      det.start();
      // sensitivity=0.5 -> 5 frames needed
      for (let i = 0; i < 5; i++) {
        det.processFrame(createPcmFrame(0.1));
      }
    }

    it('should forward audio frames to callback during recording', () => {
      const frames: Buffer[] = [];
      detector.onAudio(frame => frames.push(frame));
      triggerWake(detector);

      const testFrame = createPcmFrame(0.05);
      detector.processFrame(testFrame);

      expect(frames).toHaveLength(1);
      expect(frames[0]).toBe(testFrame);
    });

    it('should emit recording_started on wake detection', () => {
      const events: WakeEvent[] = [];
      detector.onEvent(e => events.push(e));
      triggerWake(detector);

      const recordingStart = events.find(e => e.type === 'recording_started');
      expect(recordingStart).toBeDefined();
    });

    it('should stop recording after silence timeout', () => {
      const events: WakeEvent[] = [];
      detector.onEvent(e => events.push(e));
      triggerWake(detector);

      // Send only silent frames — no voice activity to reset the timer
      detector.processFrame(createSilentFrame());

      // Advance past silence timeout
      vi.advanceTimersByTime(2001);

      const silenceEvent = events.find(e => e.type === 'silence_timeout');
      const stopEvent = events.find(e => e.type === 'recording_stopped');
      expect(silenceEvent).toBeDefined();
      expect(stopEvent).toBeDefined();
      expect(detector.getState()).toBe('listening');
    });

    it('should reset silence timer on voice activity', () => {
      const events: WakeEvent[] = [];
      detector.onEvent(e => events.push(e));
      triggerWake(detector);

      // Advance partway through timeout
      vi.advanceTimersByTime(1500);
      expect(detector.getState()).toBe('recording');

      // Voice activity resets the timer
      detector.processFrame(createPcmFrame(0.1));

      // Advance past original timeout — should still be recording
      vi.advanceTimersByTime(1500);
      expect(detector.getState()).toBe('recording');

      // Now advance past new timeout
      vi.advanceTimersByTime(600);
      expect(detector.getState()).toBe('listening');
    });

    it('should emit recording_stopped when stop() is called during recording', () => {
      const events: WakeEvent[] = [];
      detector.onEvent(e => events.push(e));
      triggerWake(detector);

      detector.stop();

      const stopEvent = events.find(e => e.type === 'recording_stopped');
      expect(stopEvent).toBeDefined();
      expect(detector.getState()).toBe('idle');
    });

    it('should return to listening after silence timeout for next wake', () => {
      triggerWake(detector);
      expect(detector.getState()).toBe('recording');

      vi.advanceTimersByTime(2001);
      expect(detector.getState()).toBe('listening');
    });
  });

  describe('energy computation', () => {
    it('should compute zero energy for silent frame', () => {
      detector.start();
      // processFrame with silence should not trigger detection
      for (let i = 0; i < 20; i++) {
        detector.processFrame(createSilentFrame());
      }
      expect(detector.getState()).toBe('listening');
    });

    it('should compute high energy for loud frame', () => {
      const events: WakeEvent[] = [];
      detector.onEvent(e => events.push(e));
      detector.start();

      // Full amplitude — energy ~1.0
      for (let i = 0; i < 5; i++) {
        detector.processFrame(createPcmFrame(0.9));
      }

      expect(events.some(e => e.type === 'wake_detected')).toBe(true);
    });

    it('should handle very small buffers gracefully', () => {
      detector.start();
      // Single byte — should not crash
      detector.processFrame(Buffer.from([0]));
      expect(detector.getState()).toBe('listening');
    });
  });
});
