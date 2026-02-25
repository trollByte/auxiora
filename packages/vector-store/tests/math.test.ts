import { describe, it, expect } from 'vitest';
import { cosineSimilarity, dotProduct, magnitude, normalize } from '../src/math.js';

describe('dotProduct', () => {
  it('should compute dot product of two vectors', () => {
    expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(dotProduct([1, 0], [0, 1])).toBe(0);
  });

  it('should return 0 for zero vector', () => {
    expect(dotProduct([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe('magnitude', () => {
  it('should compute magnitude of a vector', () => {
    expect(magnitude([3, 4])).toBe(5);
  });

  it('should return 0 for zero vector', () => {
    expect(magnitude([0, 0, 0])).toBe(0);
  });

  it('should compute magnitude of unit vector', () => {
    expect(magnitude([1, 0, 0])).toBe(1);
  });
});

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('should return -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('should return 0 when a vector is zero', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it('should be scale-invariant', () => {
    const sim1 = cosineSimilarity([1, 2, 3], [4, 5, 6]);
    const sim2 = cosineSimilarity([2, 4, 6], [8, 10, 12]);
    expect(sim1).toBeCloseTo(sim2);
  });
});

describe('normalize', () => {
  it('should produce a unit vector', () => {
    const result = normalize([3, 4]);
    expect(magnitude(result)).toBeCloseTo(1);
  });

  it('should preserve direction', () => {
    const result = normalize([3, 4]);
    expect(result[0]).toBeCloseTo(0.6);
    expect(result[1]).toBeCloseTo(0.8);
  });

  it('should return zero vector for zero input', () => {
    const result = normalize([0, 0, 0]);
    expect(result).toEqual([0, 0, 0]);
  });
});
