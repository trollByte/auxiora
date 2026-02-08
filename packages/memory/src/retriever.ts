import type { MemoryEntry, MemoryCategory } from './types.js';

const TOKEN_BUDGET = 1000;
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = TOKEN_BUDGET * CHARS_PER_TOKEN;
const MIN_SCORE = 0.1;

const SCORING_WEIGHTS = {
  tagRelevance: 0.35,
  importance: 0.25,
  recency: 0.15,
  access: 0.10,
  confidence: 0.10,
  relationship: 0.05,
};

const BUDGET_ALLOCATION: Record<MemoryCategory, number> = {
  preference: 0.25,
  fact: 0.25,
  context: 0.15,
  relationship: 0.15,
  pattern: 0.10,
  personality: 0.10,
};

const SECTION_HEADERS: Record<string, string> = {
  fact: '### Key Facts',
  preference: '### Preferences',
  context: '### Context',
  relationship: '### Your Relationship',
  pattern: '### Communication Patterns',
  personality: '### Personality Notes',
};

interface ScoredMemory {
  entry: MemoryEntry;
  score: number;
}

export class MemoryRetriever {
  /**
   * Retrieve relevant memories for a user message.
   * If accessiblePartitionIds is provided, only memories from those partitions are included.
   * This ensures private memories are never leaked to other users.
   */
  retrieve(memories: MemoryEntry[], userMessage: string, accessiblePartitionIds?: string[]): string {
    if (memories.length === 0) return '';

    // Filter by accessible partitions if specified
    if (accessiblePartitionIds) {
      const idSet = new Set(accessiblePartitionIds);
      memories = memories.filter(m => idSet.has(m.partitionId ?? 'global'));
    }

    if (memories.length === 0) return '';

    const now = Date.now();

    // Filter out expired memories
    const active = memories.filter(m => m.expiresAt === undefined || m.expiresAt > now);
    if (active.length === 0) return '';

    const queryTags = this.extractQueryTags(userMessage);

    // Score each memory
    const scored: ScoredMemory[] = active.map(m => ({
      entry: m,
      score: this.scoreMemory(m, queryTags, now),
    }));

    // Boost related memories
    this.boostRelatedMemories(scored);

    // Filter by minimum score
    const relevant = scored
      .filter(s => s.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score);

    if (relevant.length === 0) return '';

    // Group by category and allocate budget
    const sections = this.buildSections(relevant);
    if (sections.length === 0) return '';

    return `\n\n---\n\n## What you know about the user\n\n${sections.join('\n\n')}`;
  }

  private scoreMemory(memory: MemoryEntry, queryTags: string[], now: number): number {
    // 1. Tag relevance (0-1)
    let tagScore = 0;
    if (queryTags.length > 0 && memory.tags.length > 0) {
      const overlap = memory.tags.filter(t => queryTags.includes(t)).length;
      tagScore = overlap / Math.max(queryTags.length, 1);
    }

    // 2. Importance (0-1)
    const importanceScore = memory.importance;

    // 3. Recency (0-1) — decays over 30 days
    const ageMs = now - memory.updatedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - ageDays / 30);

    // 4. Access frequency (0-1)
    const accessScore = Math.min(memory.accessCount / 10, 1);

    // 5. Confidence (0-1)
    const confidenceScore = memory.confidence;

    // 6. Relationship bonus
    const relationshipBonus = memory.category === 'relationship' ? 1 : 0;

    return (
      tagScore * SCORING_WEIGHTS.tagRelevance +
      importanceScore * SCORING_WEIGHTS.importance +
      recencyScore * SCORING_WEIGHTS.recency +
      accessScore * SCORING_WEIGHTS.access +
      confidenceScore * SCORING_WEIGHTS.confidence +
      relationshipBonus * SCORING_WEIGHTS.relationship
    );
  }

  private boostRelatedMemories(scored: ScoredMemory[]): void {
    const byId = new Map(scored.map(s => [s.entry.id, s]));

    for (const item of scored) {
      if (item.score >= MIN_SCORE && item.entry.relatedMemories) {
        for (const relatedId of item.entry.relatedMemories) {
          const related = byId.get(relatedId);
          if (related) {
            related.score += item.score * 0.15;
          }
        }
      }
    }
  }

  private buildSections(scored: ScoredMemory[]): string[] {
    // Group by category
    const groups = new Map<MemoryCategory, ScoredMemory[]>();
    for (const s of scored) {
      const cat = s.entry.category;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(s);
    }

    const sections: string[] = [];
    let totalChars = 0;

    // Process categories in budget allocation order (highest allocation first)
    const orderedCategories = Object.entries(BUDGET_ALLOCATION)
      .sort(([, a], [, b]) => b - a)
      .map(([cat]) => cat as MemoryCategory);

    for (const category of orderedCategories) {
      const items = groups.get(category);
      if (!items || items.length === 0) continue;

      const budgetChars = MAX_CHARS * BUDGET_ALLOCATION[category];
      const header = SECTION_HEADERS[category] ?? `### ${category}`;
      const lines: string[] = [header];
      let sectionChars = header.length;

      for (const { entry } of items) {
        const line = this.formatLine(entry);
        if (sectionChars + line.length > budgetChars) break;
        if (totalChars + sectionChars + line.length > MAX_CHARS) break;
        lines.push(line);
        sectionChars += line.length;
      }

      if (lines.length > 1) {
        sections.push(lines.join('\n'));
        totalChars += sectionChars;
      }

      if (totalChars >= MAX_CHARS) break;
    }

    return sections;
  }

  private formatLine(entry: MemoryEntry): string {
    const meta: string[] = [];
    if (entry.category === 'fact' && entry.confidence >= 0.8) {
      meta.push('high confidence');
    }
    if (entry.category === 'relationship') {
      // Try to extract relationship type from tags or just show category
    }
    const suffix = meta.length > 0 ? ` (${meta.join(', ')})` : '';
    return `- ${entry.content}${suffix}`;
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
