import { describe, it, expect, vi } from 'vitest';
import { summarizeMessages, type SummarizeFn } from '../src/compaction-summarizer.js';
import type { Message } from '../src/types.js';

function makeMsg(id: string, content: string, role: 'user' | 'assistant' = 'user'): Message {
  return { id, role, content, timestamp: Date.now() - (100 - Number(id)) * 60000 };
}

describe('summarizeMessages', () => {
  it('summarizes all messages in one call when small enough', async () => {
    const msgs = [makeMsg('1', 'Hello'), makeMsg('2', 'How are you?')];
    const summarize: SummarizeFn = vi.fn().mockResolvedValue('User greeted and asked about wellbeing.');
    const result = await summarizeMessages(msgs, summarize);
    expect(result).toBe('User greeted and asked about wellbeing.');
    expect(summarize).toHaveBeenCalledTimes(1);
  });

  it('chunks large message sets and merges summaries', async () => {
    const msgs = Array.from({ length: 20 }, (_, i) =>
      makeMsg(String(i), 'X'.repeat(3000)),
    );
    const summarize: SummarizeFn = vi.fn().mockResolvedValue('Chunk summary.');
    const result = await summarizeMessages(msgs, summarize);
    expect(result).toContain('Chunk summary');
    // Called once per chunk + once to merge
    expect((summarize as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
  });

  it('returns size-only description when summarizer fails', async () => {
    const msgs = [makeMsg('1', 'Hello'), makeMsg('2', 'World')];
    const summarize: SummarizeFn = vi.fn().mockRejectedValue(new Error('API down'));
    const result = await summarizeMessages(msgs, summarize);
    expect(result).toMatch(/2 messages.*summarization failed/i);
  });

  it('returns size-only description for empty messages', async () => {
    const summarize: SummarizeFn = vi.fn();
    const result = await summarizeMessages([], summarize);
    expect(result).toContain('0 messages');
    expect(summarize).not.toHaveBeenCalled();
  });
});
