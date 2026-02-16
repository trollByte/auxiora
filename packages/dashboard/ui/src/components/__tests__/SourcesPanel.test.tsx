// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourcesPanel } from '../SourcesPanel.js';
import type { TaskContext, TraitSource } from '@auxiora/personality/architect';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    domain: 'code_engineering',
    emotionalRegister: 'neutral',
    complexity: 'moderate',
    mode: 'solo_work',
    stakes: 'moderate',
    ...overrides,
  };
}

function makeSource(overrides: Partial<TraitSource> & { traitKey: string }): TraitSource {
  return {
    sourceName: 'Test Source',
    sourceWork: 'Test Work',
    evidenceSummary: 'Test evidence summary',
    behavioralInstruction: 'Test instruction',
    ...overrides,
  };
}

function makeSources(count: number): TraitSource[] {
  const names = [
    'inversion', 'firstPrinciples', 'mentalSimulation', 'adversarialThinking',
    'secondOrder', 'systemsView', 'simplification', 'storytelling',
    'tacticalEmpathy', 'genuineCuriosity', 'radicalCandor', 'standardSetting',
    'developmentalCoaching', 'strategicGenerosity', 'stoicCalm',
  ];
  return names.slice(0, count).map((key, i) => makeSource({
    traitKey: key,
    sourceName: `Source ${i + 1}`,
    sourceWork: `Work ${i + 1}`,
    evidenceSummary: `Evidence for ${key}`,
    behavioralInstruction: `Instruction for ${key}`,
  }));
}

const defaults = {
  sources: makeSources(12),
  context: makeContext(),
  isOpen: true,
  onClose: () => {},
};

function renderPanel(overrides: Partial<typeof defaults> = {}) {
  return render(<SourcesPanel {...defaults} {...overrides} />);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SourcesPanel', () => {
  describe('rendering', () => {
    it('does not render when isOpen is false', () => {
      renderPanel({ isOpen: false });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders the panel header', () => {
      renderPanel();
      expect(screen.getByText(/What shaped this response/)).toBeTruthy();
    });

    it('renders context subheader with domain label', () => {
      renderPanel({ context: makeContext({ domain: 'debugging' }) });
      expect(screen.getByText(/Debugging/)).toBeTruthy();
    });

    it('shows emotional register in subheader when not neutral', () => {
      renderPanel({ context: makeContext({ emotionalRegister: 'stressed' }) });
      expect(screen.getByText(/Under Pressure/)).toBeTruthy();
    });

    it('does not show emotional register when neutral', () => {
      renderPanel({ context: makeContext({ emotionalRegister: 'neutral' }) });
      expect(screen.queryByText(/Under Pressure|Exploring|Energized|Celebrating|Working Through It/)).toBeNull();
    });
  });

  describe('trait items', () => {
    it('renders the default 10 visible traits from 12 sources', () => {
      renderPanel({ sources: makeSources(12) });
      // Each trait has a header button with the trait name
      const buttons = screen.getAllByRole('button').filter(
        btn => btn.classList.contains('sources-trait-header'),
      );
      expect(buttons).toHaveLength(10);
    });

    it('collapsed items show trait name and source name', () => {
      const sources = [makeSource({ traitKey: 'inversion', sourceName: 'Charlie Munger' })];
      renderPanel({ sources });
      expect(screen.getByText('Inversion')).toBeTruthy();
      expect(screen.getByText('Charlie Munger')).toBeTruthy();
    });

    it('collapsed items do not show evidence or instruction', () => {
      const sources = [makeSource({
        traitKey: 'inversion',
        evidenceSummary: 'Unique evidence text',
        behavioralInstruction: 'Unique instruction text',
      })];
      renderPanel({ sources });
      expect(screen.queryByText(/Unique evidence text/)).toBeNull();
      expect(screen.queryByText(/Unique instruction text/)).toBeNull();
    });

    it('expanded items show full details including evidence', async () => {
      const sources = [makeSource({
        traitKey: 'inversion',
        sourceName: 'Charlie Munger',
        sourceWork: "Poor Charlie's Almanack",
        behavioralInstruction: 'Define failure first',
        evidenceSummary: 'Inversion thinking works',
      })];
      renderPanel({ sources });

      // Click to expand
      await userEvent.click(screen.getByText('Inversion'));

      expect(screen.getByText("Poor Charlie's Almanack")).toBeTruthy();
      expect(screen.getByText('Define failure first')).toBeTruthy();
      expect(screen.getByText(/Inversion thinking works/)).toBeTruthy();
    });

    it('clicking again collapses expanded item', async () => {
      const sources = [makeSource({
        traitKey: 'inversion',
        behavioralInstruction: 'Define failure first',
      })];
      renderPanel({ sources });

      // Expand
      await userEvent.click(screen.getByText('Inversion'));
      expect(screen.getByText('Define failure first')).toBeTruthy();

      // Collapse
      await userEvent.click(screen.getByText('Inversion'));
      expect(screen.queryByText('Define failure first')).toBeNull();
    });

    it('shows weight bar and percentage when weights provided', () => {
      const sources = [makeSource({ traitKey: 'inversion' })];
      renderPanel({ sources, weights: { inversion: 0.85 } });
      expect(screen.getByText('85%')).toBeTruthy();
      expect(screen.getByLabelText('Weight: 85%')).toBeTruthy();
    });
  });

  describe('show all toggle', () => {
    it('shows "Show all" button in footer', () => {
      renderPanel({ sources: makeSources(12) });
      expect(screen.getByText('Show all')).toBeTruthy();
    });

    it('shows count text', () => {
      renderPanel({ sources: makeSources(12) });
      expect(screen.getByText(/Showing top 10 of 29 active traits/)).toBeTruthy();
    });

    it('clicking "Show all" reveals all sources', async () => {
      renderPanel({ sources: makeSources(12) });

      await userEvent.click(screen.getByText('Show all'));

      const buttons = screen.getAllByRole('button').filter(
        btn => btn.classList.contains('sources-trait-header'),
      );
      expect(buttons).toHaveLength(12);
    });

    it('changes button text to "Show fewer" when expanded', async () => {
      renderPanel({ sources: makeSources(12) });
      await userEvent.click(screen.getByText('Show all'));
      expect(screen.getByText('Show fewer')).toBeTruthy();
    });
  });

  describe('close behavior', () => {
    it('calls onClose when backdrop is clicked', async () => {
      const onClose = vi.fn();
      renderPanel({ onClose });

      await userEvent.click(screen.getByTestId('sources-backdrop'));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      renderPanel({ onClose });

      await userEvent.click(screen.getByLabelText('Close sources panel'));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
