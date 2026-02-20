import type { VectorEntry, VectorStoreOptions, SimilarityResult } from './types.js';
import { cosineSimilarity } from './math.js';

const DEFAULT_MAX_ENTRIES = 10_000;

export class VectorStore {
  private entries: Map<string, VectorEntry> = new Map();

  constructor(private options: VectorStoreOptions) {}

  add(
    id: string,
    vector: number[],
    content: string,
    metadata: Record<string, unknown> = {},
  ): VectorEntry {
    this.validateDimensions(vector);

    const maxEntries = this.options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    if (this.entries.size >= maxEntries && !this.entries.has(id)) {
      throw new Error(
        `Vector store is full (max ${maxEntries} entries)`,
      );
    }

    const entry: VectorEntry = {
      id,
      vector,
      content,
      metadata,
      createdAt: Date.now(),
    };
    this.entries.set(id, entry);
    return entry;
  }

  search(
    queryVector: number[],
    limit = 10,
    minScore = 0,
  ): SimilarityResult[] {
    this.validateDimensions(queryVector);

    const results: SimilarityResult[] = [];
    for (const entry of this.entries.values()) {
      const score = cosineSimilarity(queryVector, entry.vector);
      if (score >= minScore) {
        results.push({ entry, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  get(id: string): VectorEntry | undefined {
    return this.entries.get(id);
  }

  remove(id: string): boolean {
    return this.entries.delete(id);
  }

  update(
    id: string,
    vector: number[],
    content?: string,
    metadata?: Record<string, unknown>,
  ): VectorEntry {
    this.validateDimensions(vector);

    const existing = this.entries.get(id);
    if (!existing) {
      throw new Error(`Entry with id "${id}" not found`);
    }

    const updated: VectorEntry = {
      ...existing,
      vector,
      content: content ?? existing.content,
      metadata: metadata ?? existing.metadata,
    };
    this.entries.set(id, updated);
    return updated;
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  toJSON(): string {
    const data = {
      options: this.options,
      entries: Array.from(this.entries.values()),
    };
    return JSON.stringify(data);
  }

  static fromJSON(json: string, options: VectorStoreOptions): VectorStore {
    const data = JSON.parse(json) as {
      entries: VectorEntry[];
    };
    const store = new VectorStore(options);
    for (const entry of data.entries) {
      store.entries.set(entry.id, entry);
    }
    return store;
  }

  private validateDimensions(vector: number[]): void {
    if (vector.length !== this.options.dimensions) {
      throw new Error(
        `Expected vector of ${this.options.dimensions} dimensions, got ${vector.length}`,
      );
    }
  }
}
