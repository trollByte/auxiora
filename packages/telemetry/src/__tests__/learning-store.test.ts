import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LearningStore } from '../learning-store.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('LearningStore', () => {
  let store: LearningStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `learning-test-${Date.now()}.db`);
    store = new LearningStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it('extracts learnings from output with markers', () => {
    const output = `
      Did some work.
      Note: Always validate input before processing.
      More output here.
      Warning: The API rate-limits after 100 requests per minute.
      Pattern: Use retry with exponential backoff for transient failures.
    `;
    const count = store.extractAndStore(output, 'job-1', 'build');
    expect(count).toBe(3);
  });

  it('retrieves stored learnings', () => {
    store.extractAndStore('Note: Cache responses to reduce latency.', 'job-1', 'build');
    const learnings = store.getAll();
    expect(learnings).toHaveLength(1);
    expect(learnings[0].content).toBe('Cache responses to reduce latency.');
    expect(learnings[0].category).toBe('note');
    expect(learnings[0].jobType).toBe('build');
  });

  it('deduplicates identical learnings', () => {
    store.extractAndStore('Note: Always validate input.', 'job-1', 'build');
    store.extractAndStore('Note: Always validate input.', 'job-2', 'build');
    const learnings = store.getAll();
    expect(learnings).toHaveLength(1);
    expect(learnings[0].occurrences).toBe(2);
  });

  it('retrieves by category', () => {
    store.extractAndStore(
      'Warning: API may timeout. Pattern: Use circuit breaker.',
      'job-1',
      'api',
    );
    const warnings = store.getByCategory('warning');
    expect(warnings).toHaveLength(1);
    const patterns = store.getByCategory('pattern');
    expect(patterns).toHaveLength(1);
  });

  it('retrieves recent learnings with limit', () => {
    for (let i = 0; i < 10; i++) {
      store.extractAndStore(`Note: Learning number ${i}.`, `job-${i}`, 'build');
    }
    const recent = store.getRecent(5);
    expect(recent).toHaveLength(5);
  });

  it('returns empty array when no learnings exist', () => {
    expect(store.getAll()).toHaveLength(0);
    expect(store.getRecent(10)).toHaveLength(0);
  });

  it('handles output with no markers gracefully', () => {
    const count = store.extractAndStore(
      'Just regular output with no markers.',
      'job-1',
      'build',
    );
    expect(count).toBe(0);
    expect(store.getAll()).toHaveLength(0);
  });
});
