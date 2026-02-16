import type { TaskContext, ContextDomain, EmotionalRegister } from '@auxiora/personality/architect';

// ── Domain metadata ──────────────────────────────────────────────────────────

interface DomainMeta {
  icon: string;
  label: string;
  colorClass: string;
}

const DOMAIN_META: Record<ContextDomain, DomainMeta> = {
  security_review:      { icon: '\u{1F6E1}\uFE0F', label: 'Security Review',  colorClass: 'context-red' },
  crisis_management:    { icon: '\u{1F6A8}',       label: 'Crisis',           colorClass: 'context-red' },
  code_engineering:     { icon: '\u{1F4BB}',       label: 'Engineering',      colorClass: 'context-blue' },
  architecture_design:  { icon: '\u{1F3D7}\uFE0F', label: 'Architecture',     colorClass: 'context-blue' },
  debugging:            { icon: '\u{1F41B}',       label: 'Debugging',        colorClass: 'context-blue' },
  team_leadership:      { icon: '\u{1F465}',       label: 'Team Leadership',  colorClass: 'context-green' },
  one_on_one:           { icon: '\u{1F91D}',       label: 'One-on-One',       colorClass: 'context-green' },
  sales_pitch:          { icon: '\u{1F4C8}',       label: 'Sales',            colorClass: 'context-purple' },
  negotiation:          { icon: '\u2696\uFE0F',    label: 'Negotiation',      colorClass: 'context-purple' },
  marketing_content:    { icon: '\u{1F4E3}',       label: 'Marketing',        colorClass: 'context-purple' },
  strategic_planning:   { icon: '\u{1F3AF}',       label: 'Strategy',         colorClass: 'context-orange' },
  decision_making:      { icon: '\u2696\uFE0F',    label: 'Decision',         colorClass: 'context-orange' },
  creative_work:        { icon: '\u{1F4A1}',       label: 'Creative',         colorClass: 'context-teal' },
  writing_content:      { icon: '\u270D\uFE0F',    label: 'Writing',          colorClass: 'context-teal' },
  learning_research:    { icon: '\u{1F4DA}',       label: 'Learning',         colorClass: 'context-gray' },
  personal_development: { icon: '\u{1F331}',       label: 'Growth',           colorClass: 'context-gray' },
  general:              { icon: '\u{1F4AC}',       label: 'General',          colorClass: 'context-gray' },
};

// ── Emotional register labels ────────────────────────────────────────────────

const EMOTIONAL_LABELS: Partial<Record<EmotionalRegister, string>> = {
  stressed:    '\u00B7 Under Pressure',
  frustrated:  '\u00B7 Working Through It',
  uncertain:   '\u00B7 Exploring',
  excited:     '\u00B7 Energized',
  celebratory: '\u00B7 Celebrating',
};

// ── All domains for the override menu ────────────────────────────────────────

const ALL_DOMAINS = Object.keys(DOMAIN_META) as ContextDomain[];

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
