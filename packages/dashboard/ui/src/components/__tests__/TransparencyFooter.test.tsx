// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransparencyFooter } from '../TransparencyFooter.js';

const baseMeta = {
  confidence: {
    level: 'high' as const,
    score: 0.87,
    factors: [
      { signal: 'tool_grounded', impact: 'positive' as const, detail: 'Response grounded in 1 tool result(s)' },
      { signal: 'clean_finish', impact: 'positive' as const, detail: 'Model completed response normally' },
    ],
  },
  sources: [
    { type: 'tool_result' as const, label: 'Tool: web_search', confidence: 0.95 },
    { type: 'model_generation' as const, label: 'Synthesized from above sources', confidence: 0.7 },
  ],
  model: {
    provider: 'anthropic',
    model: 'claude-3.5-sonnet',
    tokens: { input: 156, output: 278 },
    cost: { input: 0.0012, output: 0.0028, total: 0.004 },
    finishReason: 'stop',
    latencyMs: 1247,
  },
  personality: {
    domain: 'code_engineering',
    emotionalRegister: 'neutral',
    activeTraits: [{ name: 'precise', weight: 0.82 }, { name: 'thorough', weight: 0.74 }],
  },
  trace: {
    enrichmentStages: ['memory', 'mode', 'architect', 'self-awareness', 'model-identity'],
    toolsUsed: ['web_search'],
    processingMs: 1500,
  },
};

describe('TransparencyFooter', () => {
  it('renders collapsed summary line', () => {
    render(<TransparencyFooter meta={baseMeta} />);
    expect(screen.getByText(/High/)).toBeDefined();
    expect(screen.getByText(/0\.87/)).toBeDefined();
    expect(screen.getByText(/claude-3\.5-sonnet/)).toBeDefined();
    expect(screen.getByText(/434/)).toBeDefined(); // 156 + 278 tokens
    expect(screen.getByText(/\$0\.004/)).toBeDefined();
  });

  it('expands on click to show details', () => {
    render(<TransparencyFooter meta={baseMeta} />);
    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);
    expect(screen.getByText(/tool_grounded/)).toBeDefined();
    expect(screen.getByText(/clean_finish/)).toBeDefined();
    expect(screen.getAllByText(/web_search/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/anthropic/).length).toBeGreaterThan(0);
  });

  it('shows knowledge boundary warning when present', () => {
    const metaWithKB = {
      ...baseMeta,
      confidence: { ...baseMeta.confidence, level: 'low' as const, score: 0.35 },
      personality: {
        ...baseMeta.personality,
        knowledgeBoundary: { topic: 'kubernetes networking', corrections: 2 },
      },
    };
    render(<TransparencyFooter meta={metaWithKB} />);
    expect(screen.getByText(/corrected/i)).toBeDefined();
  });

  it('renders nothing when meta is undefined', () => {
    const { container } = render(<TransparencyFooter meta={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('uses correct CSS class for each confidence level', () => {
    for (const level of ['high', 'medium', 'low'] as const) {
      const meta = { ...baseMeta, confidence: { ...baseMeta.confidence, level, score: 0.5 } };
      const { container, unmount } = render(<TransparencyFooter meta={meta} />);
      expect(container.querySelector(`.confidence-${level}`)).toBeTruthy();
      unmount();
    }
  });
});
