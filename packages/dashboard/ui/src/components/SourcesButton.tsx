import { useState } from 'react';
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

  if (sources.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="sources-button"
        onClick={() => setIsOpen(true)}
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
    </>
  );
}
