import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationEngine } from '../src/engine.js';
import { TurnManager } from '../src/turn-manager.js';
import { VoicePersonalityAdapter } from '../src/voice-personality.js';
import { AudioStreamManager } from '../src/stream.js';
import type { ConversationState, TurnEvent } from '../src/types.js';

describe('ConversationEngine', () => {
  let engine: ConversationEngine;

  beforeEach(() => {
    engine = new ConversationEngine();
  });

  it('should start in idle state', () => {
    expect(engine.getState()).toBe('idle');
  });

  it('should transition from idle to listening on start', () => {
    engine.start();
    expect(engine.getState()).toBe('listening');
  });

  it('should stop and return to idle', () => {
    engine.start();
    engine.stop();
    expect(engine.getState()).toBe('idle');
  });

  it('should process user speech and transition to thinking', async () => {
    engine.start();
    await engine.handleUserSpeech('Hello');
    expect(engine.getState()).toBe('thinking');
    expect(engine.getTurnCount()).toBe(1);
  });

  it('should process AI response and transition to speaking', async () => {
    engine.start();
    await engine.handleUserSpeech('Hello');
    await engine.handleAIResponse('Hi there!');
    expect(engine.getState()).toBe('speaking');
  });

  it('should finish speaking and return to listening', async () => {
    engine.start();
    await engine.handleUserSpeech('Hello');
    await engine.handleAIResponse('Hi!');
    engine.finishSpeaking();
    expect(engine.getState()).toBe('listening');
  });

  it('should handle interruption during speaking', async () => {
    engine.start();
    await engine.handleUserSpeech('Hello');
    await engine.handleAIResponse('Let me explain...');
    await engine.handleInterruption();
    expect(engine.getState()).toBe('listening');
  });

  it('should reject invalid state transitions', () => {
    expect(() => engine.transition('speaking')).toThrow('Invalid transition');
  });

  it('should reject speech in non-listening state', async () => {
    await expect(engine.handleUserSpeech('Hello')).rejects.toThrow('Cannot process speech');
  });

  it('should reject AI response in non-thinking state', async () => {
    engine.start();
    await expect(engine.handleAIResponse('Hi')).rejects.toThrow('Cannot send response');
  });

  it('should emit turn events', async () => {
    const events: TurnEvent[] = [];
    engine.onTurn(event => { events.push(event); });
    engine.start();
    await engine.handleUserSpeech('Hello');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('user_speech');
    expect(events[0].text).toBe('Hello');
  });

  it('should emit state change events', () => {
    const changes: Array<{ from: ConversationState; to: ConversationState }> = [];
    engine.onStateChange((from, to) => { changes.push({ from, to }); });
    engine.start();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ from: 'idle', to: 'listening' });
  });

  it('should track turn count', async () => {
    engine.start();
    expect(engine.getTurnCount()).toBe(0);
    await engine.handleUserSpeech('First');
    expect(engine.getTurnCount()).toBe(1);
    await engine.handleAIResponse('Reply');
    engine.finishSpeaking();
    await engine.handleUserSpeech('Second');
    expect(engine.getTurnCount()).toBe(2);
  });
});

describe('TurnManager', () => {
  let manager: TurnManager;

  beforeEach(() => {
    manager = new TurnManager({ silenceTimeout: 100 });
  });

  it('should not be complete initially', () => {
    expect(manager.isTurnComplete()).toBe(false);
  });

  it('should detect turn completion after silence timeout', async () => {
    manager.recordTurnEnd();
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(manager.isTurnComplete()).toBe(true);
  });

  it('should return filler words when enabled', () => {
    const fillerManager = new TurnManager({ fillersEnabled: true });
    const filler = fillerManager.getFiller();
    expect(filler).toBeTypeOf('string');
  });

  it('should not return fillers when disabled', () => {
    const noFillers = new TurnManager({ fillersEnabled: false });
    expect(noFillers.getFiller()).toBeNull();
  });

  it('should return backchannel responses', () => {
    const bcManager = new TurnManager({ backchannelEnabled: true });
    const bc = bcManager.getBackchannel();
    expect(bc).toBeTypeOf('string');
  });

  it('should not return backchannels when disabled', () => {
    const noBc = new TurnManager({ backchannelEnabled: false });
    expect(noBc.getBackchannel()).toBeNull();
  });

  it('should detect interruption for sufficient duration', () => {
    expect(manager.detectInterruption(500)).toBe(true);
  });

  it('should not detect interruption for short speech', () => {
    const strictManager = new TurnManager({ minSpeechDuration: 1000 });
    expect(strictManager.detectInterruption(500)).toBe(false);
  });

  it('should calculate longer pauses for longer sentences', () => {
    const shortPause = manager.calculatePause(10);
    const longPause = manager.calculatePause(200);
    expect(longPause).toBeGreaterThan(shortPause);
  });

  it('should maintain turn history', () => {
    const event: TurnEvent = { type: 'user_speech', timestamp: Date.now(), text: 'Hello' };
    manager.addToHistory(event);
    const history = manager.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].text).toBe('Hello');
  });

  it('should limit history to 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      manager.addToHistory({ type: 'user_speech', timestamp: Date.now(), text: `msg-${i}` });
    }
    const history = manager.getHistory(100);
    expect(history.length).toBeLessThanOrEqual(50);
  });

  it('should reset state', () => {
    manager.recordTurnEnd();
    manager.addToHistory({ type: 'user_speech', timestamp: Date.now() });
    manager.reset();
    expect(manager.isTurnComplete()).toBe(false);
    expect(manager.getHistory()).toHaveLength(0);
  });
});

