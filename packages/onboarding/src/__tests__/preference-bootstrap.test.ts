import { describe, it, expect } from 'vitest';
import { PreferenceBootstrap } from '../preference-bootstrap.js';
import type { PreferenceProfile } from '../preference-bootstrap.js';

describe('PreferenceBootstrap', () => {
  const bootstrap = new PreferenceBootstrap();

  describe('getSteps', () => {
    it('should return 8 preference steps', () => {
      const steps = bootstrap.getSteps();
      expect(steps).toHaveLength(8);
    });

    it('should have required fields on every step', () => {
      const steps = bootstrap.getSteps();
      for (const step of steps) {
        expect(step.id).toBeTruthy();
        expect(step.prompt).toBeTruthy();
        expect(step.type).toBeTruthy();
        expect(step.choices).toBeDefined();
        expect(step.choices!.length).toBeGreaterThan(0);
      }
    });

    it('should have expected step ids in order', () => {
      const steps = bootstrap.getSteps();
      expect(steps.map((s) => s.id)).toEqual([
        'communicationStyle',
        'technicalDepth',
        'tone',
        'proactivity',
        'useCases',
        'workHours',
        'feedbackStyle',
        'privacyLevel',
      ]);
    });
  });

  describe('buildProfile', () => {
    it('should build a profile with all fields populated', () => {
      const raw = {
        communicationStyle: 'concise',
        technicalDepth: 'expert',
        tone: 'formal',
        proactivity: 'proactive',
        useCases: ['coding', 'research'],
        workHours: 'morning',
        feedbackStyle: 'direct',
        privacyLevel: 'maximum',
      };

      const profile = bootstrap.buildProfile(raw);

      expect(profile.communicationStyle).toBe('concise');
      expect(profile.technicalDepth).toBe('expert');
      expect(profile.tone).toBe('formal');
      expect(profile.proactivity).toBe('proactive');
      expect(profile.useCases).toEqual(['coding', 'research']);
      expect(profile.workHours).toBe('morning');
      expect(profile.feedbackStyle).toBe('direct');
      expect(profile.privacyLevel).toBe('maximum');
    });

    it('should use defaults for missing fields', () => {
      const profile = bootstrap.buildProfile({});

      expect(profile.communicationStyle).toBe('balanced');
      expect(profile.technicalDepth).toBe('intermediate');
      expect(profile.tone).toBe('friendly');
      expect(profile.proactivity).toBe('balanced');
      expect(profile.useCases).toEqual(['research']);
      expect(profile.workHours).toBe('flexible');
      expect(profile.feedbackStyle).toBe('balanced');
      expect(profile.privacyLevel).toBe('standard');
    });

    it('should normalize useCases to array when not an array', () => {
      const profile = bootstrap.buildProfile({ useCases: 'coding' });
      expect(profile.useCases).toEqual(['research']);
    });

    it('should preserve useCases array as-is', () => {
      const profile = bootstrap.buildProfile({ useCases: ['writing', 'tasks'] });
      expect(profile.useCases).toEqual(['writing', 'tasks']);
    });
  });

  describe('toTraitHints', () => {
    it('should set brevity positive for concise style', () => {
      const profile = buildDefaultProfile({ communicationStyle: 'concise' });
      const hints = bootstrap.toTraitHints(profile);
      expect(hints['brevity']).toBe(0.2);
    });

    it('should set brevity negative for detailed style', () => {
      const profile = buildDefaultProfile({ communicationStyle: 'detailed' });
      const hints = bootstrap.toTraitHints(profile);
      expect(hints['brevity']).toBe(-0.2);
    });

    it('should set firstPrinciples positive for expert depth', () => {
      const profile = buildDefaultProfile({ technicalDepth: 'expert' });
      const hints = bootstrap.toTraitHints(profile);
      expect(hints['firstPrinciples']).toBe(0.15);
    });

    it('should set formality positive for formal tone', () => {
      const profile = buildDefaultProfile({ tone: 'formal' });
      const hints = bootstrap.toTraitHints(profile);
      expect(hints['formality']).toBe(0.2);
    });

    it('should return empty hints for all-balanced/default profile', () => {
      const profile = buildDefaultProfile({});
      const hints = bootstrap.toTraitHints(profile);
      expect(Object.keys(hints)).toHaveLength(0);
    });

    it('should keep all hint values within -0.3 to 0.3 range', () => {
      // Test with all extreme settings
      const profile: PreferenceProfile = {
        communicationStyle: 'concise',
        technicalDepth: 'expert',
        tone: 'formal',
        proactivity: 'proactive',
        useCases: ['coding'],
        workHours: 'morning',
        feedbackStyle: 'direct',
        privacyLevel: 'maximum',
      };

      const hints = bootstrap.toTraitHints(profile);
      for (const [key, value] of Object.entries(hints)) {
        expect(value, `hint "${key}" should be within [-0.3, 0.3]`).toBeGreaterThanOrEqual(-0.3);
        expect(value, `hint "${key}" should be within [-0.3, 0.3]`).toBeLessThanOrEqual(0.3);
      }
    });

    it('should set initiative positive for proactive', () => {
      const profile = buildDefaultProfile({ proactivity: 'proactive' });
      const hints = bootstrap.toTraitHints(profile);
      expect(hints['initiative']).toBe(0.2);
    });

    it('should set directness negative for gentle feedback', () => {
      const profile = buildDefaultProfile({ feedbackStyle: 'gentle' });
      const hints = bootstrap.toTraitHints(profile);
      expect(hints['directness']).toBe(-0.2);
    });
  });
});

/** Helper to build a default profile with selective overrides */
function buildDefaultProfile(overrides: Partial<PreferenceProfile>): PreferenceProfile {
  return {
    communicationStyle: 'balanced',
    technicalDepth: 'intermediate',
    tone: 'friendly',
    proactivity: 'balanced',
    useCases: ['research'],
    workHours: 'flexible',
    feedbackStyle: 'balanced',
    privacyLevel: 'standard',
    ...overrides,
  };
}
