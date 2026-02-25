import type { PersonalityTemplate } from '@auxiora/personality';
import type { OnboardingAnswers, OnboardingStep, OnboardingChoice } from './types.js';

const PRONOUN_CHOICES: OnboardingChoice[] = [
  { name: 'she/her', value: 'she/her' },
  { name: 'he/him', value: 'he/him' },
  { name: 'they/them', value: 'they/them' },
  { name: 'it/its', value: 'it/its' },
];

const PROVIDER_CHOICES: OnboardingChoice[] = [
  { name: 'Anthropic (Claude)', value: 'anthropic', description: 'Uses Claude models' },
  { name: 'OpenAI (GPT)', value: 'openai', description: 'Uses GPT models' },
];

const CHANNEL_CHOICES: OnboardingChoice[] = [
  { name: 'Webchat', value: 'webchat', description: 'Built-in browser interface' },
  { name: 'Discord', value: 'discord', description: 'Discord bot integration' },
  { name: 'Telegram', value: 'telegram', description: 'Telegram bot integration' },
  { name: 'Slack', value: 'slack', description: 'Slack app integration' },
];

export class OnboardingWizard {
  /**
   * Return all onboarding steps in order.
   * Each step declares WHAT to ask; the caller decides HOW to render it.
   */
  getSteps(templates: PersonalityTemplate[]): OnboardingStep[] {
    const personalityChoices: OnboardingChoice[] = templates.map((t) => ({
      name: t.name,
      value: t.id,
      description: t.preview || t.description,
    }));

    // Fallback if no templates available yet
    if (personalityChoices.length === 0) {
      personalityChoices.push(
        { name: 'Professional', value: 'professional', description: 'Formal and efficient' },
        { name: 'Friendly', value: 'friendly', description: 'Warm and approachable' },
      );
    }

    return [
      {
        id: 'agentName',
        prompt: 'What should your agent be called?',
        type: 'text',
        default: 'Auxiora',
      },
      {
        id: 'pronouns',
        prompt: 'What pronouns should the agent use?',
        type: 'select',
        choices: PRONOUN_CHOICES,
        default: 'they/them',
      },
      {
        id: 'personality',
        prompt: 'Pick a starting personality:',
        type: 'select',
        choices: personalityChoices,
        default: personalityChoices[0]?.value,
      },
      {
        id: 'provider',
        prompt: 'Which AI provider do you want to use?',
        type: 'select',
        choices: PROVIDER_CHOICES,
        default: 'anthropic',
      },
      {
        id: 'apiKey',
        prompt: 'Enter your API key:',
        type: 'password',
      },
      {
        id: 'channels',
        prompt: 'Where do you want to chat? (space to select, enter to confirm)',
        type: 'multiselect',
        choices: CHANNEL_CHOICES,
        default: 'webchat',
      },
    ];
  }

  /**
   * Build an OnboardingAnswers from a record of step ID -> value.
   * This validates and normalizes the raw answers.
   */
  buildAnswers(raw: Record<string, unknown>): OnboardingAnswers {
    const channels = raw.channels;
    const channelList = Array.isArray(channels) ? channels.map(String) : ['webchat'];

    return {
      agentName: String(raw.agentName || 'Auxiora'),
      pronouns: String(raw.pronouns || 'they/them'),
      personality: String(raw.personality || 'professional'),
      provider: raw.provider === 'openai' ? 'openai' : 'anthropic',
      apiKey: String(raw.apiKey || ''),
      channels: channelList.length > 0 ? channelList : ['webchat'],
    };
  }
}
