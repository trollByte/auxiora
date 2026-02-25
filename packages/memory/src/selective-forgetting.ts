import { getLogger } from '@auxiora/logger';
import type { MemoryEntry } from './types.js';

const logger = getLogger('memory:selective-forgetting');

export interface ForgetResult {
  /** Number of memories removed */
  removedCount: number;
  /** IDs of removed memories */
  removedIds: string[];
  /** Number of memories that matched but were below the threshold */
  skippedCount: number;
}

export interface ForgetOptions {
  /** Minimum tag overlap ratio to consider a memory related. Default: 0.3 */
  minOverlap?: number;
  /** Also forget memories linked via relatedMemories. Default: true */
  followRelations?: boolean;
  /** If true, perform a dry run (report what would be removed without removing). Default: false */
  dryRun?: boolean;
}

/** Extract lowercase unique tags from topic text (same logic as MemoryStore.extractTags). */
function extractTopicTags(topic: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
    'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
    'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
    'just', 'about', 'also', 'that', 'this', 'it', 'its', 'i', 'my',
    'me', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them',
    'their', 'what', 'which', 'who', 'when', 'where', 'how', 'like',
    'user', 'prefers', 'uses', 'wants', 'likes', 'everything',
    'forget', 'remove', 'delete',
  ]);

  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i);
}

export class SelectiveForgetting {
  /**
   * Find memories related to a topic.
   * Returns the IDs that would be removed.
   */
  findRelated(
    topic: string,
    memories: MemoryEntry[],
    options?: ForgetOptions,
  ): { toRemove: string[]; skipped: string[] } {
    const minOverlap = options?.minOverlap ?? 0.3;
    const followRelations = options?.followRelations ?? true;

    const topicTags = extractTopicTags(topic);
    if (topicTags.length === 0) {
      return { toRemove: [], skipped: [] };
    }

    const toRemove = new Set<string>();
    const skipped: string[] = [];

    // Pass 1: find directly matching memories by tag overlap
    for (const mem of memories) {
      const overlap = this.tagOverlap(topicTags, mem.tags);
      if (overlap >= minOverlap) {
        toRemove.add(mem.id);
      } else if (overlap > 0) {
        skipped.push(mem.id);
      }
    }

    // Pass 2: follow relatedMemories links
    if (followRelations) {
      const memoryMap = new Map(memories.map(m => [m.id, m]));
      let changed = true;
      while (changed) {
        changed = false;
        for (const id of toRemove) {
          const mem = memoryMap.get(id);
          if (!mem?.relatedMemories) continue;
          for (const relId of mem.relatedMemories) {
            if (!toRemove.has(relId) && memoryMap.has(relId)) {
              toRemove.add(relId);
              changed = true;
            }
          }
        }
      }
    }

    return { toRemove: [...toRemove], skipped };
  }

  /**
   * Execute forgetting: find related memories and remove them.
   * Accepts a remove callback to abstract away the store implementation.
   */
  async forget(
    topic: string,
    memories: MemoryEntry[],
    removeFn: (id: string) => Promise<boolean>,
    options?: ForgetOptions,
  ): Promise<ForgetResult> {
    const dryRun = options?.dryRun ?? false;
    const { toRemove, skipped } = this.findRelated(topic, memories, options);

    if (dryRun) {
      logger.info('Selective forgetting dry run', { topic, wouldRemove: toRemove.length, skipped: skipped.length });
      return {
        removedCount: toRemove.length,
        removedIds: toRemove,
        skippedCount: skipped.length,
      };
    }

    const removedIds: string[] = [];
    for (const id of toRemove) {
      const removed = await removeFn(id);
      if (removed) removedIds.push(id);
    }

    logger.info('Selective forgetting complete', { topic, removed: removedIds.length, skipped: skipped.length });

    return {
      removedCount: removedIds.length,
      removedIds,
      skippedCount: skipped.length,
    };
  }

  private tagOverlap(topicTags: string[], memTags: string[]): number {
    if (topicTags.length === 0 || memTags.length === 0) return 0;
    const set2 = new Set(memTags);
    const overlap = topicTags.filter(t => set2.has(t)).length;
    return overlap / Math.max(topicTags.length, memTags.length);
  }
}

export { extractTopicTags };
