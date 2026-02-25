// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ProviderHealth } from '../../src/components/ProviderHealth.js';

vi.mock('../../src/api.js', () => ({
  api: {
    getModels: vi.fn().mockResolvedValue({
      providers: [
        {
          name: 'anthropic',
          displayName: 'Anthropic',
          models: {
            'claude-3.5-sonnet': { maxContextTokens: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015, supportsVision: true, supportsTools: true, supportsStreaming: true, supportsImageGen: false, isLocal: false, strengths: ['reasoning'] },
          },
        },
        {
          name: 'openai',
          displayName: 'OpenAI',
          models: {
            'gpt-4o': { maxContextTokens: 128000, costPer1kInput: 0.005, costPer1kOutput: 0.015, supportsVision: true, supportsTools: true, supportsStreaming: true, supportsImageGen: false, isLocal: false, strengths: ['general'] },
          },
        },
      ],
      routing: { enabled: true, primary: 'anthropic', fallback: 'openai' },
      cost: { today: 0.42, thisMonth: 12.80, budgetRemaining: 87.20, isOverBudget: false, warningThresholdReached: false },
    }),
    getHealthState: vi.fn().mockResolvedValue({
      data: {
        overall: 'healthy',
        subsystems: [
          { name: 'providers', status: 'healthy', details: 'Primary available' },
        ],
        issues: [],
        lastCheck: new Date().toISOString(),
      },
    }),
  },
}));

describe('ProviderHealth', () => {
  it('renders provider names', async () => {
    render(<ProviderHealth />);
    await waitFor(() => expect(screen.getByText('Anthropic')).toBeTruthy());
    expect(screen.getByText('OpenAI')).toBeTruthy();
  });

  it('shows primary badge on primary provider', async () => {
    render(<ProviderHealth />);
    await waitFor(() => expect(screen.getByText('Primary')).toBeTruthy());
  });

  it('shows fallback badge on fallback provider', async () => {
    render(<ProviderHealth />);
    await waitFor(() => expect(screen.getByText('Fallback')).toBeTruthy());
  });

  it('renders cost summary', async () => {
    render(<ProviderHealth />);
    await waitFor(() => expect(screen.getByText(/\$0\.42/)).toBeTruthy());
    expect(screen.getByText(/\$12\.80/)).toBeTruthy();
  });

  it('shows healthy status', async () => {
    render(<ProviderHealth />);
    await waitFor(() => expect(screen.getByText(/healthy/i)).toBeTruthy());
  });
});
