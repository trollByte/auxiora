import { describe, it, expect } from 'vitest';
import { CitationTracker } from '../src/citation.js';

describe('CitationTracker', () => {
  it('addSource creates source with ID', () => {
    const tracker = new CitationTracker();
    const source = tracker.addSource('https://example.com/article', 'Test Article');
    expect(source.id).toBeDefined();
    expect(source.title).toBe('Test Article');
    expect(source.url).toBe('https://example.com/article');
  });

  it('addSource extracts domain', () => {
    const tracker = new CitationTracker();
    const source = tracker.addSource('https://www.example.com/article', 'Test');
    expect(source.domain).toBe('example.com');
  });

  it('addFinding links to source', () => {
    const tracker = new CitationTracker();
    const source = tracker.addSource('https://example.com', 'Source');
    const finding = tracker.addFinding('Important fact', source.id);
    expect(finding.sourceId).toBe(source.id);
    expect(finding.content).toBe('Important fact');
  });

  it('getFindings filters by sourceId', () => {
    const tracker = new CitationTracker();
    const s1 = tracker.addSource('https://a.com', 'A');
    const s2 = tracker.addSource('https://b.com', 'B');
    tracker.addFinding('Fact 1', s1.id);
    tracker.addFinding('Fact 2', s2.id);
    tracker.addFinding('Fact 3', s1.id);

    const filtered = tracker.getFindings(s1.id);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((f) => f.sourceId === s1.id)).toBe(true);
  });

  it('formatCitations inline format', () => {
    const tracker = new CitationTracker();
    tracker.addSource('https://example.com/page', 'Example Page', 0.8);
    const output = tracker.formatCitations('inline');
    expect(output).toContain('[1]');
    expect(output).toContain('Example Page');
    expect(output).toContain('example.com');
  });

  it('formatCitations bibliography format', () => {
    const tracker = new CitationTracker();
    tracker.addSource('https://example.com/page', 'Example Page', 0.8);
    const output = tracker.formatCitations('bibliography');
    expect(output).toContain('Example Page');
    expect(output).toContain('Credibility: 0.80');
  });

  it('getSources returns all', () => {
    const tracker = new CitationTracker();
    tracker.addSource('https://a.com', 'A');
    tracker.addSource('https://b.com', 'B');
    expect(tracker.getSources()).toHaveLength(2);
  });

  it('clear empties everything', () => {
    const tracker = new CitationTracker();
    tracker.addSource('https://a.com', 'A');
    tracker.addFinding('fact', 'some-id');
    tracker.clear();
    expect(tracker.getSources()).toHaveLength(0);
    expect(tracker.getFindings()).toHaveLength(0);
  });
});
