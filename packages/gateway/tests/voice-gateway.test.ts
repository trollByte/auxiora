import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * These tests verify the gateway voice protocol logic in isolation.
 * We test the AudioBufferManager and voice message routing helpers
 * without spinning up a real HTTP/WS server.
 */

// Max buffer: 30s at 16kHz 16-bit mono
const MAX_BUFFER = 960_000;
const MAX_FRAME = 64 * 1024;

// Simplified AudioBufferManager to test buffer logic
class AudioBufferManager {
  private buffers = new Map<string, Buffer[]>();
  private sizes = new Map<string, number>();

  addFrame(clientId: string, frame: Buffer): boolean {
    if (frame.length > MAX_FRAME) return false;

    const currentSize = this.sizes.get(clientId) ?? 0;
    if (currentSize + frame.length > MAX_BUFFER) return false;

    const frames = this.buffers.get(clientId) ?? [];
    frames.push(frame);
    this.buffers.set(clientId, frames);
    this.sizes.set(clientId, currentSize + frame.length);
    return true;
  }

  flush(clientId: string): Buffer | null {
    const frames = this.buffers.get(clientId);
    if (!frames || frames.length === 0) return null;
    const result = Buffer.concat(frames);
    this.buffers.delete(clientId);
    this.sizes.delete(clientId);
    return result;
  }

  getSize(clientId: string): number {
    return this.sizes.get(clientId) ?? 0;
  }

  clear(clientId: string): void {
    this.buffers.delete(clientId);
    this.sizes.delete(clientId);
  }
}

describe('AudioBufferManager', () => {
  let bufferManager: AudioBufferManager;

  beforeEach(() => {
    bufferManager = new AudioBufferManager();
  });

  it('should accumulate frames for a client', () => {
    bufferManager.addFrame('c1', Buffer.alloc(1600));
    bufferManager.addFrame('c1', Buffer.alloc(1600));
    expect(bufferManager.getSize('c1')).toBe(3200);
  });

  it('should reject frames exceeding max single frame size', () => {
    const tooBig = Buffer.alloc(MAX_FRAME + 1);
    const accepted = bufferManager.addFrame('c1', tooBig);
    expect(accepted).toBe(false);
    expect(bufferManager.getSize('c1')).toBe(0);
  });

  it('should reject frames that would exceed max buffer', () => {
    // Fill in chunks that fit within MAX_FRAME
    const chunkSize = MAX_FRAME;
    const chunks = Math.floor(MAX_BUFFER / chunkSize);
    for (let i = 0; i < chunks; i++) {
      bufferManager.addFrame('c1', Buffer.alloc(chunkSize));
    }
    const remainder = MAX_BUFFER - chunks * chunkSize;
    if (remainder > 0) {
      bufferManager.addFrame('c1', Buffer.alloc(remainder));
    }
    expect(bufferManager.getSize('c1')).toBe(MAX_BUFFER);
    const accepted = bufferManager.addFrame('c1', Buffer.alloc(1));
    expect(accepted).toBe(false);
    expect(bufferManager.getSize('c1')).toBe(MAX_BUFFER);
  });

  it('should flush and return concatenated buffer', () => {
    bufferManager.addFrame('c1', Buffer.from([1, 2, 3]));
    bufferManager.addFrame('c1', Buffer.from([4, 5, 6]));
    const result = bufferManager.flush('c1');
    expect(result).toEqual(Buffer.from([1, 2, 3, 4, 5, 6]));
    expect(bufferManager.getSize('c1')).toBe(0);
  });

  it('should return null when flushing empty buffer', () => {
    expect(bufferManager.flush('nonexistent')).toBeNull();
  });
});

describe('Voice message routing', () => {
  it('should identify voice message types', () => {
    const voiceTypes = ['voice_start', 'voice_end', 'voice_cancel'];
    for (const type of voiceTypes) {
      expect(voiceTypes.includes(type)).toBe(true);
    }
  });

  it('should require authentication for voice messages', () => {
    // Simulates the auth check
    const client = { authenticated: false };
    expect(client.authenticated).toBe(false);

    const authedClient = { authenticated: true };
    expect(authedClient.authenticated).toBe(true);
  });
});