describe('VoicePersonalityAdapter', () => {
  it('should use default personality', () => {
    const adapter = new VoicePersonalityAdapter();
    const p = adapter.getPersonality();
    expect(p.pace).toBe(1.0);
    expect(p.pitch).toBe(0.0);
  });

  it('should load from template', () => {
    const adapter = VoicePersonalityAdapter.fromTemplate('calm');
    const p = adapter.getPersonality();
    expect(p.pace).toBeLessThan(1.0);
    expect(p.pauseDuration).toBeGreaterThan(400);
  });

  it('should fall back to defaults for unknown template', () => {
    const adapter = VoicePersonalityAdapter.fromTemplate('nonexistent');
    expect(adapter.getPersonality().pace).toBe(1.0);
  });

  it('should list available templates', () => {
    const templates = VoicePersonalityAdapter.listTemplates();
    expect(templates).toContain('friendly');
    expect(templates).toContain('professional');
    expect(templates).toContain('calm');
    expect(templates.length).toBeGreaterThanOrEqual(4);
  });

  it('should convert to TTS options', () => {
    const adapter = VoicePersonalityAdapter.fromTemplate('enthusiastic');
    const opts = adapter.toTTSOptions({ voice: 'alloy' });
    expect(opts.voice).toBe('alloy');
    expect(opts.speed).toBeGreaterThan(1.0);
  });

  it('should report filler usage', () => {
    const noFillers = VoicePersonalityAdapter.fromTemplate('concise');
    expect(noFillers.useFillers()).toBe(false);

    const fillers = VoicePersonalityAdapter.fromTemplate('friendly');
    expect(fillers.useFillers()).toBe(true);
  });
});

describe('AudioStreamManager', () => {
  let stream: AudioStreamManager;

  beforeEach(() => {
    stream = new AudioStreamManager({ vadSensitivity: 0.01 });
  });

  it('should not be active initially', () => {
    expect(stream.isActive()).toBe(false);
  });

  it('should be active after start', () => {
    stream.start();
    expect(stream.isActive()).toBe(true);
  });

  it('should be inactive after stop', () => {
    stream.start();
    stream.stop();
    expect(stream.isActive()).toBe(false);
  });

  it('should buffer inbound audio', () => {
    stream.start();
    stream.pushInbound(Buffer.from([0x00, 0x10, 0x00, 0x20]));
    stream.pushInbound(Buffer.from([0x00, 0x30]));
    const flushed = stream.flushInbound();
    expect(flushed.length).toBe(6);
  });

  it('should buffer outbound audio', () => {
    stream.start();
    stream.pushOutbound(Buffer.from([0x01, 0x02]));
    const flushed = stream.flushOutbound();
    expect(flushed.length).toBe(2);
  });

  it('should clear buffer on flush', () => {
    stream.start();
    stream.pushInbound(Buffer.from([0x00, 0x10]));
    stream.flushInbound();
    const second = stream.flushInbound();
    expect(second.length).toBe(0);
  });

  it('should detect voice activity for loud audio', () => {
    stream.start();
    // Create a loud sample (high amplitude Int16)
    const loud = Buffer.alloc(4);
    loud.writeInt16LE(20000, 0);
    loud.writeInt16LE(25000, 2);
    stream.pushInbound(loud);
    expect(stream.isVoiceActive()).toBe(true);
  });

  it('should not detect voice activity for silence', () => {
    stream.start();
    const silence = Buffer.alloc(4, 0);
    stream.pushInbound(silence);
    expect(stream.isVoiceActive()).toBe(false);
  });

  it('should emit audio events', () => {
    const events: Array<{ direction: string }> = [];
    stream.onAudio(event => events.push({ direction: event.direction }));
    stream.start();
    stream.pushInbound(Buffer.from([0x00, 0x01]));
    stream.pushOutbound(Buffer.from([0x02, 0x03]));
    expect(events).toHaveLength(2);
    expect(events[0].direction).toBe('inbound');
    expect(events[1].direction).toBe('outbound');
  });

  it('should report echo cancellation setting', () => {
    expect(stream.isEchoCancellationEnabled()).toBe(true);
    const noEcho = new AudioStreamManager({ echoCancellation: false });
    expect(noEcho.isEchoCancellationEnabled()).toBe(false);
  });

  it('should ignore data when not active', () => {
    stream.pushInbound(Buffer.from([0x01]));
    const flushed = stream.flushInbound();
    expect(flushed.length).toBe(0);
  });
});
