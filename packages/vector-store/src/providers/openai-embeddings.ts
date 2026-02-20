import type { EmbeddingProvider } from '../types.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('vector-store:openai');

const MAX_BATCH_SIZE = 100;

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions: number;
  private readonly model: string;

  constructor(
    private readonly apiKey: string,
    model?: string,
  ) {
    this.model = model ?? 'text-embedding-3-small';
    this.dimensions = this.model === 'text-embedding-3-small' ? 1536 : 1536;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const results: number[][] = new Array(texts.length);

    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);

      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            input: batch,
            model: this.model,
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `OpenAI API error ${response.status}: ${body}`,
          );
        }

        const data = (await response.json()) as OpenAIEmbeddingResponse;

        for (const item of data.data) {
          results[i + item.index] = item.embedding;
        }

        logger.debug(`Batch ${i / MAX_BATCH_SIZE} embedded (${data.usage.total_tokens} tokens)`);
      } catch (err: unknown) {
        const wrapped: Error =
          err instanceof Error ? err : new Error(String(err));
        logger.error(`Failed to generate embeddings: ${wrapped.message}`);
        throw wrapped;
      }
    }

    return results;
  }
}
