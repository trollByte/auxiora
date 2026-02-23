// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DeadLetterMonitor } from '../../src/components/DeadLetterMonitor.js';

vi.mock('../../src/api.js', () => ({
  api: {
    getJobStats: vi.fn().mockResolvedValue({ pending: 2, running: 1, completed24h: 10, failed24h: 3, dead: 2 }),
    getJobList: vi.fn().mockResolvedValue({
      data: [
        { id: 'j1', type: 'behavior', status: 'dead', payload: { behaviorId: 'b1' }, result: 'timeout', attempt: 3, maxAttempts: 3, createdAt: Date.now() - 3600000, updatedAt: Date.now() },
        { id: 'j2', type: 'ambient-flush', status: 'dead', payload: {}, result: 'handler error', attempt: 3, maxAttempts: 3, createdAt: Date.now() - 7200000, updatedAt: Date.now() },
      ],
    }),
    retryJob: vi.fn().mockResolvedValue({ data: { originalId: 'j1', newJobId: 'j3' } }),
  },
}));

describe('DeadLetterMonitor', () => {
  it('renders stats summary', async () => {
    render(<DeadLetterMonitor />);
    await waitFor(() => expect(screen.getByText(/2 dead/i)).toBeTruthy());
    expect(screen.getByText(/3 failed/i)).toBeTruthy();
  });

  it('renders dead job list', async () => {
    render(<DeadLetterMonitor />);
    await waitFor(() => expect(screen.getByText('behavior')).toBeTruthy());
    expect(screen.getByText('ambient-flush')).toBeTruthy();
  });

  it('shows error reason for dead jobs', async () => {
    render(<DeadLetterMonitor />);
    await waitFor(() => expect(screen.getByText('timeout')).toBeTruthy());
  });

  it('calls retryJob on retry button click', async () => {
    const { api } = await import('../../src/api.js');
    render(<DeadLetterMonitor />);
    await waitFor(() => screen.getByText('behavior'));
    const retryBtns = screen.getAllByText('Retry');
    fireEvent.click(retryBtns[0]);
    expect(api.retryJob).toHaveBeenCalledWith('j1');
  });
});
