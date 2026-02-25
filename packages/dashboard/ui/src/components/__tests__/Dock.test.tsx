// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dock, type DockItem } from '../Dock.js';

const items: DockItem[] = [
  { id: 'chat', label: 'Chat', icon: '\u{1F4AC}' },
  { id: 'overview', label: 'Mission Control', icon: '\u{1F3AF}' },
  { id: 'settings', label: 'Settings', icon: '\u2699\uFE0F' },
];

function makeProps(overrides: Partial<{ items: DockItem[]; openWindows: Set<string>; onOpen: (id: string) => void }> = {}) {
  return {
    items,
    openWindows: new Set<string>(),
    onOpen: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dock', () => {
  it('renders all dock icons', () => {
    render(<Dock {...makeProps()} />);
    for (const item of items) {
      expect(screen.getByLabelText(`Open ${item.label}`)).toBeTruthy();
    }
  });

  it('shows tooltip text for each icon', () => {
    render(<Dock {...makeProps()} />);
    for (const item of items) {
      expect(screen.getByText(item.label)).toBeTruthy();
    }
  });

  it('calls onOpen with item id when icon clicked', async () => {
    const onOpen = vi.fn();
    render(<Dock {...makeProps({ onOpen })} />);
    await userEvent.click(screen.getByLabelText('Open Chat'));
    expect(onOpen).toHaveBeenCalledWith('chat');
  });

  it('shows active dot when window is open', () => {
    const { container } = render(
      <Dock {...makeProps({ openWindows: new Set(['chat']) })} />,
    );
    const dots = container.querySelectorAll('.dock-icon-dot.active');
    expect(dots.length).toBe(1);
  });

  it('does not show active dot for closed windows', () => {
    const { container } = render(
      <Dock {...makeProps({ openWindows: new Set<string>() })} />,
    );
    const dots = container.querySelectorAll('.dock-icon-dot.active');
    expect(dots.length).toBe(0);
  });

  it('renders correct icon emoji', () => {
    render(<Dock {...makeProps()} />);
    expect(screen.getByText('\u{1F4AC}')).toBeTruthy();
  });
});
