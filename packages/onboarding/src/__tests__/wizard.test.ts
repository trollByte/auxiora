import { describe, it, expect } from 'vitest';
import { OnboardingWizard } from '../wizard.js';
import type { PersonalityTemplate } from '@auxiora/personality';

describe('OnboardingWizard', () => {
  const wizard = new OnboardingWizard();

  describe('getSteps', () => {
    it('should return all onboarding steps', () => {
      const steps = wizard.getSteps([]);
      expect(steps).toHaveLength(6);
      expect(steps.map((s) => s.id)).toEqual([
        'agentName',
        'pronouns',
        'personality',
        'provider',
        'apiKey',
        'channels',
      ]);
    });

    it('should include personality templates as choices when provided', () => {
      const templates: PersonalityTemplate[] = [
        { id: 'witty', name: 'Witty', description: 'Clever humor', preview: 'Ha!', soulContent: '' },
        { id: 'calm', name: 'Calm', description: 'Serene', preview: 'Peace', soulContent: '' },
      ];

      const steps = wizard.getSteps(templates);
      const personalityStep = steps.find((s) => s.id === 'personality');
      expect(personalityStep).toBeDefined();
      expect(personalityStep!.choices).toHaveLength(2);
      expect(personalityStep!.choices![0].value).toBe('witty');
      expect(personalityStep!.choices![1].value).toBe('calm');
    });

    it('should provide fallback personality choices when no templates given', () => {
      const steps = wizard.getSteps([]);
      const personalityStep = steps.find((s) => s.id === 'personality');
      expect(personalityStep!.choices).toHaveLength(2);
      expect(personalityStep!.choices![0].value).toBe('professional');
      expect(personalityStep!.choices![1].value).toBe('friendly');
    });

    it('should have correct step types', () => {
      const steps = wizard.getSteps([]);
      const typeMap = Object.fromEntries(steps.map((s) => [s.id, s.type]));
      expect(typeMap).toEqual({
        agentName: 'text',
        pronouns: 'select',
        personality: 'select',
        provider: 'select',
        apiKey: 'password',
        channels: 'multiselect',
      });
    });

    it('should include pronoun choices', () => {
      const steps = wizard.getSteps([]);
      const pronounStep = steps.find((s) => s.id === 'pronouns');
      expect(pronounStep!.choices!.map((c) => c.value)).toEqual([
        'she/her', 'he/him', 'they/them', 'it/its',
      ]);
    });

    it('should include provider choices', () => {
      const steps = wizard.getSteps([]);
      const providerStep = steps.find((s) => s.id === 'provider');
      expect(providerStep!.choices!.map((c) => c.value)).toEqual([
        'anthropic', 'openai',
      ]);
    });

    it('should include channel choices', () => {
      const steps = wizard.getSteps([]);
      const channelStep = steps.find((s) => s.id === 'channels');
      expect(channelStep!.choices!.map((c) => c.value)).toEqual([
        'webchat', 'discord', 'telegram', 'slack',
      ]);
    });
  });

  describe('buildAnswers', () => {
    it('should normalize raw answers into OnboardingAnswers', () => {
      const raw = {
        agentName: 'Luna',
        pronouns: 'she/her',
        personality: 'witty',
        provider: 'anthropic',
        apiKey: 'sk-test-123',
        channels: ['webchat', 'discord'],
      };

      const answers = wizard.buildAnswers(raw);

      expect(answers.agentName).toBe('Luna');
      expect(answers.pronouns).toBe('she/her');
      expect(answers.personality).toBe('witty');
      expect(answers.provider).toBe('anthropic');
      expect(answers.apiKey).toBe('sk-test-123');
      expect(answers.channels).toEqual(['webchat', 'discord']);
    });

    it('should use defaults for missing values', () => {
      const answers = wizard.buildAnswers({});

      expect(answers.agentName).toBe('Auxiora');
      expect(answers.pronouns).toBe('they/them');
      expect(answers.personality).toBe('professional');
      expect(answers.provider).toBe('anthropic');
      expect(answers.apiKey).toBe('');
      expect(answers.channels).toEqual(['webchat']);
    });

    it('should default to anthropic for unknown providers', () => {
      const answers = wizard.buildAnswers({ provider: 'unknown' });
      expect(answers.provider).toBe('anthropic');
    });

    it('should default to webchat if channels array is empty', () => {
      const answers = wizard.buildAnswers({ channels: [] });
      expect(answers.channels).toEqual(['webchat']);
    });

    it('should handle non-array channels by defaulting to webchat', () => {
      const answers = wizard.buildAnswers({ channels: 'discord' });
      expect(answers.channels).toEqual(['webchat']);
    });
  });
});
