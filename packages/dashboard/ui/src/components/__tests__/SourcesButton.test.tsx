// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourcesButton } from '../SourcesButton.js';
import type { TaskContext, TraitSource } from '@auxiora/personality/architect';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(): TaskContext {
  return {
    domain: 'general',
    emotionalRegister: 'neutral',
    complexity: 'moderate',
    mode: 'solo_work',
    stakes: 'moderate',
  };
}

function makeSource(key: string): TraitSource {
  return {
    traitKey: key,
    sourceName: `Source for ${key}`,
    sourceWork: `Work for ${key}`,
    evidenceSummary: `Evidence for ${key}`,
    behavioralInstruction: `Instruction for ${key}`,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SourcesButton', () => {
  it('renders the brain emoji button', () => {
    render(
      <SourcesButton
        sources={[makeSource('inversion')]}
        context={makeContext()}
      />,
    );
    expect(screen.getByLabelText('View sources')).toBeTruthy();
  });

  it('renders Sources label', () => {
    render(
      <SourcesButton
        sources={[makeSource('inversion')]}
        context={makeContext()}
      />,
    );
    expect(screen.getByText('Sources')).toBeTruthy();
  });

  it('does not render when sources array is empty', () => {
    const { container } = render(
      <SourcesButton
        sources={[]}
        context={makeContext()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('opens SourcesPanel on click', async () => {
    render(
      <SourcesButton
        sources={[makeSource('inversion')]}
        context={makeContext()}
      />,
    );

    // Panel should not be open initially
    expect(screen.queryByRole('dialog')).toBeNull();

    // Click the button
    await userEvent.click(screen.getByLabelText('View sources'));

    // Panel should now be visible
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/What shaped this response/)).toBeTruthy();
  });

  it('closes SourcesPanel when backdrop is clicked', async () => {
    render(
      <SourcesButton
        sources={[makeSource('inversion')]}
        context={makeContext()}
      />,
    );

    // Open panel
    await userEvent.click(screen.getByLabelText('View sources'));
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Click backdrop to close
    await userEvent.click(screen.getByTestId('sources-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
