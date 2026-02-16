import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export type ExportFormat = 'json' | 'markdown' | 'csv';

export interface ConversationExportButtonProps {
  /** Export the conversation in the specified format. Returns file content. */
  onExport: (format: ExportFormat) => string;
  /** Short title for filename generation. */
  conversationTitle?: string;
  /** Whether the button should be disabled. */
  disabled?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const FORMAT_OPTIONS: Array<{ format: ExportFormat; label: string; ext: string }> = [
  { format: 'json', label: 'Export as JSON', ext: 'json' },
  { format: 'markdown', label: 'Export as Markdown', ext: 'md' },
  { format: 'csv', label: 'Export as CSV', ext: 'csv' },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function buildFilename(title: string | undefined, ext: string): string {
  const date = new Date().toISOString().split('T')[0];
  const slug = title ? slugify(title) : 'conversation';
  return `architect-conversation-${date}-${slug}.${ext}`;
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

const MIME_TYPES: Record<ExportFormat, string> = {
  json: 'application/json',
  markdown: 'text/markdown',
  csv: 'text/csv',
};

// ── Component ────────────────────────────────────────────────────────────────

export function ConversationExportButton({
  onExport,
  conversationTitle,
  disabled = false,
}: ConversationExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleExport = useCallback((format: ExportFormat, ext: string) => {
    try {
      const content = onExport(format);
      const filename = buildFilename(conversationTitle, ext);
      downloadFile(content, filename, MIME_TYPES[format]);
      setStatus(`Exported as ${ext.toUpperCase()}`);
      setTimeout(() => setStatus(''), 3000);
    } catch {
      setStatus('Export failed');
      setTimeout(() => setStatus(''), 3000);
    }
    setIsOpen(false);
  }, [onExport, conversationTitle]);

  return (
    <div className="conversation-export" ref={dropdownRef}>
      <button
        className="conversation-export-btn"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="Export conversation"
      >
        Export
      </button>

      {isOpen && (
        <div className="conversation-export-dropdown" role="menu">
          {FORMAT_OPTIONS.map(({ format, label, ext }) => (
            <button
              key={format}
              className="conversation-export-option"
              role="menuitem"
              onClick={() => handleExport(format, ext)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {status && <span className="conversation-export-status" role="status">{status}</span>}
    </div>
  );
}
