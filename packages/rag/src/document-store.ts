import crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { DocumentChunker } from './chunker.js';
import type {
  Document,
  DocumentChunk,
  DocumentType,
  SearchOptions,
  SearchResult,
} from './types.js';

const log = getLogger('rag:document-store');

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'she',
  'that', 'the', 'to', 'was', 'were', 'will', 'with', 'this', 'but',
  'they', 'have', 'had', 'what', 'when', 'where', 'who', 'which',
  'not', 'no', 'do', 'does', 'did', 'if', 'so', 'we', 'you', 'i',
  'me', 'my', 'can', 'could', 'would', 'should', 'may', 'might',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

export class DocumentStore {
  private documents = new Map<string, Document>();
  private chunks = new Map<string, DocumentChunk[]>();
  private index = new Map<string, Set<string>>();
  private chunker = new DocumentChunker();

  ingest(
    title: string,
    content: string,
    type: DocumentType,
    metadata?: Record<string, unknown>,
  ): Document {
    const now = Date.now();
    const doc: Document = {
      id: crypto.randomUUID(),
      title,
      type,
      content,
      metadata: metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    this.documents.set(doc.id, doc);

    const rawChunks = this.chunker.chunk(content);
    const docChunks: DocumentChunk[] = rawChunks.map((text, i) => ({
      id: crypto.randomUUID(),
      documentId: doc.id,
      content: text,
      index: i,
      metadata: {},
      tokens: this.chunker.estimateTokens(text),
    }));

    this.chunks.set(doc.id, docChunks);
    this.buildIndex(docChunks);

    log.info(`Ingested document "${title}" (${docChunks.length} chunks)`);
    return doc;
  }

  search(query: string, options?: SearchOptions): SearchResult[] {
    const limit = options?.limit ?? 10;
    const minScore = options?.minScore ?? 0;
    const queryTerms = tokenize(query);

    if (queryTerms.length === 0) return [];

    const chunkScores = new Map<string, number>();
    const totalChunks = this.countTotalChunks();

    for (const term of queryTerms) {
      const chunkIds = this.index.get(term);
      if (!chunkIds) continue;

      const idf = Math.log(1 + totalChunks / chunkIds.size);

      for (const chunkId of chunkIds) {
        const prev = chunkScores.get(chunkId) ?? 0;
        chunkScores.set(chunkId, prev + idf);
      }
    }

    let maxScore = 0;
    for (const score of chunkScores.values()) {
      if (score > maxScore) maxScore = score;
    }

    const results: SearchResult[] = [];
    for (const [chunkId, rawScore] of chunkScores) {
      const score = maxScore > 0 ? rawScore / maxScore : 0;
      if (score < minScore) continue;

      const chunk = this.findChunkById(chunkId);
      if (!chunk) continue;

      const doc = this.documents.get(chunk.documentId);
      if (!doc) continue;

      if (options?.documentIds && !options.documentIds.includes(doc.id)) continue;
      if (options?.type && doc.type !== options.type) continue;

      results.push({ chunk, score, document: doc });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  getDocument(id: string): Document | undefined {
    return this.documents.get(id);
  }

  getChunks(documentId: string): DocumentChunk[] {
    return this.chunks.get(documentId) ?? [];
  }

  removeDocument(id: string): void {
    const docChunks = this.chunks.get(id);
    if (docChunks) {
      for (const chunk of docChunks) {
        this.removeFromIndex(chunk);
      }
    }
    this.chunks.delete(id);
    this.documents.delete(id);
    log.info(`Removed document ${id}`);
  }

  listDocuments(): Document[] {
    return [...this.documents.values()];
  }

  stats(): { documentCount: number; chunkCount: number; totalTokens: number } {
    let chunkCount = 0;
    let totalTokens = 0;

    for (const docChunks of this.chunks.values()) {
      chunkCount += docChunks.length;
      for (const chunk of docChunks) {
        totalTokens += chunk.tokens;
      }
    }

    return {
      documentCount: this.documents.size,
      chunkCount,
      totalTokens,
    };
  }

  private buildIndex(docChunks: DocumentChunk[]): void {
    for (const chunk of docChunks) {
      const terms = tokenize(chunk.content);
      for (const term of terms) {
        let set = this.index.get(term);
        if (!set) {
          set = new Set();
          this.index.set(term, set);
        }
        set.add(chunk.id);
      }
    }
  }

  private removeFromIndex(chunk: DocumentChunk): void {
    const terms = tokenize(chunk.content);
    for (const term of terms) {
      const set = this.index.get(term);
      if (set) {
        set.delete(chunk.id);
        if (set.size === 0) {
          this.index.delete(term);
        }
      }
    }
  }

  private findChunkById(chunkId: string): DocumentChunk | undefined {
    for (const docChunks of this.chunks.values()) {
      for (const chunk of docChunks) {
        if (chunk.id === chunkId) return chunk;
      }
    }
    return undefined;
  }

  private countTotalChunks(): number {
    let total = 0;
    for (const docChunks of this.chunks.values()) {
      total += docChunks.length;
    }
    return total;
  }
}
