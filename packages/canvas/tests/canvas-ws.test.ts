import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasSession } from '../src/canvas-session.js';
import type { CanvasEvent, TextObject } from '../src/types.js';

/**
 * Verifies that CanvasSession emits well-formed events suitable for
 * WebSocket transport — each event must include type, sessionId, and timestamp.
 */
describe('CanvasSession event broadcasting', () => {
  let session: CanvasSession;

  const textInput = {
    type: 'text' as const,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    visible: true,
    content: 'hi',
    fontSize: 16,
    fontFamily: 'sans-serif',
    color: '#fff',
  };

  beforeEach(() => {
    session = new CanvasSession({ id: 'ws-test', width: 800, height: 600 });
  });

  it('emits object:added event when addObject is called', () => {
    const events: CanvasEvent[] = [];
    session.on('object:added', (evt) => events.push(evt));

    const obj = session.addObject(textInput);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('object:added');
    expect(events[0].sessionId).toBe('ws-test');
    expect(events[0].objectId).toBe(obj.id);
    expect(events[0].data).toBeDefined();
    expect((events[0].data as TextObject).content).toBe('hi');
    expect(events[0].timestamp).toBeTruthy();
  });

  it('emits object:updated event when updateObject is called', () => {
    const obj = session.addObject(textInput);

    const events: CanvasEvent[] = [];
    session.on('object:updated', (evt) => events.push(evt));

    session.updateObject(obj.id, { x: 50, y: 75 });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('object:updated');
    expect(events[0].sessionId).toBe('ws-test');
    expect(events[0].objectId).toBe(obj.id);
    expect((events[0].data as TextObject).x).toBe(50);
    expect(events[0].timestamp).toBeTruthy();
  });

  it('emits object:removed event when removeObject is called', () => {
    const obj = session.addObject(textInput);

    const events: CanvasEvent[] = [];
    session.on('object:removed', (evt) => events.push(evt));

    session.removeObject(obj.id);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('object:removed');
    expect(events[0].sessionId).toBe('ws-test');
    expect(events[0].objectId).toBe(obj.id);
    expect(events[0].data).toBeUndefined();
    expect(events[0].timestamp).toBeTruthy();
  });

  it('emits canvas:cleared event when clear is called', () => {
    session.addObject(textInput);

    const events: CanvasEvent[] = [];
    session.on('canvas:cleared', (evt) => events.push(evt));

    session.clear();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('canvas:cleared');
    expect(events[0].sessionId).toBe('ws-test');
    expect(events[0].timestamp).toBeTruthy();
  });

  it('emits canvas:resized event when resize is called', () => {
    const events: CanvasEvent[] = [];
    session.on('canvas:resized', (evt) => events.push(evt));

    session.resize(1024, 768);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('canvas:resized');
    expect(events[0].sessionId).toBe('ws-test');
    expect(events[0].data).toEqual({ width: 1024, height: 768 });
    expect(events[0].timestamp).toBeTruthy();
  });

  it('emits canvas:snapshot event when snapshot is called', () => {
    session.addObject(textInput);

    const events: CanvasEvent[] = [];
    session.on('canvas:snapshot', (evt) => events.push(evt));

    const snap = session.snapshot();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('canvas:snapshot');
    expect(events[0].sessionId).toBe('ws-test');
    expect(events[0].data).toEqual(snap);
    expect(events[0].timestamp).toBeTruthy();
  });

  it('supports unsubscribing from events with off()', () => {
    const events: CanvasEvent[] = [];
    const handler = (evt: CanvasEvent) => events.push(evt);
    session.on('object:added', handler);

    session.addObject(textInput);
    expect(events).toHaveLength(1);

    session.off('object:added', handler);
    session.addObject({ ...textInput, content: 'second' });
    expect(events).toHaveLength(1);
  });

  it('events are JSON-serialisable for WebSocket transport', () => {
    const events: CanvasEvent[] = [];
    session.on('object:added', (evt) => events.push(evt));

    session.addObject(textInput);

    const json = JSON.stringify(events[0]);
    const parsed = JSON.parse(json) as CanvasEvent;
    expect(parsed.type).toBe('object:added');
    expect(parsed.sessionId).toBe('ws-test');
    expect(parsed.timestamp).toBeTruthy();
  });
});
