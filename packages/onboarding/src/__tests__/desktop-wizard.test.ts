import { describe, it, expect } from 'vitest';
import { DesktopOnboardingWizard } from '../desktop-wizard.js';

describe('DesktopOnboardingWizard', () => {
  const wizard = new DesktopOnboardingWizard();

  describe('getSteps', () => {
    it('should return all desktop onboarding steps', () => {
      const steps = wizard.getSteps();
      expect(steps).toHaveLength(4);
      expect(steps.map((s) => s.id)).toEqual([
        'autoStart',
        'hotkey',
        'notificationsEnabled',
        'ollamaEnabled',
      ]);
    });

    it('should have correct step types', () => {
      const steps = wizard.getSteps();
      const typeMap = Object.fromEntries(steps.map((s) => [s.id, s.type]));
      expect(typeMap).toEqual({
        autoStart: 'toggle',
        hotkey: 'select',
        notificationsEnabled: 'toggle',
        ollamaEnabled: 'toggle',
      });
    });

    it('should include hotkey choices', () => {
      const steps = wizard.getSteps();
      const hotkeyStep = steps.find((s) => s.id === 'hotkey');
      expect(hotkeyStep!.choices).toBeDefined();
      expect(hotkeyStep!.choices!.length).toBeGreaterThanOrEqual(2);
      expect(hotkeyStep!.choices![0].value).toContain('Shift+A');
    });

    it('should have appropriate defaults', () => {
      const steps = wizard.getSteps();
      const defaults = Object.fromEntries(steps.map((s) => [s.id, s.default]));
      expect(defaults.autoStart).toBe(false);
      expect(defaults.notificationsEnabled).toBe(true);
      expect(defaults.ollamaEnabled).toBe(false);
    });
  });

  describe('buildAnswers', () => {
    it('should normalize raw answers', () => {
      const answers = wizard.buildAnswers({
        autoStart: true,
        hotkey: 'CommandOrControl+Space',
        notificationsEnabled: true,
        ollamaEnabled: false,
      });

      expect(answers.autoStart).toBe(true);
      expect(answers.hotkey).toBe('CommandOrControl+Space');
      expect(answers.notificationsEnabled).toBe(true);
      expect(answers.ollamaEnabled).toBe(false);
    });

    it('should use defaults for missing values', () => {
      const answers = wizard.buildAnswers({});
      expect(answers.autoStart).toBe(false);
      expect(answers.hotkey).toBe('CommandOrControl+Shift+A');
      expect(answers.notificationsEnabled).toBe(true);
      expect(answers.ollamaEnabled).toBe(false);
    });

    it('should default hotkey when empty string given', () => {
      const answers = wizard.buildAnswers({ hotkey: '' });
      expect(answers.hotkey).toBe('CommandOrControl+Shift+A');
    });

    it('should treat non-boolean autoStart as false', () => {
      const answers = wizard.buildAnswers({ autoStart: 'yes' });
      expect(answers.autoStart).toBe(false);
    });
  });
});
