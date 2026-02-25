// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarketplaceDetail } from '../../src/components/MarketplaceDetail.js';
import type { DetailItem } from '../../src/components/MarketplaceDetail.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<DetailItem> = {}): DetailItem {
  return {
    name: 'test-personality',
    version: '1.2.3',
    description: 'A helpful test personality',
    author: 'tester',
    downloads: 4200,
    rating: 4.5,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MarketplaceDetail', () => {
  it('renders full detail info (name, version, author, license, permissions)', () => {
    const item = makeItem({
      license: 'MIT',
      permissions: ['network', 'filesystem'],
      keywords: ['ai', 'assistant'],
    });

    render(
      <MarketplaceDetail
        item={item}
        onClose={() => {}}
        onInstall={() => {}}
      />,
    );

    expect(screen.getByText('test-personality')).toBeTruthy();
    expect(screen.getByText('v1.2.3')).toBeTruthy();
    expect(screen.getByText('by tester')).toBeTruthy();
    expect(screen.getByText('A helpful test personality')).toBeTruthy();
    expect(screen.getByText(/MIT/)).toBeTruthy();
    expect(screen.getByText(/network, filesystem/)).toBeTruthy();
    expect(screen.getByText(/ai, assistant/)).toBeTruthy();
    expect(screen.getByText(/4,200 downloads/)).toBeTruthy();
    expect(screen.getByText(/4\.5/)).toBeTruthy();
  });

  it('calls onClose when Close is clicked', async () => {
    const onClose = vi.fn();

    render(
      <MarketplaceDetail
        item={makeItem()}
        onClose={onClose}
        onInstall={() => {}}
      />,
    );

    await userEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onInstall with item when Install is clicked', async () => {
    const onInstall = vi.fn();
    const item = makeItem();

    render(
      <MarketplaceDetail
        item={item}
        onClose={() => {}}
        onInstall={onInstall}
      />,
    );

    await userEvent.click(screen.getByText('Install'));
    expect(onInstall).toHaveBeenCalledOnce();
    expect(onInstall).toHaveBeenCalledWith(item);
  });

  it('shows personality-specific fields (preview, tone) when present', () => {
    const item = makeItem({
      preview: 'Hello! I am a friendly assistant.',
      tone: { warmth: 8, humor: 5, formality: 3 },
    });

    render(
      <MarketplaceDetail
        item={item}
        onClose={() => {}}
        onInstall={() => {}}
      />,
    );

    expect(screen.getByText('Hello! I am a friendly assistant.')).toBeTruthy();
    expect(screen.getByText('Warmth: 8')).toBeTruthy();
    expect(screen.getByText('Humor: 5')).toBeTruthy();
    expect(screen.getByText('Formality: 3')).toBeTruthy();
  });

  it('hides preview and tone sections when not provided', () => {
    const { container } = render(
      <MarketplaceDetail
        item={makeItem()}
        onClose={() => {}}
        onInstall={() => {}}
      />,
    );

    expect(container.querySelector('.marketplace-detail-preview')).toBeNull();
    expect(container.querySelector('.marketplace-detail-tone')).toBeNull();
  });
});
