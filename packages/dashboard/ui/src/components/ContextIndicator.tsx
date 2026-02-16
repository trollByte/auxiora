import type { TaskContext, ContextDomain } from '@auxiora/personality/architect';
import { DOMAIN_META, ALL_DOMAINS, EMOTIONAL_LABELS } from './context-meta.js';

// ── Component ────────────────────────────────────────────────────────────────

export interface ContextIndicatorProps {
  context: TaskContext;
  onOverride: (domain: ContextDomain) => void;
  showOverrideMenu?: boolean;
  onToggleOverrideMenu?: () => void;
}

export function ContextIndicator({
  context,
  onOverride,
  showOverrideMenu,
  onToggleOverrideMenu,
}: ContextIndicatorProps) {
  const meta = DOMAIN_META[context.domain];
  const emotionalLabel = EMOTIONAL_LABELS[context.emotionalRegister];

  return (
    <div className="context-indicator-wrapper">
      <button
        type="button"
        className={`context-indicator ${meta.colorClass}`}
        onClick={onToggleOverrideMenu}
        aria-label={`Context: ${meta.label}`}
        aria-expanded={showOverrideMenu}
        aria-haspopup="menu"
      >
        <span className="context-indicator-icon" aria-hidden="true">{meta.icon}</span>
        <span className="context-indicator-label">{meta.label}</span>
        {emotionalLabel && (
          <span className="context-indicator-emotion">{emotionalLabel}</span>
        )}
      </button>

      {showOverrideMenu && (
        <ul className="context-override-menu" role="menu">
          {ALL_DOMAINS.map(domain => {
            const d = DOMAIN_META[domain];
            return (
              <li key={domain} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={`context-override-item ${domain === context.domain ? 'active' : ''}`}
                  onClick={() => onOverride(domain)}
                >
                  <span aria-hidden="true">{d.icon}</span> {d.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
