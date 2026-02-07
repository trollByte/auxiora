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
    ...overrides,
  };
}

describe('MemoryRetriever', () => {
  const retriever = new MemoryRetriever();

  it('should return matching memories formatted for prompt', () => {
    const memories = [
      makeMemory({ content: 'Likes TypeScript', tags: ['typescript', 'programming'], category: 'preference' }),
      makeMemory({ content: 'Works at Acme', tags: ['acme', 'work', 'company'], category: 'fact' }),
    ];

    const result = retriever.retrieve(memories, 'Tell me about TypeScript');
    expect(result).toContain('Likes TypeScript');
    expect(result).toContain('What you know about the user');
  });

  it('should rank by tag overlap', () => {
    const memories = [
      makeMemory({ id: 'a', content: 'Likes Python', tags: ['python', 'programming'] }),
      makeMemory({ id: 'b', content: 'Loves TypeScript deeply', tags: ['typescript', 'programming', 'loves'] }),
    ];

    const result = retriever.retrieve(memories, 'typescript programming');
    // TypeScript memory should appear first (more tag overlap)
    const tsIndex = result.indexOf('TypeScript');
    const pyIndex = result.indexOf('Python');
    expect(tsIndex).toBeLessThan(pyIndex);
  });

  it('should respect token budget', () => {
    // Create many memories to exceed budget
    const memories = Array.from({ length: 100 }, (_, i) =>
      makeMemory({
        id: `mem-${i}`,
        content: `Memory item number ${i} with some extra text to fill space`,
        tags: ['matching', 'keyword'],
      })
    );

    const result = retriever.retrieve(memories, 'matching keyword');
    // Should not include all 100
    expect(result.length).toBeLessThan(100 * 60);
    expect(result).toContain('What you know about the user');
  });

  it('should return empty string when no memories match', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const memories = [
      makeMemory({ content: 'Likes cats', tags: ['cats', 'animals'], updatedAt: thirtyOneDaysAgo, accessCount: 0 }),
    ];

    const result = retriever.retrieve(memories, 'quantum physics');
    expect(result).toBe('');
  });

  it('should return empty string for empty memory list', () => {
    const result = retriever.retrieve([], 'anything');
    expect(result).toBe('');
  });
});
