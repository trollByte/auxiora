import { useState, useRef, useEffect } from 'react';
import type { TaskContext, TraitSource } from '@auxiora/personality/architect';
import { SourcesPanel } from './SourcesPanel.js';

// ── Component ────────────────────────────────────────────────────────────────

export interface SourcesButtonProps {
  sources: TraitSource[];
  context: TaskContext;
  /** Optional weight map for SourcesPanel weight bars. */
  weights?: Record<string, number>;
}

export function SourcesButton({ sources, context, weights }: SourcesButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  if (sources.length === 0) return null;

  return (
    <div className="sources-button-container" ref={containerRef}>
      <button
        type="button"
        className="sources-button"
        onClick={() => setIsOpen(v => !v)}
        aria-label="View sources"
      >
        <span aria-hidden="true">{'\u{1F9E0}'}</span>{' '}
        <span className="sources-button-label">Sources</span>
      </button>

      <SourcesPanel
        sources={sources}
        context={context}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        weights={weights}
      />
    </div>
  );
}
