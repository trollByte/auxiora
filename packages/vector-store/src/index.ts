export type {
  VectorEntry,
  SimilarityResult,
  EmbeddingProvider,
  VectorStoreOptions,
} from './types.js';

export { cosineSimilarity, dotProduct, magnitude, normalize } from './math.js';
export { VectorStore } from './vector-store.js';
export { SqliteVecStore } from './sqlite-vec-store.js';
export type { SqliteVecStoreOptions } from './sqlite-vec-store.js';
export { OpenAIEmbeddingProvider } from './providers/openai-embeddings.js';
export { LocalEmbeddingProvider } from './providers/local-embeddings.js';
