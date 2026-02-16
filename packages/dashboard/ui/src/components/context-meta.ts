import type { ContextDomain, EmotionalRegister } from '@auxiora/personality/architect';

// ── Domain metadata ──────────────────────────────────────────────────────────

export interface DomainMeta {
  icon: string;
  label: string;
  description: string;
  colorClass: string;
}

export const DOMAIN_META: Record<ContextDomain, DomainMeta> = {
  security_review:      { icon: '\u{1F6E1}\uFE0F', label: 'Security Review',  description: 'Adversarial analysis, threat modeling, vulnerability assessment',       colorClass: 'context-red' },
  crisis_management:    { icon: '\u{1F6A8}',       label: 'Crisis',           description: 'Incidents, breaches, outages, urgent response',                          colorClass: 'context-red' },
  code_engineering:     { icon: '\u{1F4BB}',       label: 'Engineering',      description: 'Writing, reviewing, and optimizing code',                                colorClass: 'context-blue' },
  architecture_design:  { icon: '\u{1F3D7}\uFE0F', label: 'Architecture',     description: 'System design, patterns, trade-off analysis',                            colorClass: 'context-blue' },
  debugging:            { icon: '\u{1F41B}',       label: 'Debugging',        description: 'Finding and fixing bugs, tracing errors',                                colorClass: 'context-blue' },
  team_leadership:      { icon: '\u{1F465}',       label: 'Team Leadership',  description: 'Managing teams, culture, performance, hiring',                           colorClass: 'context-green' },
  one_on_one:           { icon: '\u{1F91D}',       label: 'One-on-One',       description: 'Coaching, feedback, career development conversations',                   colorClass: 'context-green' },
  sales_pitch:          { icon: '\u{1F4C8}',       label: 'Sales',            description: 'Pitching, proposals, value positioning, closing',                        colorClass: 'context-purple' },
  negotiation:          { icon: '\u2696\uFE0F',    label: 'Negotiation',      description: 'Contract terms, compensation, vendor discussions',                       colorClass: 'context-purple' },
  marketing_content:    { icon: '\u{1F4E3}',       label: 'Marketing',        description: 'Positioning, messaging, audience building, campaigns',                   colorClass: 'context-purple' },
  strategic_planning:   { icon: '\u{1F3AF}',       label: 'Strategy',         description: 'Roadmaps, priorities, resource allocation, OKRs',                        colorClass: 'context-orange' },
  decision_making:      { icon: '\u2696\uFE0F',    label: 'Decision',         description: 'Weighing options, trade-offs, choosing between paths',                   colorClass: 'context-orange' },
  creative_work:        { icon: '\u{1F4A1}',       label: 'Creative',         description: 'Brainstorming, ideation, creative problem solving',                      colorClass: 'context-teal' },
  writing_content:      { icon: '\u270D\uFE0F',    label: 'Writing',          description: 'Blog posts, articles, documentation, drafting',                          colorClass: 'context-teal' },
  learning_research:    { icon: '\u{1F4DA}',       label: 'Learning',         description: 'Understanding concepts, deep dives, research',                           colorClass: 'context-gray' },
  personal_development: { icon: '\u{1F331}',       label: 'Growth',           description: 'Career planning, skills, growth, interviews',                            colorClass: 'context-gray' },
  general:              { icon: '\u{1F4AC}',       label: 'General',          description: 'General conversation and assistance',                                    colorClass: 'context-gray' },
};

export const ALL_DOMAINS = Object.keys(DOMAIN_META) as ContextDomain[];

// ── Emotional register labels ────────────────────────────────────────────────

export const EMOTIONAL_LABELS: Partial<Record<EmotionalRegister, string>> = {
  stressed:    '\u00B7 Under Pressure',
  frustrated:  '\u00B7 Working Through It',
  uncertain:   '\u00B7 Exploring',
  excited:     '\u00B7 Energized',
  celebratory: '\u00B7 Celebrating',
};
