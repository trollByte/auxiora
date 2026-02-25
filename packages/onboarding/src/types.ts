export type OnboardingVariant = 'server' | 'desktop';

export interface OnboardingAnswers {
  agentName: string;
  pronouns: string;
  personality: string;
  provider: 'anthropic' | 'openai';
  apiKey: string;
  channels: string[];
}

export interface DesktopOnboardingStep {
  id: string;
  prompt: string;
  type: 'text' | 'select' | 'toggle' | 'hotkey';
  choices?: OnboardingChoice[];
  default?: string | boolean;
}

export interface DesktopOnboardingAnswers {
  autoStart: boolean;
  hotkey: string;
  notificationsEnabled: boolean;
  ollamaEnabled: boolean;
}

export interface OnboardingStep {
  id: string;
  prompt: string;
  type: 'text' | 'select' | 'password' | 'multiselect';
  choices?: OnboardingChoice[];
  default?: string;
}

export interface OnboardingChoice {
  name: string;
  value: string;
  description?: string;
}
