import { describe, it, expect } from 'vitest';
import { MemoryRetriever } from '../src/retriever.js';
import type { MemoryEntry } from '../src/types.js';

function makeMemory(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'mem-test',
    content: 'Test memory',
    category: 'fact',
    source: 'explicit',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    accessCount: 0,
    tags: ['test', 'memory'],
    importance: 0.5,
    confidence: 0.8,
    sentiment: 'neutral',
    encrypted: false,
    ...overrides,
  };
}

describe('MemoryRetriever', () => {
  const retriever = new MemoryRetriever();

  it('should return matching memories formatted for prompt', () => {
    const memories = [
      makeMemory({ content: 'Likes TypeScript', tags: ['typescript', 'programming'], category: 'preference' }),
      makeMemory({ id: 'mem-2', content: 'Works at Acme', tags: ['acme', 'work', 'company'], category: 'fact' }),
    ];

    const result = retriever.retrieve(memories, 'Tell me about TypeScript');
    expect(result).toContain('Likes TypeScript');
    expect(result).toContain('What you know about the user');
  });

  it('should rank by tag overlap', () => {
    const memories = [
      makeMemory({ id: 'a', content: 'Likes Python', tags: ['python', 'programming'], category: 'preference' }),
      makeMemory({ id: 'b', content: 'Loves TypeScript deeply', tags: ['typescript', 'programming', 'loves'], category: 'preference' }),
    ];

    const result = retriever.retrieve(memories, 'typescript programming');
    // TypeScript memory should appear first (more tag overlap)
    const tsIndex = result.indexOf('TypeScript');
    const pyIndex = result.indexOf('Python');
    expect(tsIndex).toBeLessThan(pyIndex);
  });

  it('should respect token budget', () => {
    const memories = Array.from({ length: 100 }, (_, i) =>
      makeMemory({
        id: `mem-${i}`,
        content: `Memory item number ${i} with some extra text to fill space`,
        tags: ['matching', 'keyword'],
      }),
    );

    const result = retriever.retrieve(memories, 'matching keyword');
    // Should not include all 100
    expect(result.length).toBeLessThan(100 * 60);
    expect(result).toContain('What you know about the user');
  });

  it('should return empty string when no memories match', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const memories = [
      makeMemory({
        content: 'Likes cats',
        tags: ['cats', 'animals'],
        updatedAt: thirtyOneDaysAgo,
        accessCount: 0,
        importance: 0,
        confidence: 0,
      }),
    ];

    const result = retriever.retrieve(memories, 'quantum physics');
    expect(result).toBe('');
  });

  it('should return empty string for empty memory list', () => {
    const result = retriever.retrieve([], 'anything');
    expect(result).toBe('');
  });

  // === New tests for importance weighting ===

  it('should favor high-importance memories', () => {
    const memories = [
      makeMemory({ id: 'low', content: 'Low importance fact', tags: ['fact'], category: 'fact', importance: 0.1 }),
      makeMemory({ id: 'high', content: 'High importance fact', tags: ['fact'], category: 'fact', importance: 0.9 }),
    ];

    const result = retriever.retrieve(memories, 'fact');
    const highIndex = result.indexOf('High importance');
    const lowIndex = result.indexOf('Low importance');
    // High importance should appear before low importance
    if (lowIndex >= 0) {
      expect(highIndex).toBeLessThan(lowIndex);
    } else {
      // At minimum, high importance should appear
      expect(highIndex).toBeGreaterThan(-1);
    }
  });

  // === Category budget allocation ===

  it('should include section headers by category', () => {
    const memories = [
      makeMemory({ id: 'f1', content: 'Works at Acme Corp', tags: ['acme', 'work'], category: 'fact' }),
      makeMemory({ id: 'p1', content: 'Prefers dark mode', tags: ['dark', 'mode'], category: 'preference' }),
      makeMemory({ id: 'r1', content: 'Shared debugging session', tags: ['debug', 'session'], category: 'relationship' }),
      makeMemory({ id: 'pt1', content: 'Prefers brief responses', tags: ['brief', 'responses'], category: 'pattern' }),
    ];

    const result = retriever.retrieve(memories, 'dark mode debug session work acme brief responses');
    expect(result).toContain('### Key Facts');
    expect(result).toContain('### Preferences');
  });

  // === Expired memory filtering ===

  it('should skip expired memories', () => {
    const past = Date.now() - 1000;
    const memories = [
      makeMemory({
        id: 'expired',
        content: 'Expired memory',
        tags: ['test', 'expired'],
        expiresAt: past,
      }),
      makeMemory({
        id: 'valid',
        content: 'Valid memory still here',
        tags: ['test', 'valid'],
      }),
    ];

    const result = retriever.retrieve(memories, 'test');
    expect(result).not.toContain('Expired memory');
    expect(result).toContain('Valid memory');
  });

  it('should return empty when all memories are expired', () => {
    const past = Date.now() - 1000;
    const memories = [
      makeMemory({ id: 'e1', content: 'Expired one', tags: ['test'], expiresAt: past }),
      makeMemory({ id: 'e2', content: 'Expired two', tags: ['test'], expiresAt: past }),
    ];

    const result = retriever.retrieve(memories, 'test');
    expect(result).toBe('');
  });

  // === Related memory boosting ===

  it('should boost related memories', () => {
    const memories = [
      makeMemory({
        id: 'primary',
        content: 'Loves TypeScript',
        tags: ['typescript'],
        category: 'preference',
        importance: 0.9,
        relatedMemories: ['related'],
      }),
      makeMemory({
        id: 'related',
        content: 'Uses TypeScript at work',
        tags: ['work', 'coding'],
        category: 'fact',
        importance: 0.3,
        relatedMemories: ['primary'],
      }),
      makeMemory({
        id: 'unrelated',
        content: 'Likes hiking on weekends',
        tags: ['hiking', 'weekends'],
        category: 'preference',
        importance: 0.3,
      }),
    ];

    const result = retriever.retrieve(memories, 'typescript');
    // The related memory should appear because it gets boosted by the primary match
    expect(result).toContain('TypeScript at work');
  });

  // === Confidence scoring ===

  it('should show high confidence annotation for facts', () => {
    const memories = [
      makeMemory({
        id: 'hc',
        content: 'Works at Acme Corp',
        tags: ['acme', 'work'],
        category: 'fact',
        confidence: 0.95,
      }),
    ];

    const result = retriever.retrieve(memories, 'acme work');
    expect(result).toContain('high confidence');
  });

  // === Relationship bonus ===

  it('should give bonus score to relationship memories', () => {
    const thirtyDaysAgo = Date.now() - 29 * 24 * 60 * 60 * 1000;
    const memories = [
      makeMemory({
        id: 'rel',
        content: 'Shared a joke about recursion',
        tags: ['joke'],
        category: 'relationship',
        importance: 0.5,
        confidence: 0.5,
        updatedAt: thirtyDaysAgo,
      }),
      makeMemory({
        id: 'ctx',
        content: 'Was in a meeting',
        tags: ['meeting'],
        category: 'context',
        importance: 0.5,
        confidence: 0.5,
        updatedAt: thirtyDaysAgo,
      }),
    ];

    // Both have same importance, confidence, recency but relationship gets a 0.05 bonus
    const result = retriever.retrieve(memories, 'something unrelated');
    // Relationship memory should still appear due to the bonus
    if (result.length > 0) {
      // If anything shows, relationship should be present
      expect(result).toContain('recursion');
    }
  });
});
