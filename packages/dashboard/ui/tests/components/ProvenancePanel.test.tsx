// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProvenancePanel } from '../../src/components/ProvenancePanel.js';

const mockMeta = {
  confidence: {
    level: 'high' as const,
    score: 0.87,
    factors: [
      { signal: 'tool_grounded', impact: 'positive' as const, detail: 'Response grounded in tool results' },
      { signal: 'low_coverage', impact: 'negative' as const, detail: 'Limited source coverage' },
    ],
  },
  sources: [
    { type: 'tool_result', label: 'web_search', confidence: 0.95 },
    { type: 'model_generation', label: 'Synthesized', confidence: 0.7 },
  ],
  model: {
    provider: 'anthropic', model: 'claude-3.5-sonnet',
    tokens: { input: 200, output: 350 },
    cost: { input: 0.002, output: 0.004, total: 0.006 },
    finishReason: 'stop', latencyMs: 1500,
  },
  personality: {
    domain: 'code_engineering', emotionalRegister: 'neutral',
    activeTraits: [{ name: 'precise', weight: 0.82 }],
  },
  trace: {
    enrichmentStages: ['memory', 'mode', 'architect', 'self-awareness', 'model-identity'],
    toolsUsed: ['web_search'],
    processingMs: 1800,
  },
};

describe('ProvenancePanel', () => {
  it('renders confidence score and factors', () => {
    render(<ProvenancePanel meta={mockMeta} onClose={() => {}} />);
    expect(screen.getByText(/0\.87/)).toBeDefined();
    expect(screen.getByText(/tool_grounded/)).toBeDefined();
    expect(screen.getByText(/low_coverage/)).toBeDefined();
  });

  it('renders source attributions', () => {
    render(<ProvenancePanel meta={mockMeta} onClose={() => {}} />);
    expect(screen.getAllByText(/web_search/).length).toBeGreaterThan(0);
  });

  it('renders enrichment pipeline stages', () => {
    render(<ProvenancePanel meta={mockMeta} onClose={() => {}} />);
    expect(screen.getByText(/memory/)).toBeDefined();
    expect(screen.getByText(/architect/)).toBeDefined();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ProvenancePanel meta={mockMeta} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
