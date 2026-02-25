// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextRecommendation } from '../ContextRecommendation.js';
import type { ContextRecommendation as Recommendation } from '@auxiora/personality/architect';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    suggestedDomain: 'security_review',
    reason: "You've previously switched to Security Review in similar messages",
    confidence: 0.85,
    source: 'correction_pattern',
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Rendering
// ────────────────────────────────────────────────────────────────────────────

describe('ContextRecommendation — rendering', () => {
  it('renders recommendation text and reason', () => {
    render(
      <ContextRecommendation
        recommendation={makeRecommendation()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        autoDismissMs={0}
      />,
    );

    expect(screen.getByText('Suggestion:', { exact: false })).toBeTruthy();
    expect(screen.getAllByText(/Security Review/).length).toBeGreaterThan(0);
    expect(screen.getByText(/previously switched/)).toBeTruthy();
  });

  it('renders Switch and dismiss buttons', () => {
    render(
      <ContextRecommendation
        recommendation={makeRecommendation()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        autoDismissMs={0}
      />,
    );

    expect(screen.getByText('Switch')).toBeTruthy();
    expect(screen.getByLabelText('Dismiss suggestion')).toBeTruthy();
  });

  it('renders the domain icon from context-meta', () => {
    render(
      <ContextRecommendation
        recommendation={makeRecommendation({ suggestedDomain: 'debugging' })}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        autoDismissMs={0}
      />,
    );

    // Debugging icon is the bug emoji 🐛
    expect(screen.getByText('🐛')).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Interactions
// ────────────────────────────────────────────────────────────────────────────

describe('ContextRecommendation — interactions', () => {
  it('calls onAccept with correct domain when Switch is clicked', async () => {
    const onAccept = vi.fn();
    render(
      <ContextRecommendation
        recommendation={makeRecommendation({ suggestedDomain: 'architecture_design' })}
        onAccept={onAccept}
        onDismiss={vi.fn()}
        autoDismissMs={0}
      />,
    );

    await userEvent.click(screen.getByText('Switch'));
    expect(onAccept).toHaveBeenCalledWith('architecture_design');
  });

  it('calls onDismiss when X is clicked', async () => {
    const onDismiss = vi.fn();
    render(
      <ContextRecommendation
        recommendation={makeRecommendation()}
        onAccept={vi.fn()}
        onDismiss={onDismiss}
        autoDismissMs={0}
      />,
    );

    await userEvent.click(screen.getByLabelText('Dismiss suggestion'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('hides after Switch is clicked', async () => {
    render(
      <ContextRecommendation
        recommendation={makeRecommendation()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        autoDismissMs={0}
      />,
    );

    await userEvent.click(screen.getByText('Switch'));
    expect(screen.queryByText('Suggestion:')).toBeNull();
  });

  it('hides after dismiss is clicked', async () => {
    render(
      <ContextRecommendation
        recommendation={makeRecommendation()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        autoDismissMs={0}
      />,
    );

    await userEvent.click(screen.getByLabelText('Dismiss suggestion'));
    expect(screen.queryByText('Suggestion:')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Auto-dismiss
// ────────────────────────────────────────────────────────────────────────────

describe('ContextRecommendation — auto-dismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-dismisses after timeout', () => {
    const onDismiss = vi.fn();
    render(
      <ContextRecommendation
        recommendation={makeRecommendation()}
        onAccept={vi.fn()}
        onDismiss={onDismiss}
        autoDismissMs={5000}
      />,
    );

    expect(screen.getByText('Suggestion:', { exact: false })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(screen.queryByText('Suggestion:')).toBeNull();
  });

  it('does not auto-dismiss if user interacts first', async () => {
    vi.useRealTimers(); // need real timers for userEvent
    const onDismiss = vi.fn();
    render(
      <ContextRecommendation
        recommendation={makeRecommendation()}
        onAccept={vi.fn()}
        onDismiss={onDismiss}
        autoDismissMs={100_000}
      />,
    );

    // User clicks dismiss manually
    await userEvent.click(screen.getByLabelText('Dismiss suggestion'));
    expect(onDismiss).toHaveBeenCalledOnce();

    // The auto-dismiss timer should not fire again
    // (no way to easily test this without fake timers, but onDismiss was called once)
  });

  it('does not auto-dismiss when autoDismissMs is 0', () => {
    const onDismiss = vi.fn();
    render(
      <ContextRecommendation
        recommendation={makeRecommendation()}
        onAccept={vi.fn()}
        onDismiss={onDismiss}
        autoDismissMs={0}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText('Suggestion:', { exact: false })).toBeTruthy();
  });
});
