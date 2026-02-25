// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextIndicator } from '../ContextIndicator.js';
import type { TaskContext, ContextDomain, EmotionalRegister } from '@auxiora/personality/architect';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    domain: 'general',
    emotionalRegister: 'neutral',
    complexity: 'moderate',
    mode: 'solo_work',
    stakes: 'moderate',
    ...overrides,
  };
}

const noop = () => {};

// ── Domain rendering ─────────────────────────────────────────────────────────

const DOMAIN_EXPECTATIONS: Record<ContextDomain, { label: string; colorClass: string }> = {
  security_review:      { label: 'Security Review',  colorClass: 'context-red' },
  crisis_management:    { label: 'Crisis',           colorClass: 'context-red' },
  code_engineering:     { label: 'Engineering',      colorClass: 'context-blue' },
  architecture_design:  { label: 'Architecture',     colorClass: 'context-blue' },
  debugging:            { label: 'Debugging',        colorClass: 'context-blue' },
  team_leadership:      { label: 'Team Leadership',  colorClass: 'context-green' },
  one_on_one:           { label: 'One-on-One',       colorClass: 'context-green' },
  sales_pitch:          { label: 'Sales',            colorClass: 'context-purple' },
  negotiation:          { label: 'Negotiation',      colorClass: 'context-purple' },
  marketing_content:    { label: 'Marketing',        colorClass: 'context-purple' },
  strategic_planning:   { label: 'Strategy',         colorClass: 'context-orange' },
  decision_making:      { label: 'Decision',         colorClass: 'context-orange' },
  creative_work:        { label: 'Creative',         colorClass: 'context-teal' },
  writing_content:      { label: 'Writing',          colorClass: 'context-teal' },
  learning_research:    { label: 'Learning',         colorClass: 'context-gray' },
  personal_development: { label: 'Growth',           colorClass: 'context-gray' },
  general:              { label: 'General',          colorClass: 'context-gray' },
};

describe('ContextIndicator', () => {
  describe('domain rendering', () => {
    const domains = Object.keys(DOMAIN_EXPECTATIONS) as ContextDomain[];

    it.each(domains)('renders correct label for %s', (domain) => {
      const { label } = DOMAIN_EXPECTATIONS[domain];
      render(
        <ContextIndicator
          context={makeContext({ domain })}
          onOverride={noop}
        />,
      );
      expect(screen.getByText(label)).toBeTruthy();
    });

    it.each(domains)('applies correct color class for %s', (domain) => {
      const { colorClass } = DOMAIN_EXPECTATIONS[domain];
      render(
        <ContextIndicator
          context={makeContext({ domain })}
          onOverride={noop}
        />,
      );
      const button = screen.getByRole('button', { name: /^Context:/ });
      expect(button.className).toContain(colorClass);
    });
  });

  describe('emotional register', () => {
    const visibleRegisters: [EmotionalRegister, string][] = [
      ['stressed', 'Under Pressure'],
      ['frustrated', 'Working Through It'],
      ['uncertain', 'Exploring'],
      ['excited', 'Energized'],
      ['celebratory', 'Celebrating'],
    ];

    it.each(visibleRegisters)(
      'shows emotional label for %s register',
      (register, expectedText) => {
        render(
          <ContextIndicator
            context={makeContext({ emotionalRegister: register })}
            onOverride={noop}
          />,
        );
        expect(screen.getByText(new RegExp(expectedText))).toBeTruthy();
      },
    );

    it('hides emotional label when register is neutral', () => {
      render(
        <ContextIndicator
          context={makeContext({ emotionalRegister: 'neutral' })}
          onOverride={noop}
        />,
      );
      expect(screen.queryByText(/Under Pressure|Working Through It|Exploring|Energized|Celebrating/)).toBeNull();
    });
  });

  describe('interactions', () => {
    it('calls onToggleOverrideMenu when clicked', async () => {
      const onToggle = vi.fn();
      render(
        <ContextIndicator
          context={makeContext()}
          onOverride={noop}
          onToggleOverrideMenu={onToggle}
        />,
      );

      const button = screen.getByRole('button', { name: /^Context:/ });
      await userEvent.click(button);
      expect(onToggle).toHaveBeenCalledOnce();
    });

    it('calls onOverride with selected domain from override menu', async () => {
      const onOverride = vi.fn();
      render(
        <ContextIndicator
          context={makeContext({ domain: 'general' })}
          onOverride={onOverride}
          showOverrideMenu={true}
        />,
      );

      const menuItems = screen.getAllByRole('menuitem');
      // Click the first menu item (security_review)
      await userEvent.click(menuItems[0]);
      expect(onOverride).toHaveBeenCalledWith('security_review');
    });

    it('does not render override menu when showOverrideMenu is false', () => {
      render(
        <ContextIndicator
          context={makeContext()}
          onOverride={noop}
          showOverrideMenu={false}
        />,
      );
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('renders override menu with all 17 domains when open', () => {
      render(
        <ContextIndicator
          context={makeContext()}
          onOverride={noop}
          showOverrideMenu={true}
        />,
      );
      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems).toHaveLength(17);
    });

    it('marks current domain as active in override menu', () => {
      render(
        <ContextIndicator
          context={makeContext({ domain: 'debugging' })}
          onOverride={noop}
          showOverrideMenu={true}
        />,
      );
      // Find the Debugging menu item
      const debugItem = screen.getAllByRole('menuitem').find(
        item => item.textContent?.includes('Debugging'),
      );
      expect(debugItem?.className).toContain('active');
    });
  });
});
