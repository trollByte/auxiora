import type { DesktopOnboardingStep, DesktopOnboardingAnswers } from './types.js';

const HOTKEY_CHOICES = [
  { name: 'Ctrl+Shift+A', value: 'CommandOrControl+Shift+A', description: 'Default hotkey' },
  { name: 'Ctrl+Space', value: 'CommandOrControl+Space', description: 'Quick access' },
  { name: 'Ctrl+Shift+Space', value: 'CommandOrControl+Shift+Space', description: 'Alternative' },
];

export class DesktopOnboardingWizard {
  getSteps(): DesktopOnboardingStep[] {
    return [
      {
        id: 'autoStart',
        prompt: 'Start Auxiora automatically when you log in?',
        type: 'toggle',
        default: false,
      },
      {
        id: 'hotkey',
        prompt: 'Choose a global hotkey to toggle Auxiora:',
        type: 'select',
        choices: HOTKEY_CHOICES,
        default: 'CommandOrControl+Shift+A',
      },
      {
        id: 'notificationsEnabled',
        prompt: 'Enable desktop notifications?',
        type: 'toggle',
        default: true,
      },
      {
        id: 'ollamaEnabled',
        prompt: 'Enable bundled Ollama for local AI models?',
        type: 'toggle',
        default: false,
      },
    ];
  }

  buildAnswers(raw: Record<string, unknown>): DesktopOnboardingAnswers {
    return {
      autoStart: raw.autoStart === true,
      hotkey: typeof raw.hotkey === 'string' && raw.hotkey.length > 0
        ? raw.hotkey
        : 'CommandOrControl+Shift+A',
      notificationsEnabled: raw.notificationsEnabled !== false,
      ollamaEnabled: raw.ollamaEnabled === true,
    };
  }
}
