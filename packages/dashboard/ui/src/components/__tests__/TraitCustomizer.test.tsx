// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TraitCustomizer } from '../TraitCustomizer.js';
import type { TraitCustomizerProps } from '../TraitCustomizer.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_PRESETS = {
  the_ciso: {
    name: 'The CISO',
    description: 'Security-focused paranoid vigilance',
    overrides: { adversarialThinking: 0.2, paranoidVigilance: 0.2, warmth: -0.1 },
  },
  the_coach: {
    name: 'The Coach',
    description: 'Empathetic developmental coaching',
    overrides: { tacticalEmpathy: 0.2, developmentalCoaching: 0.2, warmth: 0.2, urgency: -0.2, adversarialThinking: -0.15 },
  },
};

function makeProps(overrides: Partial<TraitCustomizerProps> = {}): TraitCustomizerProps {
  return {
    getOverrides: vi.fn().mockResolvedValue({}),
    setOverride: vi.fn().mockResolvedValue(undefined),
    removeOverride: vi.fn().mockResolvedValue(undefined),
    loadPreset: vi.fn().mockResolvedValue(undefined),
    listPresets: vi.fn().mockReturnValue(MOCK_PRESETS),
    ...overrides,
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

describe('TraitCustomizer', () => {
  describe('initial rendering', () => {
    it('shows loading state before overrides resolve', () => {
      const props = makeProps({
        getOverrides: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
      });
      render(<TraitCustomizer {...props} />);
      expect(screen.getByText('Loading trait settings...')).toBeTruthy();
    });

    it('renders title after loading', async () => {
      const props = makeProps();
      render(<TraitCustomizer {...props} />);
      expect(await screen.findByText('Trait Customizer')).toBeTruthy();
    });

    it('renders all 29 trait labels', async () => {
      const props = makeProps();
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const expectedTraits = [
        'Inversion', 'First Principles', 'Mental Simulation', 'Adversarial Thinking',
        'Second-Order Thinking', 'Systems View', 'Simplification', 'Storytelling',
        'Tactical Empathy', 'Genuine Curiosity', 'Radical Candor', 'Standard Setting',
        'Developmental Coaching', 'Strategic Generosity', 'Stoic Calm', 'Paranoid Vigilance',
        'Value Equation', 'OODA Loop', 'Build for Change', 'Human-Centered Design',
        'Constraint Creativity', 'Regret Minimization', 'Door Classification',
        'Probabilistic Thinking', 'Planned Abandonment', 'Warmth', 'Urgency', 'Humor',
        'Verbosity',
      ];

      for (const label of expectedTraits) {
        expect(screen.getByText(label)).toBeTruthy();
      }
    });
  });

  describe('category grouping', () => {
    it('renders all 6 category headers', async () => {
      const props = makeProps();
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      for (const category of ['Thinking', 'Communication', 'Leadership', 'Execution', 'Decision', 'Tone']) {
        expect(screen.getByText(category)).toBeTruthy();
      }
    });

    it('groups Thinking traits under Thinking header', async () => {
      const props = makeProps();
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      // Find the Thinking group container by locating the header
      const thinkingHeaders = screen.getAllByText('Thinking');
      const thinkingGroup = thinkingHeaders[0].closest('.trait-customizer-group');
      expect(thinkingGroup).toBeTruthy();

      // Verify traits in this group
      const group = within(thinkingGroup as HTMLElement);
      expect(group.getByText('Inversion')).toBeTruthy();
      expect(group.getByText('First Principles')).toBeTruthy();
      expect(group.getByText('Mental Simulation')).toBeTruthy();
      expect(group.getByText('Adversarial Thinking')).toBeTruthy();
      expect(group.getByText('Second-Order Thinking')).toBeTruthy();
      expect(group.getByText('Systems View')).toBeTruthy();
    });

    it('groups Tone traits under Tone header', async () => {
      const props = makeProps();
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const toneHeaders = screen.getAllByText('Tone');
      const toneGroup = toneHeaders[0].closest('.trait-customizer-group');
      const group = within(toneGroup as HTMLElement);
      expect(group.getByText('Warmth')).toBeTruthy();
      expect(group.getByText('Urgency')).toBeTruthy();
      expect(group.getByText('Humor')).toBeTruthy();
      expect(group.getByText('Verbosity')).toBeTruthy();
    });
  });

  describe('slider values reflect overrides', () => {
    it('shows +0.00 for traits without overrides', async () => {
      const props = makeProps();
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      // All values should show +0.00 when no overrides
      const zeroValues = screen.getAllByText('+0.00');
      expect(zeroValues.length).toBe(29);
    });

    it('reflects positive override values', async () => {
      const props = makeProps({
        getOverrides: vi.fn().mockResolvedValue({ warmth: 0.2, humor: 0.15 }),
      });
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      expect(screen.getByText('+0.20')).toBeTruthy();
      expect(screen.getByText('+0.15')).toBeTruthy();
    });

    it('reflects negative override values', async () => {
      const props = makeProps({
        getOverrides: vi.fn().mockResolvedValue({ urgency: -0.2 }),
      });
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      expect(screen.getByText('-0.20')).toBeTruthy();
    });

    it('shows Reset button only for traits with overrides', async () => {
      const props = makeProps({
        getOverrides: vi.fn().mockResolvedValue({ warmth: 0.1 }),
      });
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      // Only one Reset button should appear (for warmth)
      const resetButtons = screen.getAllByText('Reset');
      expect(resetButtons.length).toBe(1);
    });
  });

  describe('slider interaction', () => {
    it('calls setOverride when slider changes to non-zero', async () => {
      const setOverride = vi.fn().mockResolvedValue(undefined);
      const props = makeProps({ setOverride });
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const sliders = screen.getAllByRole('slider');
      // Fire change event on the first slider (Inversion)
      const slider = sliders[0];
      await userEvent.pointer([
        { target: slider },
        { keys: '[MouseLeft]', target: slider },
      ]);

      // Simulate direct change event since pointer may not move slider value
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value',
      )!.set!.call(slider, '0.15');
      slider.dispatchEvent(new Event('change', { bubbles: true }));

      expect(setOverride).toHaveBeenCalledWith('inversion', 0.15);
    });

    it('calls removeOverride when slider changes to zero', async () => {
      const removeOverride = vi.fn().mockResolvedValue(undefined);
      const props = makeProps({
        getOverrides: vi.fn().mockResolvedValue({ warmth: 0.1 }),
        removeOverride,
      });
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      // Find warmth slider - it's the 26th trait (index 25 in TRAIT_INFO)
      const sliders = screen.getAllByRole('slider');
      const warmthSlider = sliders[25]; // warmth is index 25

      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value',
      )!.set!.call(warmthSlider, '0');
      warmthSlider.dispatchEvent(new Event('change', { bubbles: true }));

      expect(removeOverride).toHaveBeenCalledWith('warmth');
    });

    it('Reset button calls handler with zero', async () => {
      const removeOverride = vi.fn().mockResolvedValue(undefined);
      const props = makeProps({
        getOverrides: vi.fn().mockResolvedValue({ warmth: 0.2 }),
        removeOverride,
      });
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const resetBtn = screen.getByText('Reset');
      await userEvent.click(resetBtn);

      expect(removeOverride).toHaveBeenCalledWith('warmth');
    });
  });

  describe('preset buttons', () => {
    it('renders preset cards with names and descriptions', async () => {
      const props = makeProps();
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      // Names appear in both dropdown and cards, so use getAllByText
      expect(screen.getAllByText('The CISO').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Security-focused paranoid vigilance')).toBeTruthy();
      expect(screen.getAllByText('The Coach').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Empathetic developmental coaching')).toBeTruthy();
    });

    it('renders Apply button for each preset', async () => {
      const props = makeProps();
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const applyButtons = screen.getAllByText('Apply');
      expect(applyButtons.length).toBe(Object.keys(MOCK_PRESETS).length);
    });

    it('clicking Apply calls loadPreset and refreshes overrides', async () => {
      const loadPreset = vi.fn().mockResolvedValue(undefined);
      const getOverrides = vi.fn()
        .mockResolvedValueOnce({})  // initial load
        .mockResolvedValueOnce({ adversarialThinking: 0.2, paranoidVigilance: 0.2, warmth: -0.1 }); // after preset
      const props = makeProps({ loadPreset, getOverrides });

      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const applyButtons = screen.getAllByText('Apply');
      await userEvent.click(applyButtons[0]); // Click first Apply (The CISO)

      expect(loadPreset).toHaveBeenCalledWith('the_ciso');
      // getOverrides called twice: initial + after preset load
      expect(getOverrides).toHaveBeenCalledTimes(2);
    });

    it('shows status message after preset load', async () => {
      const loadPreset = vi.fn().mockResolvedValue(undefined);
      const getOverrides = vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ adversarialThinking: 0.2 });
      const props = makeProps({ loadPreset, getOverrides });

      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const applyButtons = screen.getAllByText('Apply');
      await userEvent.click(applyButtons[0]);

      expect(await screen.findByText('Loaded The CISO')).toBeTruthy();
    });

    it('highlights active preset card', async () => {
      const getOverrides = vi.fn().mockResolvedValue(
        { adversarialThinking: 0.2, paranoidVigilance: 0.2, warmth: -0.1 },
      );
      const props = makeProps({ getOverrides });
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      // The CISO preset should be detected as active — name appears in dropdown too
      const cisoCard = screen.getAllByText('The CISO')
        .map(el => el.closest('.trait-customizer-preset-card'))
        .find(el => el !== null);
      expect(cisoCard?.className).toContain('trait-customizer-preset-card-active');
    });
  });

  describe('preset dropdown', () => {
    it('renders Custom as default option', async () => {
      const props = makeProps();
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const select = screen.getByRole('combobox');
      expect((select as HTMLSelectElement).value).toBe('custom');
    });

    it('renders preset options in dropdown', async () => {
      const props = makeProps();
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const options = screen.getAllByRole('option');
      // Custom + 2 presets = 3 options
      expect(options.length).toBe(3);
      expect(options[0].textContent).toBe('Custom');
      expect(options[1].textContent).toBe('The CISO');
      expect(options[2].textContent).toBe('The Coach');
    });

    it('changing dropdown loads preset', async () => {
      const loadPreset = vi.fn().mockResolvedValue(undefined);
      const getOverrides = vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ tacticalEmpathy: 0.2 });
      const props = makeProps({ loadPreset, getOverrides });

      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const select = screen.getByRole('combobox');
      await userEvent.selectOptions(select, 'the_coach');

      expect(loadPreset).toHaveBeenCalledWith('the_coach');
    });
  });

  describe('Reset All', () => {
    it('Reset All button is disabled when no overrides', async () => {
      const props = makeProps();
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const resetAllBtn = screen.getByText('Reset All to Default');
      expect((resetAllBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('Reset All button is enabled when overrides exist', async () => {
      const props = makeProps({
        getOverrides: vi.fn().mockResolvedValue({ warmth: 0.2, humor: -0.1 }),
      });
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const resetAllBtn = screen.getByText('Reset All to Default');
      expect((resetAllBtn as HTMLButtonElement).disabled).toBe(false);
    });

    it('clicking Reset All removes all overrides', async () => {
      const removeOverride = vi.fn().mockResolvedValue(undefined);
      const props = makeProps({
        getOverrides: vi.fn().mockResolvedValue({ warmth: 0.2, humor: -0.1 }),
        removeOverride,
      });
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      const resetAllBtn = screen.getByText('Reset All to Default');
      await userEvent.click(resetAllBtn);

      expect(removeOverride).toHaveBeenCalledWith('warmth');
      expect(removeOverride).toHaveBeenCalledWith('humor');
      expect(removeOverride).toHaveBeenCalledTimes(2);
    });

    it('shows status message after Reset All', async () => {
      const removeOverride = vi.fn().mockResolvedValue(undefined);
      const props = makeProps({
        getOverrides: vi.fn().mockResolvedValue({ warmth: 0.2 }),
        removeOverride,
      });
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      await userEvent.click(screen.getByText('Reset All to Default'));

      expect(await screen.findByText('All overrides cleared')).toBeTruthy();
    });
  });

  describe('source attribution', () => {
    it('shows source for each trait', async () => {
      const props = makeProps();
      render(<TraitCustomizer {...props} />);
      await screen.findByText('Trait Customizer');

      // Spot check a few sources (some appear multiple times, e.g. Bezos)
      expect(screen.getByText('(Munger)')).toBeTruthy();
      expect(screen.getAllByText('(Bezos)').length).toBe(2); // regretMinimization + doorClassification
      expect(screen.getByText('(Voss)')).toBeTruthy();
      expect(screen.getByText('(Boyd)')).toBeTruthy();
    });
  });
});
