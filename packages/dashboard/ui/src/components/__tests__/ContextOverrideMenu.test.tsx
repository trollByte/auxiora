// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextOverrideMenu } from '../ContextOverrideMenu.js';
import type { ContextDomain } from '@auxiora/personality/architect';
import { DOMAIN_META, ALL_DOMAINS } from '../context-meta.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const defaults = {
  currentDomain: 'general' as ContextDomain,
  onSelect: () => {},
  onClose: () => {},
  isOpen: true,
};

function renderMenu(overrides: Partial<typeof defaults> = {}) {
  return render(<ContextOverrideMenu {...defaults} {...overrides} />);
}

// ── Domain rendering ─────────────────────────────────────────────────────────

describe('ContextOverrideMenu', () => {
  describe('domain list', () => {
    it('renders all 17 domains with correct labels', () => {
      renderMenu();
      for (const domain of ALL_DOMAINS) {
        // Labels may appear in descriptions of other domains, so use getAllByText
        expect(screen.getAllByText(DOMAIN_META[domain].label, { exact: false }).length).toBeGreaterThanOrEqual(1);
      }
    });

    it('renders descriptions for all 17 domains', () => {
      renderMenu();
      for (const domain of ALL_DOMAINS) {
        expect(screen.getByText(DOMAIN_META[domain].description)).toBeTruthy();
      }
    });

    it('shows header with current detected domain', () => {
      renderMenu({ currentDomain: 'debugging' });
      const header = screen.getByText(/Detected:/);
      expect(header).toBeTruthy();
      expect(header.textContent).toContain('Debugging');
    });

    it('shows "Switch context:" subheader', () => {
      renderMenu();
      expect(screen.getByText('Switch context:')).toBeTruthy();
    });
  });

  describe('current domain highlighting', () => {
    it('highlights the detected domain with detected class', () => {
      renderMenu({ currentDomain: 'code_engineering' });
      const options = screen.getAllByRole('option');
      const engineeringOption = options.find(opt => opt.textContent?.includes('Engineering'));
      expect(engineeringOption?.className).toContain('detected');
    });

    it('shows "detected" badge on the current domain', () => {
      renderMenu({ currentDomain: 'security_review' });
      expect(screen.getByText('detected')).toBeTruthy();
    });

    it('does not apply detected class to other domains', () => {
      renderMenu({ currentDomain: 'general' });
      const options = screen.getAllByRole('option');
      const debugOption = options.find(opt => opt.textContent?.includes('Debugging'));
      expect(debugOption?.className).not.toContain('detected');
    });
  });

  describe('domain selection and scope picker', () => {
    it('shows scope picker after clicking a domain', async () => {
      renderMenu();
      const debugOption = screen.getAllByRole('option').find(
        opt => opt.textContent?.includes('Debugging'),
      )!;
      await userEvent.click(debugOption);

      expect(screen.getByText(/Apply/)).toBeTruthy();
      expect(screen.getByText('This message')).toBeTruthy();
      expect(screen.getByText('This conversation')).toBeTruthy();
    });

    it('calls onSelect with domain and "message" scope', async () => {
      const onSelect = vi.fn();
      renderMenu({ onSelect });

      // Select debugging domain
      const debugOption = screen.getAllByRole('option').find(
        opt => opt.textContent?.includes('Debugging'),
      )!;
      await userEvent.click(debugOption);

      // Select message scope
      await userEvent.click(screen.getByText('This message'));
      expect(onSelect).toHaveBeenCalledWith('debugging', 'message');
    });

    it('calls onSelect with domain and "conversation" scope', async () => {
      const onSelect = vi.fn();
      renderMenu({ onSelect });

      const salesOption = screen.getAllByRole('option').find(
        opt => opt.textContent?.includes('Sales'),
      )!;
      await userEvent.click(salesOption);
      await userEvent.click(screen.getByText('This conversation'));
      expect(onSelect).toHaveBeenCalledWith('sales_pitch', 'conversation');
    });

    it('scope picker shows hints for each option', async () => {
      renderMenu();
      const option = screen.getAllByRole('option')[0];
      await userEvent.click(option);

      expect(screen.getByText('Auto-detection resumes after')).toBeTruthy();
      expect(screen.getByText('Stays until you change it')).toBeTruthy();
    });

    it('back button returns to domain list from scope picker', async () => {
      renderMenu();
      const option = screen.getAllByRole('option')[0];
      await userEvent.click(option);

      expect(screen.getByText('This message')).toBeTruthy();

      await userEvent.click(screen.getByText('Back'));
      expect(screen.getByText('Switch context:')).toBeTruthy();
      expect(screen.queryByText('This message')).toBeNull();
    });
  });

  describe('closing behavior', () => {
    it('calls onClose when Escape is pressed', () => {
      const onClose = vi.fn();
      renderMenu({ onClose });

      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('Escape in scope picker returns to domain list instead of closing', async () => {
      const onClose = vi.fn();
      renderMenu({ onClose });

      // Enter scope picker
      const option = screen.getAllByRole('option')[0];
      await userEvent.click(option);
      expect(screen.getByText('This message')).toBeTruthy();

      // Escape should go back, not close
      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText('Switch context:')).toBeTruthy();
    });

    it('calls onClose when clicking outside', () => {
      const onClose = vi.fn();
      renderMenu({ onClose });

      // Simulate click outside
      fireEvent.mouseDown(document.body);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not render when isOpen is false', () => {
      renderMenu({ isOpen: false });
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('keyboard navigation', () => {
    it('ArrowDown moves focus to next domain', () => {
      renderMenu();
      const dialog = screen.getByRole('dialog');
      const options = screen.getAllByRole('option');

      fireEvent.keyDown(dialog, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(options[0]);

      fireEvent.keyDown(dialog, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(options[1]);
    });

    it('ArrowUp wraps to last domain from top', () => {
      renderMenu();
      const dialog = screen.getByRole('dialog');
      const options = screen.getAllByRole('option');

      // First ArrowDown to set focusIndex to 0
      fireEvent.keyDown(dialog, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(options[0]);

      // ArrowUp should wrap to last
      fireEvent.keyDown(dialog, { key: 'ArrowUp' });
      expect(document.activeElement).toBe(options[options.length - 1]);
    });

    it('ArrowDown wraps to first domain from bottom', () => {
      renderMenu();
      const dialog = screen.getByRole('dialog');
      const options = screen.getAllByRole('option');

      // Navigate to last item
      for (let i = 0; i < ALL_DOMAINS.length; i++) {
        fireEvent.keyDown(dialog, { key: 'ArrowDown' });
      }
      expect(document.activeElement).toBe(options[options.length - 1]);

      // Should wrap to first
      fireEvent.keyDown(dialog, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(options[0]);
    });

    it('Enter selects focused domain and shows scope picker', () => {
      renderMenu();
      const dialog = screen.getByRole('dialog');

      fireEvent.keyDown(dialog, { key: 'ArrowDown' });
      fireEvent.keyDown(dialog, { key: 'Enter' });

      expect(screen.getByText('This message')).toBeTruthy();
    });
  });
});
