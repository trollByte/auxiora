import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectiveForgetting, extractTopicTags } from '../src/selective-forgetting.js';
import type { MemoryEntry } from '../src/types.js';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: overrides.id ?? 'mem-1',
    content: overrides.content ?? 'Test memory',
    category: overrides.category ?? 'fact',
    source: overrides.source ?? 'extracted',
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    accessCount: overrides.accessCount ?? 0,
    tags: overrides.tags ?? ['test'],
    importance: overrides.importance ?? 0.5,
    confidence: overrides.confidence ?? 0.8,
    sentiment: overrides.sentiment,
    relatedMemories: overrides.relatedMemories,
    provenance: overrides.provenance,
    partitionId: overrides.partitionId,
    sourceUserId: overrides.sourceUserId,
  };
}

describe('SelectiveForgetting', () => {
  let forgetting: SelectiveForgetting;

  beforeEach(() => {
    forgetting = new SelectiveForgetting();
  });

  describe('findRelated', () => {
    it('should return matching memories by tag overlap', () => {
      const memories = [
        makeEntry({ id: 'mem-1', tags: ['python', 'coding', 'programming'] }),
        makeEntry({ id: 'mem-2', tags: ['cooking', 'recipes', 'italian'] }),
      ];

      const result = forgetting.findRelated('python programming', memories);
      expect(result.toRemove).toContain('mem-1');
      expect(result.toRemove).not.toContain('mem-2');
    });

    it('should return empty for unrelated topic', () => {
      const memories = [
        makeEntry({ id: 'mem-1', tags: ['python', 'coding'] }),
        makeEntry({ id: 'mem-2', tags: ['cooking', 'recipes'] }),
      ];

      const result = forgetting.findRelated('gardening flowers', memories);
      expect(result.toRemove).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    it('should skip memories below threshold', () => {
      // Topic tags: ['python', 'programming', 'coding']
      // Memory has 1 of 3 overlapping = 0.33, but we use max(topic, mem) as denominator
      // With tags ['python', 'web', 'design', 'css'] overlap = 1/4 = 0.25 < 0.3
      const memories = [
        makeEntry({ id: 'mem-1', tags: ['python', 'web', 'design', 'css'] }),
      ];

      const result = forgetting.findRelated('python programming coding', memories);
      expect(result.toRemove).toEqual([]);
      expect(result.skipped).toContain('mem-1');
    });

    it('should follow relatedMemories links', () => {
      const memories = [
        makeEntry({ id: 'mem-1', tags: ['python', 'coding'], relatedMemories: ['mem-2'] }),
        makeEntry({ id: 'mem-2', tags: ['unrelated', 'stuff'] }),
      ];

      const result = forgetting.findRelated('python coding', memories);
      expect(result.toRemove).toContain('mem-1');
      expect(result.toRemove).toContain('mem-2');
    });

    it('should respect followRelations=false', () => {
      const memories = [
        makeEntry({ id: 'mem-1', tags: ['python', 'coding'], relatedMemories: ['mem-2'] }),
        makeEntry({ id: 'mem-2', tags: ['unrelated', 'stuff'] }),
      ];

      const result = forgetting.findRelated('python coding', memories, { followRelations: false });
      expect(result.toRemove).toContain('mem-1');
      expect(result.toRemove).not.toContain('mem-2');
    });

    it('should return empty when topic produces no tags', () => {
      const memories = [makeEntry({ id: 'mem-1', tags: ['python'] })];
      const result = forgetting.findRelated('the is a an', memories);
      expect(result.toRemove).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    it('should use custom minOverlap threshold', () => {
      // Topic tags: ['python', 'programming']
      // Memory tags: ['python', 'web', 'design'] -> overlap = 1/3 = 0.33
      const memories = [
        makeEntry({ id: 'mem-1', tags: ['python', 'web', 'design'] }),
      ];

      // Default 0.3 should match
      const result1 = forgetting.findRelated('python programming', memories, { minOverlap: 0.3 });
      expect(result1.toRemove).toContain('mem-1');

      // Higher threshold should not match
      const result2 = forgetting.findRelated('python programming', memories, { minOverlap: 0.5 });
      expect(result2.toRemove).toEqual([]);
      expect(result2.skipped).toContain('mem-1');
    });

    it('should follow transitive relatedMemories links', () => {
      const memories = [
        makeEntry({ id: 'mem-1', tags: ['python', 'coding'], relatedMemories: ['mem-2'] }),
        makeEntry({ id: 'mem-2', tags: ['unrelated'], relatedMemories: ['mem-3'] }),
        makeEntry({ id: 'mem-3', tags: ['other'] }),
      ];

      const result = forgetting.findRelated('python coding', memories);
      expect(result.toRemove).toContain('mem-1');
      expect(result.toRemove).toContain('mem-2');
      expect(result.toRemove).toContain('mem-3');
    });
  });

  describe('forget', () => {
    it('should remove matched memories via callback', async () => {
      const memories = [
        makeEntry({ id: 'mem-1', tags: ['python', 'coding'] }),
        makeEntry({ id: 'mem-2', tags: ['cooking', 'recipes'] }),
      ];

      const removeFn = vi.fn().mockResolvedValue(true);
      const result = await forgetting.forget('python coding', memories, removeFn);

      expect(removeFn).toHaveBeenCalledWith('mem-1');
      expect(removeFn).not.toHaveBeenCalledWith('mem-2');
      expect(result.removedIds).toContain('mem-1');
      expect(result.removedCount).toBe(1);
    });

    it('should not call removeFn in dry run', async () => {
      const memories = [
        makeEntry({ id: 'mem-1', tags: ['python', 'coding'] }),
      ];

      const removeFn = vi.fn().mockResolvedValue(true);
      const result = await forgetting.forget('python coding', memories, removeFn, { dryRun: true });

      expect(removeFn).not.toHaveBeenCalled();
      expect(result.removedCount).toBe(1);
      expect(result.removedIds).toContain('mem-1');
    });

    it('should return correct counts', async () => {
      const memories = [
        makeEntry({ id: 'mem-1', tags: ['python', 'coding', 'programming'] }),
        makeEntry({ id: 'mem-2', tags: ['python', 'web', 'design', 'css'] }),
        makeEntry({ id: 'mem-3', tags: ['cooking', 'recipes'] }),
      ];

      const removeFn = vi.fn().mockResolvedValue(true);
      const result = await forgetting.forget('python programming coding', memories, removeFn);

      expect(result.removedCount).toBe(1);
      expect(result.removedIds).toEqual(['mem-1']);
      expect(result.skippedCount).toBe(1); // mem-2 has low overlap
    });

    it('should handle removeFn returning false', async () => {
      const memories = [
        makeEntry({ id: 'mem-1', tags: ['python', 'coding'] }),
      ];

      const removeFn = vi.fn().mockResolvedValue(false);
      const result = await forgetting.forget('python coding', memories, removeFn);

      expect(removeFn).toHaveBeenCalledWith('mem-1');
      expect(result.removedCount).toBe(0);
      expect(result.removedIds).toEqual([]);
    });
  });

  describe('extractTopicTags', () => {
    it('should filter stop words', () => {
      const tags = extractTopicTags('the python is a programming language');
      expect(tags).toContain('python');
      expect(tags).toContain('programming');
      expect(tags).toContain('language');
      expect(tags).not.toContain('the');
      expect(tags).not.toContain('is');
      expect(tags).not.toContain('a');
    });

    it('should handle empty input', () => {
      expect(extractTopicTags('')).toEqual([]);
    });

    it('should handle input with only short words', () => {
      expect(extractTopicTags('a an is it')).toEqual([]);
    });

    it('should return unique lowercase tags', () => {
      const tags = extractTopicTags('Python python PYTHON coding');
      expect(tags).toEqual(['python', 'coding']);
    });

    it('should strip non-alphanumeric characters', () => {
      const tags = extractTopicTags("python's coding! @programming");
      expect(tags).toContain('pythons');
      expect(tags).toContain('coding');
      expect(tags).toContain('programming');
    });

    it('should filter forgetting-related stop words', () => {
      const tags = extractTopicTags('forget everything about python');
      expect(tags).toContain('python');
      expect(tags).not.toContain('forget');
      expect(tags).not.toContain('everything');
    });
  });
});
