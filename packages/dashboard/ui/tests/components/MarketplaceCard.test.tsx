// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarketplaceCard } from '../../src/components/MarketplaceCard.js';
import type { MarketplaceItem } from '../../src/components/MarketplaceCard.js';

function makeItem(overrides: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return {
    name: 'smart-assistant',
    version: '1.2.3',
    description: 'A helpful plugin for daily tasks',
    author: 'Jane Doe',
    downloads: 12345,
    rating: 4.5,
    keywords: ['assistant', 'productivity'],
    ...overrides,
  };
}

const noop = () => {};

describe('MarketplaceCard', () => {
  it('renders plugin name and author', () => {
    const item = makeItem({ name: 'my-plugin', author: 'Alice' });
    render(<MarketplaceCard item={item} onSelect={noop} onInstall={noop} />);

    expect(screen.getByText('my-plugin')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('renders download count formatted with commas', () => {
    const item = makeItem({ downloads: 1234567 });
    render(<MarketplaceCard item={item} onSelect={noop} onInstall={noop} />);

    // toLocaleString() produces comma-separated output in en-US
    expect(screen.getByText(/1,234,567/)).toBeTruthy();
  });

  it('calls onSelect when card clicked', async () => {
    const onSelect = vi.fn();
    const item = makeItem();
    render(<MarketplaceCard item={item} onSelect={onSelect} onInstall={noop} />);

    const card = screen.getByText(item.name).closest('.marketplace-card')!;
    await userEvent.click(card);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it('calls onInstall when install button clicked without triggering onSelect', async () => {
    const onSelect = vi.fn();
    const onInstall = vi.fn();
    const item = makeItem();
    render(<MarketplaceCard item={item} onSelect={onSelect} onInstall={onInstall} />);

    const installBtn = screen.getByRole('button', { name: 'Install' });
    await userEvent.click(installBtn);

    expect(onInstall).toHaveBeenCalledOnce();
    expect(onInstall).toHaveBeenCalledWith(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders version with v prefix', () => {
    const item = makeItem({ version: '2.0.0' });
    render(<MarketplaceCard item={item} onSelect={noop} onInstall={noop} />);

    expect(screen.getByText('v2.0.0')).toBeTruthy();
  });

  it('renders star rating with correct title', () => {
    const item = makeItem({ rating: 3.5 });
    render(<MarketplaceCard item={item} onSelect={noop} onInstall={noop} />);

    expect(screen.getByTitle('3.5 / 5')).toBeTruthy();
  });
});
