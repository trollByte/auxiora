// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationExportButton } from '../ConversationExportButton.js';
import type { ConversationExportButtonProps, ExportFormat } from '../ConversationExportButton.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Mock URL.createObjectURL / revokeObjectURL for download tests
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
const mockRevokeObjectURL = vi.fn();
Object.defineProperty(globalThis.URL, 'createObjectURL', { value: mockCreateObjectURL, writable: true });
Object.defineProperty(globalThis.URL, 'revokeObjectURL', { value: mockRevokeObjectURL, writable: true });

function makeProps(overrides: Partial<ConversationExportButtonProps> = {}): ConversationExportButtonProps {
  return {
    onExport: vi.fn().mockReturnValue('{"test": true}'),
    conversationTitle: 'Security Review Chat',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Rendering ────────────────────────────────────────────────────────────────

describe('ConversationExportButton', () => {
  describe('initial state', () => {
    it('renders the Export button', () => {
      render(<ConversationExportButton {...makeProps()} />);
      expect(screen.getByText('Export')).toBeTruthy();
    });

    it('does not show dropdown initially', () => {
      render(<ConversationExportButton {...makeProps()} />);
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('respects disabled prop', () => {
      render(<ConversationExportButton {...makeProps({ disabled: true })} />);
      const btn = screen.getByText('Export') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  describe('dropdown', () => {
    it('opens dropdown on click', async () => {
      render(<ConversationExportButton {...makeProps()} />);
      await userEvent.click(screen.getByText('Export'));
      expect(screen.getByRole('menu')).toBeTruthy();
    });

    it('shows all three format options', async () => {
      render(<ConversationExportButton {...makeProps()} />);
      await userEvent.click(screen.getByText('Export'));

      expect(screen.getByText('Export as JSON')).toBeTruthy();
      expect(screen.getByText('Export as Markdown')).toBeTruthy();
      expect(screen.getByText('Export as CSV')).toBeTruthy();
    });

    it('closes dropdown after selecting an option', async () => {
      render(<ConversationExportButton {...makeProps()} />);
      await userEvent.click(screen.getByText('Export'));
      await userEvent.click(screen.getByText('Export as JSON'));

      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('closes dropdown on outside click', async () => {
      render(<ConversationExportButton {...makeProps()} />);
      await userEvent.click(screen.getByText('Export'));
      expect(screen.getByRole('menu')).toBeTruthy();

      // Click outside
      await userEvent.click(document.body);
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('toggles dropdown on repeated clicks', async () => {
      render(<ConversationExportButton {...makeProps()} />);
      await userEvent.click(screen.getByText('Export'));
      expect(screen.getByRole('menu')).toBeTruthy();

      await userEvent.click(screen.getByText('Export'));
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  describe('export actions', () => {
    it('calls onExport with json format', async () => {
      const onExport = vi.fn().mockReturnValue('{}');
      render(<ConversationExportButton {...makeProps({ onExport })} />);

      await userEvent.click(screen.getByText('Export'));
      await userEvent.click(screen.getByText('Export as JSON'));

      expect(onExport).toHaveBeenCalledWith('json');
    });

    it('calls onExport with markdown format', async () => {
      const onExport = vi.fn().mockReturnValue('# Title');
      render(<ConversationExportButton {...makeProps({ onExport })} />);

      await userEvent.click(screen.getByText('Export'));
      await userEvent.click(screen.getByText('Export as Markdown'));

      expect(onExport).toHaveBeenCalledWith('markdown');
    });

    it('calls onExport with csv format', async () => {
      const onExport = vi.fn().mockReturnValue('a,b,c');
      render(<ConversationExportButton {...makeProps({ onExport })} />);

      await userEvent.click(screen.getByText('Export'));
      await userEvent.click(screen.getByText('Export as CSV'));

      expect(onExport).toHaveBeenCalledWith('csv');
    });

    it('shows success status after export', async () => {
      render(<ConversationExportButton {...makeProps()} />);
      await userEvent.click(screen.getByText('Export'));
      await userEvent.click(screen.getByText('Export as JSON'));

      expect(screen.getByText('Exported as JSON')).toBeTruthy();
    });

    it('shows error status when export fails', async () => {
      const onExport = vi.fn().mockImplementation(() => { throw new Error('fail'); });
      render(<ConversationExportButton {...makeProps({ onExport })} />);

      await userEvent.click(screen.getByText('Export'));
      await userEvent.click(screen.getByText('Export as JSON'));

      expect(screen.getByText('Export failed')).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('button has aria-haspopup', () => {
      render(<ConversationExportButton {...makeProps()} />);
      const btn = screen.getByText('Export');
      expect(btn.getAttribute('aria-haspopup')).toBe('true');
    });

    it('button has aria-expanded matching dropdown state', async () => {
      render(<ConversationExportButton {...makeProps()} />);
      const btn = screen.getByText('Export');
      expect(btn.getAttribute('aria-expanded')).toBe('false');

      await userEvent.click(btn);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
    });

    it('dropdown options have menuitem role', async () => {
      render(<ConversationExportButton {...makeProps()} />);
      await userEvent.click(screen.getByText('Export'));

      const items = screen.getAllByRole('menuitem');
      expect(items).toHaveLength(3);
    });

    it('status message has role="status"', async () => {
      render(<ConversationExportButton {...makeProps()} />);
      await userEvent.click(screen.getByText('Export'));
      await userEvent.click(screen.getByText('Export as JSON'));

      const status = screen.getByRole('status');
      expect(status).toBeTruthy();
    });
  });
});
