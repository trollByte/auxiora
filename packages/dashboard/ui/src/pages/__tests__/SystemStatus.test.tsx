// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { SystemStatus } from '../SystemStatus.js';

const mockFeatures = [
  { id: 'discord', name: 'Discord', category: 'channel', enabled: true, configured: true, active: true, settingsPath: '/settings/channels' },
  { id: 'telegram', name: 'Telegram', category: 'channel', enabled: true, configured: false, active: false, settingsPath: '/settings/channels' },
  { id: 'slack', name: 'Slack', category: 'channel', enabled: false, configured: false, active: false, settingsPath: '/settings/channels' },
  { id: 'plugins', name: 'Plugins', category: 'capability', enabled: true, configured: true, active: true, settingsPath: null },
  { id: 'voice', name: 'Voice', category: 'capability', enabled: false, configured: false, active: false, settingsPath: null },
];

vi.mock('../../api', () => ({
  getFeatureStatus: vi.fn(),
}));

import { getFeatureStatus } from '../../api.js';

beforeEach(() => {
  vi.clearAllMocks();
  (getFeatureStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ features: mockFeatures });
});

afterEach(() => {
  cleanup();
});

describe('SystemStatus', () => {
  it('renders three-tier layout', async () => {
    render(<SystemStatus />);
    await waitFor(() => {
      expect(screen.getByText(/Active/)).toBeTruthy();
      expect(screen.getByText(/Ready/)).toBeTruthy();
      expect(screen.getByText(/Available/)).toBeTruthy();
    });
  });

  it('shows active features with green indicators', async () => {
    render(<SystemStatus />);
    await waitFor(() => {
      expect(screen.getByText('Discord')).toBeTruthy();
      expect(screen.getByText('Plugins')).toBeTruthy();
    });

    // Active section should contain green dots
    const activeSection = screen.getByText(/Active/).closest('section')!;
    const greenDots = activeSection.querySelectorAll('.status-dot-green');
    expect(greenDots.length).toBe(2);
  });

  it('shows ready features with configure button', async () => {
    render(<SystemStatus />);
    await waitFor(() => {
      expect(screen.getByText('Telegram')).toBeTruthy();
    });

    const readySection = screen.getByText(/Ready/).closest('section')!;
    const configureBtn = readySection.querySelector('.status-configure-btn');
    expect(configureBtn).toBeTruthy();
    expect(configureBtn!.textContent).toBe('Configure');
  });

  it('shows available features with gray indicators', async () => {
    render(<SystemStatus />);
    await waitFor(() => {
      expect(screen.getByText('Slack')).toBeTruthy();
      expect(screen.getByText('Voice')).toBeTruthy();
    });

    const availableSection = screen.getByText(/Available/).closest('section')!;
    const grayDots = availableSection.querySelectorAll('.status-dot-gray');
    expect(grayDots.length).toBe(2);
  });

  it('shows loading state initially', () => {
    (getFeatureStatus as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<SystemStatus />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows error state on failure', async () => {
    (getFeatureStatus as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    render(<SystemStatus />);
    await waitFor(() => {
      expect(screen.getByText(/Error: Network error/)).toBeTruthy();
    });
  });
});
