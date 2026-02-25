import { describe, it, expect } from 'vitest';
import { degradeContext, insertOmissionMarker, truncateLargeMessage } from '../src/context-degradation.js';
import type { Message } from '../src/types.js';

function makeMsg(id: string, content: string, role: 'user' | 'assistant' = 'user'): Message {
  return { id, role, content, timestamp: Date.now() };
}

describe('insertOmissionMarker', () => {
  it('returns undefined when no messages were omitted', () => {
    expect(insertOmissionMarker(5, 5)).toBeUndefined();
  });

  it('returns a system message with correct count', () => {
    const marker = insertOmissionMarker(10, 3);
    expect(marker).toBeDefined();
    expect(marker!.role).toBe('system');
    expect(marker!.content).toContain('7 earlier messages omitted');
  });

  it('handles singular message', () => {
    const marker = insertOmissionMarker(3, 2);
    expect(marker!.content).toContain('1 earlier message omitted');
  });
});

describe('truncateLargeMessage', () => {
  it('returns content unchanged when under threshold', () => {
    const short = 'Hello world';
    expect(truncateLargeMessage(short, 8000)).toBe(short);
  });

  it('truncates oversized content with head + tail', () => {
    const large = 'A'.repeat(10000);
    const result = truncateLargeMessage(large, 8000);
    expect(result.length).toBeLessThan(large.length);
    expect(result).toContain('[...truncated');
    expect(result.startsWith('A')).toBe(true);
    expect(result.endsWith('A')).toBe(true);
  });
});

describe('degradeContext', () => {
  it('returns selected messages unchanged when all fit', () => {
    const all = [makeMsg('1', 'hi'), makeMsg('2', 'hello'), makeMsg('3', 'bye')];
    const result = degradeContext(all, all, 100000);
    expect(result).toEqual(all);
  });

  it('inserts omission marker when messages were dropped', () => {
    const all = [makeMsg('1', 'first'), makeMsg('2', 'second'), makeMsg('3', 'third'), makeMsg('4', 'fourth')];
    const selected = [makeMsg('1', 'first'), makeMsg('4', 'fourth')];
    const result = degradeContext(all, selected, 100000);
    expect(result).toHaveLength(3);
    expect(result[0].content).toBe('first');
    expect(result[1].role).toBe('system');
    expect(result[1].content).toContain('2 earlier messages omitted');
    expect(result[2].content).toBe('fourth');
  });

  it('keeps first 2 messages for context anchoring', () => {
    const all = Array.from({ length: 10 }, (_, i) => makeMsg(String(i), `msg-${i}`));
    const selected = [all[0], all[1], all[8], all[9]];
    const result = degradeContext(all, selected, 100000);
    expect(result[0].content).toBe('msg-0');
    expect(result[1].content).toBe('msg-1');
    expect(result[2].role).toBe('system');
    expect(result[3].content).toBe('msg-8');
    expect(result[4].content).toBe('msg-9');
  });

  it('truncates large messages in the result', () => {
    const all = [makeMsg('1', 'A'.repeat(10000))];
    const result = degradeContext(all, all, 100000, 8000);
    expect(result[0].content).toContain('[...truncated');
  });

  it('handles edge case: all messages dropped', () => {
    const all = [makeMsg('1', 'hi'), makeMsg('2', 'hello')];
    const selected: Message[] = [];
    const result = degradeContext(all, selected, 100000);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('2 earlier messages omitted');
  });
});
