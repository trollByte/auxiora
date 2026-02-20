export interface VectorEntry {
  id: string;
  vector: number[];
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface SimilarityResult {
  entry: VectorEntry;
  score: number; // 0-1 cosine similarity
}

export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface VectorStoreOptions {
  dimensions: number;
  maxEntries?: number; // default 10_000
}
