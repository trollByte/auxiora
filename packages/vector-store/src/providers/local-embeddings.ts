import type { EmbeddingProvider } from '../types.js';
import { normalize } from '../math.js';

const DEFAULT_DIMS = 128;

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local';
  readonly dimensions: number;

  constructor(dims?: number) {
    this.dimensions = dims ?? DEFAULT_DIMS;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embedSingle(text));
  }

  private embedSingle(text: string): number[] {
    const tokens = this.tokenize(text);
    const vector = new Array<number>(this.dimensions).fill(0);

    // Token frequency map
    const freq = new Map<string, number>();
    for (const token of tokens) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }

    // Hash each token to a dimension and accumulate TF weight
    for (const [token, count] of freq) {
      const tf = count / tokens.length;
      const hash = this.hashToken(token);
      const dim = Math.abs(hash) % this.dimensions;
      // Use sign of secondary hash to allow negative contributions
      const sign = this.hashToken(token + '_sign') > 0 ? 1 : -1;
      vector[dim] += tf * sign;
    }

    return normalize(vector);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  private hashToken(token: string): number {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return hash;
  }
}
