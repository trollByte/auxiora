import { describe, it, expect } from 'vitest';
import { DocumentStore } from '../src/document-store.js';

describe('DocumentStore', () => {
  describe('ingest', () => {
    it('should ingest a document and return it', () => {
      const store = new DocumentStore();
      const doc = store.ingest('Test Doc', 'Hello world content.', 'text');
      expect(doc.id).toBeTruthy();
      expect(doc.title).toBe('Test Doc');
      expect(doc.type).toBe('text');
    });

    it('should accept metadata', () => {
      const store = new DocumentStore();
      const doc = store.ingest('Doc', 'content', 'text', { author: 'test' });
      expect(doc.metadata).toEqual({ author: 'test' });
    });

    it('should create chunks on ingest', () => {
      const store = new DocumentStore();
      const doc = store.ingest('Doc', 'Some content here.', 'text');
      const chunks = store.getChunks(doc.id);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0]!.documentId).toBe(doc.id);
    });
  });

  describe('getDocument', () => {
    it('should retrieve an ingested document', () => {
      const store = new DocumentStore();
      const doc = store.ingest('My Doc', 'Some content here.', 'text');
      const retrieved = store.getDocument(doc.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.title).toBe('My Doc');
    });

    it('should return undefined for unknown id', () => {
      const store = new DocumentStore();
      expect(store.getDocument('nonexistent')).toBeUndefined();
    });
  });

  describe('getChunks', () => {
    it('should return chunks for a document', () => {
      const store = new DocumentStore();
      const doc = store.ingest('Doc', 'Content for chunking.', 'text');
      const chunks = store.getChunks(doc.id);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0]!.content).toBeTruthy();
    });

    it('should return empty array for unknown document', () => {
      const store = new DocumentStore();
      expect(store.getChunks('nonexistent')).toEqual([]);
    });
  });

  describe('listDocuments', () => {
    it('should list all documents', () => {
      const store = new DocumentStore();
      store.ingest('Doc 1', 'First document.', 'text');
      store.ingest('Doc 2', 'Second document.', 'markdown');
      const list = store.listDocuments();
      expect(list).toHaveLength(2);
      expect(list.map((d) => d.title)).toContain('Doc 1');
      expect(list.map((d) => d.title)).toContain('Doc 2');
    });
  });

  describe('removeDocument', () => {
    it('should remove a document and its chunks', () => {
      const store = new DocumentStore();
      const doc = store.ingest('To Remove', 'Content here.', 'text');
      store.removeDocument(doc.id);
      expect(store.getDocument(doc.id)).toBeUndefined();
      expect(store.stats().chunkCount).toBe(0);
    });
  });

  describe('stats', () => {
    it('should return accurate stats', () => {
      const store = new DocumentStore();
      store.ingest('Doc', 'Some content.', 'text');
      const stats = store.stats();
      expect(stats.documentCount).toBe(1);
      expect(stats.chunkCount).toBeGreaterThanOrEqual(1);
      expect(stats.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('search', () => {
    it('should find relevant chunks by keyword', () => {
      const store = new DocumentStore();
      store.ingest(
        'TypeScript Guide',
        'TypeScript is a typed superset of JavaScript. It compiles to plain JavaScript.',
        'text',
      );
      store.ingest(
        'Cooking Recipes',
        'Pasta recipes are easy to follow. Boil water and add pasta.',
        'text',
      );
      const results = store.search('TypeScript JavaScript');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.document.title).toBe('TypeScript Guide');
    });

    it('should return empty for stopword-only queries', () => {
      const store = new DocumentStore();
      store.ingest('Doc', 'Some content.', 'text');
      const results = store.search('the and or');
      expect(results).toHaveLength(0);
    });

    it('should return empty for empty store', () => {
      const store = new DocumentStore();
      const results = store.search('anything');
      expect(results).toHaveLength(0);
    });

    it('should respect limit option', () => {
      const store = new DocumentStore();
      store.ingest('Doc 1', 'Programming language features and tools.', 'text');
      store.ingest('Doc 2', 'Programming paradigms and language design.', 'text');
      const results = store.search('programming language', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should filter by documentIds', () => {
      const store = new DocumentStore();
      const doc1 = store.ingest('Doc A', 'Database query optimization techniques.', 'text');
      store.ingest('Doc B', 'Database indexing and query performance.', 'text');
      const results = store.search('database query', {
        documentIds: [doc1.id],
      });
      for (const r of results) {
        expect(r.document.id).toBe(doc1.id);
      }
    });

    it('should filter by type', () => {
      const store = new DocumentStore();
      store.ingest('MD Doc', '# Database\n\nQuery optimization', 'markdown');
      store.ingest('Text Doc', 'Database query optimization', 'text');
      const results = store.search('database query', { type: 'markdown' });
      for (const r of results) {
        expect(r.document.type).toBe('markdown');
      }
    });

    it('should rank results by relevance', () => {
      const store = new DocumentStore();
      store.ingest(
        'Focused',
        'Machine learning algorithms include neural networks and deep learning models.',
        'text',
      );
      store.ingest(
        'Tangential',
        'Cooking with fresh ingredients makes better meals. Try new recipes daily.',
        'text',
      );
      const results = store.search('machine learning neural networks');
      if (results.length >= 1) {
        expect(results[0]!.document.title).toBe('Focused');
      }
    });

    it('should boost rarer terms via IDF', () => {
      const store = new DocumentStore();
      store.ingest('Rust', 'Rust programming language provides memory safety guarantees.', 'text');
      store.ingest('General', 'Programming languages come in many varieties and paradigms.', 'text');
      const results = store.search('rust programming');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.document.title).toBe('Rust');
    });
  });
});
