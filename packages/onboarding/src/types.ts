export interface OnboardingAnswers {
  agentName: string;
  pronouns: string;
  personality: string;
  provider: 'anthropic' | 'openai';
  apiKey: string;
  channels: string[];
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
