import { getLogger } from '@auxiora/logger';
import type { MemoryEntry, MemoryCategory } from './types.js';

const logger = getLogger('memory:export');

export interface PersonalizationExport {
  /** Export format version */
  version: '1.0';
  /** When the export was created */
  exportedAt: number;
  /** Summary stats */
  summary: ExportSummary;
  /** Memories grouped by category */
  memories: Record<MemoryCategory, MemoryEntry[]>;
  /** Metadata about the export */
  metadata: {
    totalEntries: number;
    categories: string[];
    partitions: string[];
    dateRange: { earliest: number; latest: number };
  };
}

export interface ExportSummary {
  totalMemories: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  averageImportance: number;
  averageConfidence: number;
  topTags: Array<{ tag: string; count: number }>;
}

export interface ExportOptions {
  /** Filter by categories. Default: all */
  categories?: MemoryCategory[];
  /** Filter by partition. Default: all */
  partitionId?: string;
  /** Minimum importance to include. Default: 0 */
  minImportance?: number;
  /** Whether to include provenance data. Default: true */
  includeProvenance?: boolean;
  /** Redact content to just tags (privacy mode). Default: false */
  redactContent?: boolean;
}

export class PersonalizationExporter {
  /**
   * Export memories to a portable JSON structure.
   */
  export(memories: MemoryEntry[], options?: ExportOptions): PersonalizationExport {
    let filtered = [...memories];

    // Apply filters
    if (options?.categories) {
      const cats = new Set(options.categories);
      filtered = filtered.filter(m => cats.has(m.category));
    }

    if (options?.partitionId) {
      filtered = filtered.filter(m => (m.partitionId ?? 'global') === options.partitionId);
    }

    if (options?.minImportance !== undefined) {
      filtered = filtered.filter(m => m.importance >= options.minImportance!);
    }

    // Optionally strip provenance
    if (options?.includeProvenance === false) {
      filtered = filtered.map(m => {
        const { provenance, ...rest } = m;
        return rest as MemoryEntry;
      });
    }

    // Optionally redact content
    if (options?.redactContent) {
      filtered = filtered.map(m => ({
        ...m,
        content: `[redacted: ${m.tags.join(', ')}]`,
      }));
    }

    // Group by category
    const grouped: Record<string, MemoryEntry[]> = {};
    for (const mem of filtered) {
      if (!grouped[mem.category]) grouped[mem.category] = [];
      grouped[mem.category].push(mem);
    }

    // Build summary
    const summary = this.buildSummary(filtered);

    // Build metadata
    const partitions = [...new Set(filtered.map(m => m.partitionId ?? 'global'))];
    const timestamps = filtered.map(m => m.createdAt);

    logger.info('Personalization data exported', {
      totalEntries: filtered.length,
      categories: Object.keys(grouped).length,
    });

    return {
      version: '1.0',
      exportedAt: Date.now(),
      summary,
      memories: grouped as Record<MemoryCategory, MemoryEntry[]>,
      metadata: {
        totalEntries: filtered.length,
        categories: Object.keys(grouped),
        partitions,
        dateRange: {
          earliest: timestamps.length > 0 ? Math.min(...timestamps) : 0,
          latest: timestamps.length > 0 ? Math.max(...timestamps) : 0,
        },
      },
    };
  }

  private buildSummary(memories: MemoryEntry[]): ExportSummary {
    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const tagCounts = new Map<string, number>();
    let totalImportance = 0;
    let totalConfidence = 0;

    for (const mem of memories) {
      byCategory[mem.category] = (byCategory[mem.category] ?? 0) + 1;
      bySource[mem.source] = (bySource[mem.source] ?? 0) + 1;
      totalImportance += mem.importance;
      totalConfidence += mem.confidence;
      for (const tag of mem.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    const topTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return {
      totalMemories: memories.length,
      byCategory,
      bySource,
      averageImportance: memories.length > 0 ? totalImportance / memories.length : 0,
      averageConfidence: memories.length > 0 ? totalConfidence / memories.length : 0,
      topTags,
    };
  }
}
