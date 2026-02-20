import { describe, it, expect } from 'vitest';
import { LocalEmbeddingProvider } from '../src/providers/local-embeddings.js';
import { cosineSimilarity, magnitude } from '../src/math.js';

describe('LocalEmbeddingProvider', () => {
  const provider = new LocalEmbeddingProvider(64);

  it('should have correct name and dimensions', () => {
    expect(provider.name).toBe('local');
    expect(provider.dimensions).toBe(64);
  });

  it('should generate embeddings of correct dimensions', async () => {
    const [vec] = await provider.embed(['hello world']);
    expect(vec).toHaveLength(64);
  });

  it('should return normalized vectors', async () => {
    const [vec] = await provider.embed(['this is a test sentence']);
    expect(magnitude(vec)).toBeCloseTo(1, 5);
  });

  it('should return deterministic output', async () => {
    const [a] = await provider.embed(['deterministic test']);
    const [b] = await provider.embed(['deterministic test']);
    expect(a).toEqual(b);
  });

  it('should embed multiple texts at once', async () => {
    const results = await provider.embed(['hello', 'world', 'test']);
    expect(results).toHaveLength(3);
    results.forEach((vec) => expect(vec).toHaveLength(64));
  });

  it('should produce similar vectors for similar texts', async () => {
    const [a] = await provider.embed(['the cat sat on the mat']);
    const [b] = await provider.embed(['the cat sat on the rug']);
    const [c] = await provider.embed(['quantum physics experiment results']);

    const simAB = cosineSimilarity(a, b);
    const simAC = cosineSimilarity(a, c);
    expect(simAB).toBeGreaterThan(simAC);
  });

  it('should return empty array for empty input', async () => {
    const results = await provider.embed([]);
    expect(results).toEqual([]);
  });

  it('should use default dimensions of 128', () => {
    const defaultProvider = new LocalEmbeddingProvider();
    expect(defaultProvider.dimensions).toBe(128);
  });
});
