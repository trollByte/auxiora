import { describe, it, expect, beforeEach } from 'vitest';
import { SourceAttributor, type AttributionSource } from '../src/source-attribution.js';

describe('SourceAttributor', () => {
  let attributor: SourceAttributor;

  beforeEach(() => {
    attributor = new SourceAttributor();
  });

  it('attributes a fully generated response with no sources', () => {
    const result = attributor.attribute('Hello, how can I help?', []);

    expect(result.fullResponse).toBe('Hello, how can I help?');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].attribution.sourceType).toBe('model_generation');
    expect(result.segments[0].content).toBe('Hello, how can I help?');
  });

  it('attributes response with a matching memory source', () => {
    const sources: AttributionSource[] = [{
      type: 'memory',
      label: 'User preference',
      content: 'likes dark mode',
      reference: 'mem-123',
      confidence: 0.9,
    }];

    const result = attributor.attribute('You mentioned you likes dark mode in the past.', sources);

    const memorySegment = result.segments.find(s => s.attribution.sourceType === 'memory');
    expect(memorySegment).toBeDefined();
    expect(memorySegment!.attribution.label).toBe('User preference');
    expect(memorySegment!.attribution.reference).toBe('mem-123');
    expect(memorySegment!.attribution.confidence).toBe(0.9);
  });

  it('attributes response with web search source', () => {
    const sources: AttributionSource[] = [{
      type: 'web_search',
      label: 'Search result',
      content: 'TypeScript 5.4 was released in March 2024',
      reference: 'https://example.com/ts',
      confidence: 0.85,
    }];

    const result = attributor.attribute(
      'According to sources, TypeScript 5.4 was released in March 2024 with new features.',
      sources,
    );

    const webSegment = result.segments.find(s => s.attribution.sourceType === 'web_search');
    expect(webSegment).toBeDefined();
    expect(webSegment!.attribution.confidence).toBe(0.85);
    expect(webSegment!.attribution.reference).toBe('https://example.com/ts');
  });

  it('handles multiple source matches', () => {
    const sources: AttributionSource[] = [
      {
        type: 'memory',
        label: 'User info',
        content: 'your name is Alice',
        reference: 'mem-1',
      },
      {
        type: 'tool_output',
        label: 'Weather tool',
        content: 'sunny and 72 degrees',
        reference: 'weather-tool',
      },
    ];

    const result = attributor.attribute(
      'Hello! your name is Alice and the weather is sunny and 72 degrees today.',
      sources,
    );

    const memorySegment = result.segments.find(s => s.attribution.sourceType === 'memory');
    const toolSegment = result.segments.find(s => s.attribution.sourceType === 'tool_output');
    expect(memorySegment).toBeDefined();
    expect(toolSegment).toBeDefined();
  });

  it('remaining text is attributed as model_generation', () => {
    const sources: AttributionSource[] = [{
      type: 'memory',
      label: 'Stored fact',
      content: 'likes pizza',
      reference: 'mem-5',
    }];

    const result = attributor.attribute('I know you likes pizza so here is a recipe.', sources);

    const generatedSegments = result.segments.filter(s => s.attribution.sourceType === 'model_generation');
    expect(generatedSegments.length).toBeGreaterThan(0);

    // The part after the match should be model_generation
    const lastSegment = result.segments[result.segments.length - 1];
    expect(lastSegment.attribution.sourceType).toBe('model_generation');
    expect(lastSegment.content).toContain('recipe');
  });

  it('sourcesSummary counts sources by type', () => {
    const sources: AttributionSource[] = [
      { type: 'memory', label: 'Fact 1', content: 'fact one' },
      { type: 'memory', label: 'Fact 2', content: 'fact two' },
      { type: 'web_search', label: 'Result', content: 'search result' },
    ];

    const result = attributor.attribute(
      'Here is fact one and also fact two plus search result for you.',
      sources,
    );

    expect(result.sourcesSummary['memory']).toBe(2);
    expect(result.sourcesSummary['web_search']).toBe(1);
  });

  it('overallConfidence is average of segment confidences', () => {
    const sources: AttributionSource[] = [{
      type: 'memory',
      label: 'Fact',
      content: 'known fact',
      confidence: 0.9,
    }];

    const result = attributor.attribute('Here is a known fact for you.', sources);

    // Should have model_generation (0.5) and memory (0.9) segments, possibly more model_generation
    const expectedAvg = result.segments.reduce((sum, s) => sum + s.attribution.confidence, 0) / result.segments.length;
    expect(result.overallConfidence).toBeCloseTo(expectedAvg);
  });

  it('attributeGenerated returns simple attribution', () => {
    const result = attributor.attributeGenerated('Pure AI response here.');

    expect(result.fullResponse).toBe('Pure AI response here.');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].attribution.sourceType).toBe('model_generation');
    expect(result.segments[0].attribution.label).toBe('AI generated');
    expect(result.segments[0].attribution.confidence).toBe(0.5);
    expect(result.overallConfidence).toBe(0.5);
    expect(result.sourcesSummary['model_generation']).toBe(1);
  });

  it('case-insensitive matching works', () => {
    const sources: AttributionSource[] = [{
      type: 'user_data',
      label: 'Profile',
      content: 'John Smith',
      reference: 'user-1',
    }];

    const result = attributor.attribute('Welcome back, john smith!', sources);

    const userSegment = result.segments.find(s => s.attribution.sourceType === 'user_data');
    expect(userSegment).toBeDefined();
    expect(userSegment!.attribution.label).toBe('Profile');
  });

  it('partial match for long sources works', () => {
    const longContent = 'This is a very long source content that exceeds fifty characters in total length and keeps going on and on.';
    const sources: AttributionSource[] = [{
      type: 'knowledge_graph',
      label: 'Encyclopedia',
      content: longContent,
      reference: 'kg-42',
      confidence: 0.75,
    }];

    // Response contains only the first part of the source
    const result = attributor.attribute(
      'According to the encyclopedia: This is a very long source content that exceeds fifty characters in total length.',
      sources,
    );

    const kgSegment = result.segments.find(s => s.attribution.sourceType === 'knowledge_graph');
    expect(kgSegment).toBeDefined();
    expect(kgSegment!.attribution.confidence).toBe(0.75);
  });

  it('no match returns full response as model_generation', () => {
    const sources: AttributionSource[] = [{
      type: 'web_search',
      label: 'Unrelated search',
      content: 'completely unrelated content xyz123',
      reference: 'url-99',
    }];

    const result = attributor.attribute('This response has nothing to do with the source.', sources);

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].attribution.sourceType).toBe('model_generation');
    expect(result.segments[0].content).toBe('This response has nothing to do with the source.');
  });
});
