import { useState } from 'react';
import type { TaskContext, TraitSource } from '@auxiora/personality/architect';
import { DOMAIN_META, EMOTIONAL_LABELS } from './context-meta.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert camelCase trait key to human-readable label. */
function traitLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .trim();
}

const DEFAULT_VISIBLE = 10;
const TOTAL_TRAITS = 29;

// ── Component ────────────────────────────────────────────────────────────────

export interface SourcesPanelProps {
  sources: TraitSource[];
  context: TaskContext;
  isOpen: boolean;
  onClose: () => void;
  /** Optional weight map (traitKey → 0.0–1.0) for displaying weight bars. */
  weights?: Record<string, number>;
}

export function SourcesPanel({
  sources,
  context,
  isOpen,
  onClose,
  weights,
}: SourcesPanelProps) {
  const [expandedTraits, setExpandedTraits] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  if (!isOpen) return null;

  const domainMeta = DOMAIN_META[context.domain];
  const emotionalLabel = EMOTIONAL_LABELS[context.emotionalRegister];

  // Sources arrive pre-sorted by weight from getActiveSources().
  // If weights provided and showing all, sort by weight descending.
  const visibleSources = showAll ? sources : sources.slice(0, DEFAULT_VISIBLE);

  function toggleTrait(key: string) {
    setExpandedTraits(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function getWeight(key: string): number | undefined {
    return weights?.[key];
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="sources-backdrop"
        onClick={onClose}
        aria-hidden="true"
        data-testid="sources-backdrop"
      />

      {/* Panel */}
      <div
        className="sources-panel"
        role="dialog"
        aria-label="What shaped this response"
      >
        {/* Header */}
        <div className="sources-panel-header">
          <span className="sources-panel-title">
            {'\u{1F9E0}'} What shaped this response
          </span>
          <button
            type="button"
            className="sources-panel-close"
            onClick={onClose}
            aria-label="Close sources panel"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Context subheader */}
        <div className="sources-panel-context">
          <span aria-hidden="true">{domainMeta.icon}</span>{' '}
          {domainMeta.label}
          {emotionalLabel && <span className="sources-panel-emotion">{emotionalLabel}</span>}
        </div>

        {/* Trait list */}
        <ul className="sources-trait-list">
          {visibleSources.map(source => {
            const isExpanded = expandedTraits.has(source.traitKey);
            const weight = getWeight(source.traitKey);

            return (
              <li key={source.traitKey} className="sources-trait-item">
                <button
                  type="button"
                  className="sources-trait-header"
                  onClick={() => toggleTrait(source.traitKey)}
                  aria-expanded={isExpanded}
                >
                  <span className="sources-trait-arrow">{isExpanded ? '\u25BE' : '\u25B8'}</span>
                  <span className="sources-trait-name">{traitLabel(source.traitKey)}</span>
                  {weight != null && (
                    <span className="sources-trait-weight">
                      <span
                        className="sources-trait-weight-bar"
                        style={{ width: `${Math.round(weight * 100)}%` }}
                        aria-label={`Weight: ${Math.round(weight * 100)}%`}
                      />
                      <span className="sources-trait-weight-value">
                        {Math.round(weight * 100)}%
                      </span>
                    </span>
                  )}
                </button>

                {/* Collapsed summary: always show source name */}
                <div className="sources-trait-source">
                  <strong>{source.sourceName}</strong>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="sources-trait-details">
                    <div className="sources-trait-work">{source.sourceWork}</div>
                    <blockquote className="sources-trait-instruction">
                      {source.behavioralInstruction}
                    </blockquote>
                    <div className="sources-trait-evidence">
                      Evidence: {source.evidenceSummary}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Footer */}
        <div className="sources-panel-footer">
          <span className="sources-panel-count">
            Showing top {visibleSources.length} of {TOTAL_TRAITS} active traits
          </span>
          <button
            type="button"
            className="sources-panel-toggle"
            onClick={() => setShowAll(prev => !prev)}
          >
            {showAll ? 'Show fewer' : 'Show all'}
          </button>
        </div>
      </div>
    </>
  );
}
