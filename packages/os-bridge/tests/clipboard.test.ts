import { describe, it, expect, vi } from 'vitest';
import { ClipboardMonitor } from '../src/clipboard.js';

describe('ClipboardMonitor', () => {
  it('addEntry adds to history', () => {
    const monitor = new ClipboardMonitor();
    monitor.addEntry('hello');
    expect(monitor.getHistory()).toHaveLength(1);
    expect(monitor.getHistory()[0]!.content).toBe('hello');
  });

  it('getContent returns latest entry', () => {
    const monitor = new ClipboardMonitor();
    monitor.addEntry('first');
    monitor.addEntry('second');
    expect(monitor.getContent().content).toBe('second');
  });

  it('getContent returns empty entry when no history', () => {
    const monitor = new ClipboardMonitor();
    const entry = monitor.getContent();
    expect(entry.content).toBe('');
    expect(entry.type).toBe('text');
  });

  it('getHistory returns limited entries', () => {
    const monitor = new ClipboardMonitor();
    monitor.addEntry('a');
    monitor.addEntry('b');
    monitor.addEntry('c');
    const limited = monitor.getHistory(2);
    expect(limited).toHaveLength(2);
    expect(limited[0]!.content).toBe('b');
    expect(limited[1]!.content).toBe('c');
  });

  it('transform uppercase works', () => {
    const monitor = new ClipboardMonitor();
    expect(monitor.transform('hello', 'uppercase')).toBe('HELLO');
  });

  it('transform lowercase works', () => {
    const monitor = new ClipboardMonitor();
    expect(monitor.transform('HELLO', 'lowercase')).toBe('hello');
  });

  it('transform trim works', () => {
    const monitor = new ClipboardMonitor();
    expect(monitor.transform('  hello  ', 'trim')).toBe('hello');
  });

  it('transform json-format pretty-prints JSON', () => {
    const monitor = new ClipboardMonitor();
    const result = monitor.transform('{"a":1}', 'json-format');
    expect(result).toBe('{\n  "a": 1\n}');
  });

  it('onchange listener fires on addEntry', () => {
    const monitor = new ClipboardMonitor();
    const listener = vi.fn();
    monitor.onchange(listener);
    monitor.addEntry('test');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0]!.content).toBe('test');
  });

  it('onchange unsubscribe stops notifications', () => {
    const monitor = new ClipboardMonitor();
    const listener = vi.fn();
    const unsub = monitor.onchange(listener);
    unsub();
    monitor.addEntry('test');
    expect(listener).not.toHaveBeenCalled();
  });
});
