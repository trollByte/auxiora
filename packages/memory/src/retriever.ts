import type { MemoryEntry } from './types.js';

const TOKEN_BUDGET = 500;
const CHARS_PER_TOKEN = 4; // rough approximation
const MAX_CHARS = TOKEN_BUDGET * CHARS_PER_TOKEN;
const MIN_SCORE = 0.1;

export class MemoryRetriever {
  /**
   * Select relevant memories and format them for system prompt injection.
   * Returns empty string if no memories are relevant.
   */
  retrieve(memories: MemoryEntry[], userMessage: string): string {
    if (memories.length === 0) return '';

    const queryTags = this.extractQueryTags(userMessage);
    const now = Date.now();

    // Score each memory
    const scored = memories.map(m => ({
      entry: m,
      score: this.scoreMemory(m, queryTags, now),
    }));

    // Filter and sort by score descending
    const relevant = scored
      .filter(s => s.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score);

    if (relevant.length === 0) return '';

    // Build output within token budget
    const lines: string[] = [];
    let totalChars = 0;

    for (const { entry } of relevant) {
      const line = `- ${entry.content} (${entry.category})`;
      if (totalChars + line.length > MAX_CHARS) break;
      lines.push(line);
      totalChars += line.length;
    }

    if (lines.length === 0) return '';

    return `\n\n---\n\n## What you know about the user\n\n${lines.join('\n')}`;
  }

  private scoreMemory(memory: MemoryEntry, queryTags: string[], now: number): number {
    // 1. Tag overlap (0-1, weight 0.6)
    let tagScore = 0;
    if (queryTags.length > 0 && memory.tags.length > 0) {
      const overlap = memory.tags.filter(t => queryTags.includes(t)).length;
      tagScore = overlap / Math.max(queryTags.length, 1);
    }

    // 2. Recency (0-1, weight 0.25) — within last 7 days scores highest
    const ageMs = now - memory.updatedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - ageDays / 30); // decays over 30 days

    // 3. Access frequency (0-1, weight 0.15)
    const accessScore = Math.min(memory.accessCount / 10, 1);

    return tagScore * 0.6 + recencyScore * 0.25 + accessScore * 0.15;
  }

  private extractQueryTags(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'and', 'but', 'or', 'not', 'so', 'yet',
      'i', 'me', 'my', 'we', 'you', 'your', 'he', 'she', 'they', 'it',
      'what', 'which', 'who', 'when', 'where', 'how', 'that', 'this',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .filter((w, i, arr) => arr.indexOf(w) === i);
  }
}
