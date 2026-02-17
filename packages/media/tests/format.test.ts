import { describe, it, expect } from 'vitest';
import { formatMediaResults } from '../src/format.js';
import type { MediaResult } from '../src/types.js';

describe('formatMediaResults', () => {
  it('should return user text unchanged when no results', () => {
    expect(formatMediaResults([], 'Hello')).toBe('Hello');
  });

  it('should format audio transcript', () => {
    const results: MediaResult[] = [
      { type: 'audio', success: true, text: 'Hello world' },
    ];
    expect(formatMediaResults(results, 'check this')).toBe(
      '[Audio]\nTranscript: Hello world\n\ncheck this'
    );
  });

  it('should format image description', () => {
    const results: MediaResult[] = [
      { type: 'image', success: true, text: 'A cat on a mat' },
    ];
    expect(formatMediaResults(results, '')).toBe('[Image]\nDescription: A cat on a mat');
  });

  it('should format file content with filename', () => {
    const results: MediaResult[] = [
      { type: 'file', success: true, text: 'col1,col2\na,b', filename: 'data.csv' },
    ];
    expect(formatMediaResults(results, 'analyze this')).toBe(
      '[File: data.csv]\nContent: col1,col2\na,b\n\nanalyze this'
    );
  });

  it('should format multiple results', () => {
    const results: MediaResult[] = [
      { type: 'audio', success: true, text: 'Voice note text' },
      { type: 'image', success: true, text: 'Photo of a dog' },
    ];
    const output = formatMediaResults(results, 'What do you think?');
    expect(output).toContain('[Audio]\nTranscript: Voice note text');
    expect(output).toContain('[Image]\nDescription: Photo of a dog');
    expect(output).toContain('What do you think?');
  });

  it('should skip failed results', () => {
    const results: MediaResult[] = [
      { type: 'audio', success: false, error: 'API error' },
      { type: 'image', success: true, text: 'A photo' },
    ];
    expect(formatMediaResults(results, 'test')).toBe('[Image]\nDescription: A photo\n\ntest');
  });

  it('should format video description', () => {
    const results: MediaResult[] = [
      { type: 'video', success: true, text: 'A person walking' },
    ];
    expect(formatMediaResults(results, '')).toBe('[Video]\nDescription: A person walking');
  });
});
