// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SetupPreferences } from '../../src/pages/SetupPreferences.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../src/api.js', () => ({
  api: {
    updateArchitectPreference: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe('SetupPreferences', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders preference questions', () => {
    render(<SetupPreferences />);
    expect(screen.getByText(/response style/i)).toBeTruthy();
    expect(screen.getByText(/communication tone/i)).toBeTruthy();
  });

  it('renders radio options for each question', () => {
    render(<SetupPreferences />);
    expect(screen.getByText('Concise')).toBeTruthy();
    expect(screen.getByText('Detailed')).toBeTruthy();
  });

  it('navigates on submit', async () => {
    render(<SetupPreferences />);
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/setup/personality'));
  });

  it('has a skip button', () => {
    render(<SetupPreferences />);
    expect(screen.getByText('Skip')).toBeTruthy();
  });

  it('navigates on skip', () => {
    render(<SetupPreferences />);
    fireEvent.click(screen.getByText('Skip'));
    expect(mockNavigate).toHaveBeenCalledWith('/setup/personality');
  });
});
