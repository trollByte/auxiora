import type { OnboardingStep, OnboardingChoice } from './types.js';

export interface PreferenceProfile {
  /** Communication style: concise, balanced, detailed */
  communicationStyle: string;
  /** Technical depth: beginner, intermediate, expert */
  technicalDepth: string;
  /** Tone: formal, friendly, casual */
  tone: string;
  /** Proactivity: reactive, balanced, proactive */
  proactivity: string;
  /** Primary use cases */
  useCases: string[];
  /** Work hours preference: morning, afternoon, evening, flexible */
  workHours: string;
  /** Feedback style: direct, gentle, balanced */
  feedbackStyle: string;
  /** Privacy level: minimal, standard, maximum */
  privacyLevel: string;
}

const COMMUNICATION_CHOICES: OnboardingChoice[] = [
  { name: 'Concise', value: 'concise', description: 'Short, to-the-point responses' },
  { name: 'Balanced', value: 'balanced', description: 'Medium-length, well-structured' },
  { name: 'Detailed', value: 'detailed', description: 'Thorough explanations with examples' },
];

const TECHNICAL_CHOICES: OnboardingChoice[] = [
  { name: 'Beginner', value: 'beginner', description: 'Explain concepts simply' },
  { name: 'Intermediate', value: 'intermediate', description: 'Some technical depth' },
  { name: 'Expert', value: 'expert', description: 'Full technical depth, skip basics' },
];

const TONE_CHOICES: OnboardingChoice[] = [
  { name: 'Formal', value: 'formal', description: 'Professional and structured' },
  { name: 'Friendly', value: 'friendly', description: 'Warm but professional' },
  { name: 'Casual', value: 'casual', description: 'Relaxed and conversational' },
];

const PROACTIVITY_CHOICES: OnboardingChoice[] = [
  { name: 'Reactive', value: 'reactive', description: 'Only respond when asked' },
  { name: 'Balanced', value: 'balanced', description: 'Suggest when relevant' },
  { name: 'Proactive', value: 'proactive', description: 'Actively suggest and remind' },
];

const USE_CASE_CHOICES: OnboardingChoice[] = [
  { name: 'Research', value: 'research', description: 'Information lookup and synthesis' },
  { name: 'Writing', value: 'writing', description: 'Content creation and editing' },
  { name: 'Coding', value: 'coding', description: 'Software development' },
  { name: 'Task Management', value: 'tasks', description: 'Scheduling and reminders' },
];

const WORK_HOURS_CHOICES: OnboardingChoice[] = [
  { name: 'Morning (6am-12pm)', value: 'morning' },
  { name: 'Afternoon (12pm-6pm)', value: 'afternoon' },
  { name: 'Evening (6pm-12am)', value: 'evening' },
  { name: 'Flexible', value: 'flexible' },
];

const FEEDBACK_CHOICES: OnboardingChoice[] = [
  { name: 'Direct', value: 'direct', description: 'Be straightforward, even blunt' },
  { name: 'Gentle', value: 'gentle', description: 'Soften criticism, emphasize positives' },
  { name: 'Balanced', value: 'balanced', description: 'Honest but diplomatic' },
];

const PRIVACY_CHOICES: OnboardingChoice[] = [
  { name: 'Minimal', value: 'minimal', description: 'Remember as little as possible' },
  { name: 'Standard', value: 'standard', description: 'Remember relevant preferences and facts' },
  { name: 'Maximum', value: 'maximum', description: 'Learn and remember everything possible' },
];

export class PreferenceBootstrap {
  /**
   * Return preference questions as OnboardingStep[]
   */
  getSteps(): OnboardingStep[] {
    return [
      {
        id: 'communicationStyle',
        prompt: 'How do you prefer responses?',
        type: 'select',
        choices: COMMUNICATION_CHOICES,
        default: 'balanced',
      },
      {
        id: 'technicalDepth',
        prompt: 'What technical level are you comfortable with?',
        type: 'select',
        choices: TECHNICAL_CHOICES,
        default: 'intermediate',
      },
      {
        id: 'tone',
        prompt: 'What tone do you prefer?',
        type: 'select',
        choices: TONE_CHOICES,
        default: 'friendly',
      },
      {
        id: 'proactivity',
        prompt: 'How proactive should the assistant be?',
        type: 'select',
        choices: PROACTIVITY_CHOICES,
        default: 'balanced',
      },
      {
        id: 'useCases',
        prompt: 'What will you primarily use the assistant for?',
        type: 'multiselect',
        choices: USE_CASE_CHOICES,
        default: 'research',
      },
      {
        id: 'workHours',
        prompt: 'When are you most active?',
        type: 'select',
        choices: WORK_HOURS_CHOICES,
        default: 'flexible',
      },
      {
        id: 'feedbackStyle',
        prompt: 'How should the assistant give feedback?',
        type: 'select',
        choices: FEEDBACK_CHOICES,
        default: 'balanced',
      },
      {
        id: 'privacyLevel',
        prompt: 'How much should the assistant remember about you?',
        type: 'select',
        choices: PRIVACY_CHOICES,
        default: 'standard',
      },
    ];
  }

  /**
   * Build a PreferenceProfile from raw answers.
   */
  buildProfile(raw: Record<string, unknown>): PreferenceProfile {
    const useCases = raw.useCases;
    const useCaseList = Array.isArray(useCases) ? useCases.map(String) : ['research'];

    return {
      communicationStyle: String(raw.communicationStyle || 'balanced'),
      technicalDepth: String(raw.technicalDepth || 'intermediate'),
      tone: String(raw.tone || 'friendly'),
      proactivity: String(raw.proactivity || 'balanced'),
      useCases: useCaseList,
      workHours: String(raw.workHours || 'flexible'),
      feedbackStyle: String(raw.feedbackStyle || 'balanced'),
      privacyLevel: String(raw.privacyLevel || 'standard'),
    };
  }

  /**
   * Convert a profile to trait weight hints for The Architect.
   * Returns a record of trait names to suggested initial offsets (-0.3 to +0.3).
   */
  toTraitHints(profile: PreferenceProfile): Record<string, number> {
    const hints: Record<string, number> = {};

    // Communication style -> verbosity traits
    if (profile.communicationStyle === 'concise') hints['brevity'] = 0.2;
    if (profile.communicationStyle === 'detailed') hints['brevity'] = -0.2;

    // Technical depth
    if (profile.technicalDepth === 'expert') hints['firstPrinciples'] = 0.15;
    if (profile.technicalDepth === 'beginner') hints['firstPrinciples'] = -0.15;

    // Tone
    if (profile.tone === 'formal') hints['formality'] = 0.2;
    if (profile.tone === 'casual') hints['formality'] = -0.2;

    // Proactivity
    if (profile.proactivity === 'proactive') hints['initiative'] = 0.2;
    if (profile.proactivity === 'reactive') hints['initiative'] = -0.2;

    // Feedback style
    if (profile.feedbackStyle === 'direct') hints['directness'] = 0.2;
    if (profile.feedbackStyle === 'gentle') hints['directness'] = -0.2;

    return hints;
  }
}
