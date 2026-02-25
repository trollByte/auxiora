// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { UserProfile } from '../../src/pages/UserProfile.js';

const mockGetUserModel = vi.fn();

vi.mock('../../src/api.js', () => ({
  api: {
    getUserModel: (...args: any[]) => mockGetUserModel(...args),
  },
}));

const SAMPLE_MODEL = {
  synthesizedAt: 1708800000000,
  topDomains: [
    { domain: 'typescript', count: 42, share: 0.65, satisfactionRate: 0.9, feedbackCount: 10 },
    { domain: 'devops', count: 12, share: 0.2, satisfactionRate: null, feedbackCount: 0 },
  ],
  communicationStyle: {
    verbosityPreference: 0.7,
    warmthPreference: 0.5,
    humorPreference: 0.3,
    verbosityLabel: 'detailed',
    toneLabel: 'warm',
  },
  satisfaction: {
    overallTrend: 'improving',
    strongDomains: ['typescript'],
    weakDomains: ['css'],
    totalFeedback: 15,
  },
  activeDecisions: [
    { id: 'd1', summary: 'Use ESM everywhere', rationale: 'consistency', tags: ['arch'], createdAt: 1708700000000 },
  ],
  dueFollowUps: [
    { id: 'f1', summary: 'Check migration status', rationale: 'pending', tags: ['migration'], createdAt: 1708700000000, followUpDate: Date.now() - 86400000 },
  ],
  preferenceConflicts: [],
  correctionSummary: {
    totalCorrections: 5,
    topPatterns: [{ from: 'python', to: 'typescript', count: 3 }],
  },
  totalInteractions: 128,
  firstUsed: 1706000000000,
  lastUsed: 1708800000000,
  narrative: 'You are a TypeScript enthusiast who values clean architecture.',
};

describe('UserProfile', () => {
  beforeEach(() => {
    mockGetUserModel.mockReset();
  });

  it('renders loading state initially', () => {
    mockGetUserModel.mockReturnValue(new Promise(() => {}));
    render(<UserProfile />);
    expect(screen.getByText('Loading user profile...')).toBeTruthy();
  });

  it('renders narrative and domain cards after data loads', async () => {
    mockGetUserModel.mockResolvedValue(SAMPLE_MODEL);
    render(<UserProfile />);
    await waitFor(() => expect(screen.getByText(SAMPLE_MODEL.narrative)).toBeTruthy());
    expect(screen.getAllByText('typescript').length).toBeGreaterThan(0);
    expect(screen.getByText('devops')).toBeTruthy();
    expect(screen.getByText('65%')).toBeTruthy();
  });

  it('renders "Not enough data" message on 404 error', async () => {
    mockGetUserModel.mockRejectedValue(new Error('User model not available'));
    render(<UserProfile />);
    await waitFor(() => expect(screen.getByText(/Not enough data yet/)).toBeTruthy());
  });

  it('refresh button re-fetches data', async () => {
    mockGetUserModel.mockResolvedValue(SAMPLE_MODEL);
    render(<UserProfile />);
    await waitFor(() => screen.getByText(SAMPLE_MODEL.narrative));
    expect(mockGetUserModel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => expect(mockGetUserModel).toHaveBeenCalledTimes(2));
  });
});
