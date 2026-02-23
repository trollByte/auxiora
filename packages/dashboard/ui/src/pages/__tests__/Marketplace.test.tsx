// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Marketplace } from '../Marketplace.js';

vi.mock('../../api', () => ({
  api: {
    searchPlugins: vi.fn().mockResolvedValue({ plugins: [], total: 0 }),
    searchPersonalities: vi.fn().mockResolvedValue({ personalities: [], total: 0 }),
    installPlugin: vi.fn().mockResolvedValue({ success: true }),
    installPersonality: vi.fn().mockResolvedValue({ success: true }),
  },
}));

// Re-import the mocked api so we can inspect calls
import { api } from '../../api.js';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('Marketplace', () => {
  it('renders both tabs', async () => {
    render(<Marketplace />);
    expect(screen.getByText('Plugins')).toBeTruthy();
    expect(screen.getByText('Personalities')).toBeTruthy();
  });

  it('renders search input', async () => {
    render(<Marketplace />);
    expect(screen.getByPlaceholderText('Search...')).toBeTruthy();
  });

  it('renders sort dropdown with options', async () => {
    render(<Marketplace />);
    const select = screen.getByDisplayValue('Downloads');
    expect(select).toBeTruthy();
    expect(screen.getByText('Rating')).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Recently Updated')).toBeTruthy();
  });

  it('defaults to plugins tab with active class', async () => {
    render(<Marketplace />);
    const pluginsTab = screen.getByText('Plugins');
    expect(pluginsTab.className).toContain('active');
    const personalitiesTab = screen.getByText('Personalities');
    expect(personalitiesTab.className).not.toContain('active');
  });

  it('searches plugins on mount', async () => {
    render(<Marketplace />);
    await waitFor(() => {
      expect(api.searchPlugins).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'downloads', limit: 18, offset: 0 }),
      );
    });
  });

  it('switches to personalities tab and searches', async () => {
    const user = userEvent.setup();
    render(<Marketplace />);

    await waitFor(() => {
      expect(api.searchPlugins).toHaveBeenCalled();
    });

    vi.clearAllMocks();

    await user.click(screen.getByText('Personalities'));

    await waitFor(() => {
      expect(api.searchPersonalities).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'downloads', limit: 18, offset: 0 }),
      );
    });

    const personalitiesTab = screen.getByText('Personalities');
    expect(personalitiesTab.className).toContain('active');
  });

  it('shows empty state when no results', async () => {
    render(<Marketplace />);
    await waitFor(() => {
      expect(screen.getByText('No results found.')).toBeTruthy();
    });
  });

  it('renders cards when plugins are returned', async () => {
    const mockPlugins = [
      { name: 'test-plugin', version: '1.0.0', description: 'A test plugin', author: 'tester', downloads: 100, rating: 4.5 },
    ];
    vi.mocked(api.searchPlugins).mockResolvedValueOnce({ plugins: mockPlugins, total: 1 });

    render(<Marketplace />);

    await waitFor(() => {
      expect(screen.getByText('test-plugin')).toBeTruthy();
    });
  });

  it('updates search query and resets offset', async () => {
    const user = userEvent.setup();
    render(<Marketplace />);

    await waitFor(() => {
      expect(api.searchPlugins).toHaveBeenCalled();
    });

    vi.clearAllMocks();

    const input = screen.getByPlaceholderText('Search...');
    await user.type(input, 'hello');

    await waitFor(() => {
      expect(api.searchPlugins).toHaveBeenCalledWith(
        expect.objectContaining({ q: expect.stringContaining('h') }),
      );
    });
  });
});
