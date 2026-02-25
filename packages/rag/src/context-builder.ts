import type { DocumentStore } from './document-store.js';
import type { SearchResult } from './types.js';

export class ContextBuilder {
  buildContext(
    query: string,
    store: DocumentStore,
    opts?: { maxTokens?: number; maxChunks?: number },
  ): string {
    const maxTokens = opts?.maxTokens ?? 2000;
    const maxChunks = opts?.maxChunks ?? 10;

    const results = store.search(query, { limit: maxChunks });

    const parts: string[] = [];
    let usedTokens = 0;

    for (const result of results) {
      const chunkTokens = result.chunk.tokens;
      if (usedTokens + chunkTokens > maxTokens) break;

      parts.push(`[Source: ${result.document.title}]\n${result.chunk.content}\n---`);
      usedTokens += chunkTokens;
    }

    return parts.join('\n');
  }

  formatCitation(result: SearchResult): string {
    return `[${result.document.title}, chunk #${result.chunk.index}]`;
  }
}
