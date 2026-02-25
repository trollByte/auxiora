import { useState, useEffect, useRef } from 'react';
import type { ContextDomain } from '@auxiora/personality/architect';
import type { ContextRecommendation as Recommendation } from '@auxiora/personality/architect';
import { DOMAIN_META } from './context-meta.js';

// ── Props ────────────────────────────────────────────────────────────────────

export interface ContextRecommendationProps {
  recommendation: Recommendation;
  onAccept: (domain: ContextDomain) => void;
  onDismiss: () => void;
  /** Auto-dismiss timeout in ms. Defaults to 10 000. Pass 0 to disable. */
  autoDismissMs?: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ContextRecommendation({
  recommendation,
  onAccept,
  onDismiss,
  autoDismissMs = 10_000,
}: ContextRecommendationProps) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactedRef = useRef(false);

  useEffect(() => {
    if (autoDismissMs <= 0) return;

    timerRef.current = setTimeout(() => {
      if (!interactedRef.current) {
        setVisible(false);
        onDismiss();
      }
    }, autoDismissMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoDismissMs, onDismiss]);

  if (!visible) return null;

  const meta = DOMAIN_META[recommendation.suggestedDomain];

  const handleAccept = () => {
    interactedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    onAccept(recommendation.suggestedDomain);
  };

  const handleDismiss = () => {
    interactedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    onDismiss();
  };

  return (
    <div className="context-recommendation" role="status" aria-live="polite">
      <span className="context-recommendation-icon" aria-hidden="true">
        {meta.icon}
      </span>
      <span className="context-recommendation-text">
        <strong>Suggestion:</strong> Switch to {meta.label}?{' '}
        <span className="context-recommendation-reason">{recommendation.reason}</span>
      </span>
      <button
        type="button"
        className="context-recommendation-accept"
        onClick={handleAccept}
      >
        Switch
      </button>
      <button
        type="button"
        className="context-recommendation-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss suggestion"
      >
        ✕
      </button>
    </div>
  );
}
