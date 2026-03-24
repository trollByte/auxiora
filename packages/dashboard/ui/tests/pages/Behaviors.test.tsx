// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Behaviors } from '../../src/pages/Behaviors.js';

const mockGetBehaviors = vi.fn();
const mockCreateBehavior = vi.fn();
const mockPatchBehavior = vi.fn();

vi.mock('../../src/api.js', () => ({
  api: {
    getBehaviors: (...args: any[]) => mockGetBehaviors(...args),
    createBehavior: (...args: any[]) => mockCreateBehavior(...args),
    patchBehavior: (...args: any[]) => mockPatchBehavior(...args),
    deleteBehavior: vi.fn(),
  },
}));

vi.mock('../../src/hooks/usePolling.js', () => ({
  usePolling: vi.fn(),
}));

describe('Behaviors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBehaviors.mockResolvedValue({
      data: [
        {
          id: 'bh-one-shot',
          type: 'one-shot',
          status: 'active',
          action: 'Check in with me',
          delay: { fireAt: '2026-07-04T12:00:00.000Z' },
          runCount: 1,
          failCount: 0,
        },
      ],
    });
    mockCreateBehavior.mockResolvedValue({ data: { id: 'bh-new' } });
    mockPatchBehavior.mockResolvedValue({ data: { id: 'bh-one-shot' } });
  });

  it('creates a one-shot behavior with runAt payload', async () => {
    const { container } = render(<Behaviors />);
    await screen.findByText('Check in with me');

    fireEvent.click(screen.getByText('New Behavior'));

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'one-shot' } });
    fireEvent.change(screen.getByPlaceholderText('What should the agent do?'), { target: { value: 'Remind me later' } });

    const runAtInput = container.querySelector('input[type="datetime-local"]');
    expect(runAtInput).toBeTruthy();
    fireEvent.change(runAtInput!, { target: { value: '2026-08-01T09:45' } });

    fireEvent.click(screen.getByText('Create Behavior'));

    await waitFor(() => {
      expect(mockCreateBehavior).toHaveBeenCalledWith({
        type: 'one-shot',
        action: 'Remind me later',
        runAt: '2026-08-01T09:45',
      });
    });
  });

  it('hydrates the one-shot edit form from delay.fireAt', async () => {
    const { container } = render(<Behaviors />);
    await screen.findByText('Check in with me');

    fireEvent.click(screen.getByText('Edit'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Check in with me')).toBeTruthy();
      const runAtInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement | null;
      expect(runAtInput?.value).toBe('2026-07-04T12:00');
    });
  });
});
