import { describe, it, expect, beforeEach } from 'vitest';
import { ContextBuilder } from '../src/context-builder.js';
import { DocumentStore } from '../src/document-store.js';
import type { SearchResult } from '../src/types.js';

describe('ContextBuilder', () => {
  let builder: ContextBuilder;
  let store: DocumentStore;

  beforeEach(() => {
    builder = new ContextBuilder();
    store = new DocumentStore();
  });

  describe('buildContext', () => {
    it('assembles context from search results', () => {
      store.ingest('Guide', 'TypeScript compiler handles type checking compilation.', 'text');
      const context = builder.buildContext('TypeScript compiler', store);
      expect(context).toContain('[Source: Guide]');
      expect(context).toContain('TypeScript');
      expect(context).toContain('---');
    });

    it('returns empty string when no results match', () => {
      store.ingest('Test', 'Hello world.', 'text');
      const context = builder.buildContext('xyznonexistent', store);
      expect(context).toBe('');
    });

    it('respects maxTokens budget', () => {
      for (let i = 0; i < 10; i++) {
        store.ingest(
          `Doc ${i}`,
          `Programming language features concepts number ${i} with extra filler words.`,
          'text',
        );
      }

      const context = builder.buildContext('programming language', store, {
        maxTokens: 50,
      });

      const sourceCount = (context.match(/\[Source:/g) || []).length;
      expect(sourceCount).toBeLessThan(10);
    });

    it('respects maxChunks limit', () => {
      for (let i = 0; i < 10; i++) {
        store.ingest(
          `Doc ${i}`,
          `Unique programming content number ${i}.`,
          'text',
        );
      }

      const context = builder.buildContext('programming', store, {
        maxChunks: 2,
        maxTokens: 10000,
      });

      const sourceCount = (context.match(/\[Source:/g) || []).length;
      expect(sourceCount).toBeLessThanOrEqual(2);
    });

    it('formats with source headers and separators', () => {
      store.ingest('My Document', 'Relevant search content here.', 'text');
      const context = builder.buildContext('relevant search content', store);
      expect(context).toMatch(/\[Source: My Document\]/);
      expect(context).toContain('---');
    });
  });

  describe('formatCitation', () => {
    it('formats citation with document title and chunk index', () => {
      const result: SearchResult = {
        chunk: {
          id: 'chunk-1',
          documentId: 'doc-1',
          content: 'Some content',
          index: 3,
          metadata: {},
          tokens: 10,
        },
        score: 0.85,
        document: {
          id: 'doc-1',
          title: 'My Guide',
          type: 'text',
          content: 'Full content',
          metadata: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      expect(builder.formatCitation(result)).toBe('[My Guide, chunk #3]');
    });
  });
});
