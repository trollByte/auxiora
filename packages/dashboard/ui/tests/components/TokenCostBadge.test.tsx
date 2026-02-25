// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenCostBadge } from '../../src/components/TokenCostBadge.js';

describe('TokenCostBadge', () => {
  it('renders total token count', () => {
    render(<TokenCostBadge tokens={{ input: 150, output: 80 }} cost={{ input: 0.0015, output: 0.0024, total: 0.0039 }} latencyMs={320} />);
    expect(screen.getByText(/230/)).toBeTruthy();
  });

  it('renders cost with dollar sign', () => {
    render(<TokenCostBadge tokens={{ input: 150, output: 80 }} cost={{ input: 0.0015, output: 0.0024, total: 0.0039 }} latencyMs={320} />);
    expect(screen.getByText(/\$0\.004/)).toBeTruthy();
  });

  it('renders latency', () => {
    render(<TokenCostBadge tokens={{ input: 150, output: 80 }} cost={{ input: 0.0015, output: 0.0024, total: 0.0039 }} latencyMs={320} />);
    expect(screen.getByText(/320ms/)).toBeTruthy();
  });

  it('shows token breakdown in title attribute', () => {
    render(<TokenCostBadge tokens={{ input: 1000, output: 500 }} cost={{ input: 0.01, output: 0.015, total: 0.025 }} latencyMs={500} />);
    const tokenEl = screen.getByTitle(/1,000 in \/ 500 out/);
    expect(tokenEl).toBeTruthy();
  });

  it('returns null when tokens are zero', () => {
    const { container } = render(<TokenCostBadge tokens={{ input: 0, output: 0 }} cost={{ input: 0, output: 0, total: 0 }} latencyMs={0} />);
    expect(container.firstChild).toBeNull();
  });
});
