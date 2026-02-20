import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../src/context-builder.js';
import { DocumentStore } from '../src/document-store.js';

describe('ContextBuilder', () => {
  const builder = new ContextBuilder();

  function createPopulatedStore(): DocumentStore {
    const store = new DocumentStore();
    store.ingest(
      'TypeScript Guide',
      'TypeScript is a typed superset of JavaScript. It compiles to plain JavaScript. TypeScript adds optional static types.',
      'text',
    );
    store.ingest(
      'Python Guide',
      'Python is a high-level programming language. Python emphasizes code readability. Python supports multiple paradigms.',
      'text',
    );
    store.ingest(
      'Cooking Recipes',
      'Pasta recipes are easy to follow. Boil water and add pasta. Season with salt and pepper.',
      'text',
    );
    return store;
  }

  describe('buildContext', () => {
    it('should build context string from search results', () => {
      const store = createPopulatedStore();
      const context = builder.buildContext('TypeScript JavaScript', store);
      expect(context).toContain('TypeScript Guide');
      expect(context.length).toBeGreaterThan(0);
    });

    it('should respect maxTokens', () => {
      const store = createPopulatedStore();
      const context = builder.buildContext('programming language', store, {
        maxTokens: 10,
      });
      // Should be limited
      expect(context.length).toBeLessThan(200);
    });

    it('should return empty string for no results', () => {
      const store = new DocumentStore();
      const context = builder.buildContext('anything', store);
      expect(context).toBe('');
    });
  });

  describe('formatCitation', () => {
    it('should format a citation from a search result', () => {
      const store = createPopulatedStore();
      const results = store.search('TypeScript');
      if (results.length > 0) {
        const citation = builder.formatCitation(results[0]!);
        expect(citation).toContain('TypeScript Guide');
        expect(citation).toContain('chunk #');
      }
    });
  });
});
