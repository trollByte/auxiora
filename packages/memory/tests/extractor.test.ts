import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryStore } from '../src/store.js';
import { MemoryExtractor } from '../src/extractor.js';
import type { AIProvider } from '../src/extractor.js';

let tmpDir: string;

function createMockProvider(response: string): AIProvider {
  return {
    complete: async () => ({ content: response }),
  };
}

describe('MemoryExtractor', () => {
  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `auxiora-extractor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should extract facts from AI response', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const provider = createMockProvider(JSON.stringify({
      facts: [
        { content: 'User works at Acme Corp', category: 'fact', importance: 0.8 },
        { content: 'User prefers dark mode', category: 'preference', importance: 0.6 },
      ],
      relationships: [],
      patterns: [],
      contradictions: [],
      personalitySignals: [],
    }));

    const extractor = new MemoryExtractor(store, provider);
    const result = await extractor.extract(
      'I work at Acme Corp and I love dark mode',
      'That sounds great!',
    );

    expect(result.factsExtracted).toHaveLength(2);
    expect(result.factsExtracted[0].content).toBe('User works at Acme Corp');
    expect(result.factsExtracted[0].importance).toBe(0.8);

    const all = await store.getAll();
    expect(all).toHaveLength(2);
  });

  it('should extract relationships', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const provider = createMockProvider(JSON.stringify({
      facts: [],
      relationships: [
        { content: 'Shared a joke about recursion', type: 'inside_joke' },
      ],
      patterns: [],
      contradictions: [],
      personalitySignals: [],
    }));

    const extractor = new MemoryExtractor(store, provider);
    const result = await extractor.extract(
      'That recursion joke was hilarious',
      'Ha, the classic "to understand recursion..."!',
    );

    expect(result.relationshipsFound).toHaveLength(1);
    expect(result.relationshipsFound[0].category).toBe('relationship');
  });

  it('should extract patterns', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const provider = createMockProvider(JSON.stringify({
      facts: [],
      relationships: [],
      patterns: [
        { pattern: 'User prefers concise responses', type: 'communication' },
      ],
      contradictions: [],
      personalitySignals: [],
    }));

    const extractor = new MemoryExtractor(store, provider);
    const result = await extractor.extract('Just the answer please', 'Sure: 42.');

    expect(result.patternsDetected).toHaveLength(1);
    expect(result.patternsDetected[0].category).toBe('pattern');
  });

  it('should extract personality signals', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const provider = createMockProvider(JSON.stringify({
      facts: [],
      relationships: [],
      patterns: [],
      contradictions: [],
      personalitySignals: [
        { trait: 'humor', direction: 'increase', reason: 'User made a joke' },
        { trait: 'formality', direction: 'decrease', reason: 'Casual tone' },
      ],
    }));

    const extractor = new MemoryExtractor(store, provider);
    const result = await extractor.extract('lol that was funny', 'Glad you liked it!');

    expect(result.personalitySignals).toHaveLength(2);
    expect(result.personalitySignals[0].trait).toBe('humor');
    expect(result.personalitySignals[0].adjustment).toBe(0.1);
    expect(result.personalitySignals[1].trait).toBe('formality');
    expect(result.personalitySignals[1].adjustment).toBe(-0.1);
  });

  it('should handle contradictions with update resolution', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    // Seed existing fact
    await store.add('User works at Acme Corp', 'fact', 'extracted');

    const provider = createMockProvider(JSON.stringify({
      facts: [],
      relationships: [],
      patterns: [],
      contradictions: [
        { existingFact: 'works at Acme Corp', newFact: 'User works at Globex now', resolution: 'update' },
      ],
      personalitySignals: [],
    }));

    const extractor = new MemoryExtractor(store, provider);
    const result = await extractor.extract(
      'I switched jobs, now at Globex',
      'Congrats on the new position!',
    );

    expect(result.contradictionsFound).toHaveLength(1);
    expect(result.contradictionsFound[0].resolution).toBe('update');

    // The existing fact should have been updated
    const all = await store.getAll();
    expect(all.some(m => m.content === 'User works at Globex now')).toBe(true);
  });

  it('should handle empty AI response gracefully', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const provider = createMockProvider(JSON.stringify({
      facts: [],
      relationships: [],
      patterns: [],
      contradictions: [],
      personalitySignals: [],
    }));

    const extractor = new MemoryExtractor(store, provider);
    const result = await extractor.extract('hello', 'Hi there!');

    expect(result.factsExtracted).toHaveLength(0);
    expect(result.patternsDetected).toHaveLength(0);
    expect(result.relationshipsFound).toHaveLength(0);
    expect(result.personalitySignals).toHaveLength(0);
  });

  it('should handle malformed AI response', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const provider = createMockProvider('not valid json at all');

    const extractor = new MemoryExtractor(store, provider);
    const result = await extractor.extract('hello', 'Hi!');

    expect(result.factsExtracted).toHaveLength(0);
    expect(result.patternsDetected).toHaveLength(0);
  });

  it('should handle AI provider error gracefully', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const provider: AIProvider = {
      complete: async () => { throw new Error('API down'); },
    };

    const extractor = new MemoryExtractor(store, provider);
    const result = await extractor.extract('hello', 'Hi!');

    expect(result.factsExtracted).toHaveLength(0);
  });

  it('should strip markdown code fences from response', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const json = JSON.stringify({
      facts: [{ content: 'User likes TypeScript', category: 'preference', importance: 0.7 }],
      relationships: [],
      patterns: [],
      contradictions: [],
      personalitySignals: [],
    });
    const provider = createMockProvider('```json\n' + json + '\n```');

    const extractor = new MemoryExtractor(store, provider);
    const result = await extractor.extract('I love TypeScript', 'Me too!');

    expect(result.factsExtracted).toHaveLength(1);
  });

  it('should clamp importance to 0-1', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const provider = createMockProvider(JSON.stringify({
      facts: [
        { content: 'High importance fact', category: 'fact', importance: 5.0 },
        { content: 'Negative importance fact', category: 'fact', importance: -2.0 },
      ],
      relationships: [],
      patterns: [],
      contradictions: [],
      personalitySignals: [],
    }));

    const extractor = new MemoryExtractor(store, provider);
    const result = await extractor.extract('test', 'test');

    expect(result.factsExtracted[0].importance).toBe(1.0);
    expect(result.factsExtracted[1].importance).toBe(0);
  });

  it('should skip entries with missing content', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const provider = createMockProvider(JSON.stringify({
      facts: [
        { content: '', category: 'fact', importance: 0.5 },
        { content: 'Valid fact', category: 'fact', importance: 0.5 },
      ],
      relationships: [{ content: '', type: 'inside_joke' }],
      patterns: [{ pattern: '', type: 'communication' }],
      contradictions: [],
      personalitySignals: [{ trait: '', direction: 'increase', reason: 'test' }],
    }));

    const extractor = new MemoryExtractor(store, provider);
    const result = await extractor.extract('test', 'test');

    expect(result.factsExtracted).toHaveLength(1);
    expect(result.relationshipsFound).toHaveLength(0);
    expect(result.patternsDetected).toHaveLength(0);
    expect(result.personalitySignals).toHaveLength(0);
  });
});
