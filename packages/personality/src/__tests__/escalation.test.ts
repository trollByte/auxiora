import { describe, it, expect } from 'vitest';
import {
  EscalationStateMachine,
  ESCALATION_LEVELS,
  SEVERITY_LEVELS,
  RESPONSE_CATEGORIES,
  ESCALATION_TABLE,
} from '../escalation.js';
import type { ToneSettings } from '../types.js';

describe('Escalation', () => {
  describe('constants', () => {
    it('should have 4 escalation levels', () => {
      expect(ESCALATION_LEVELS).toHaveLength(4);
      expect(ESCALATION_LEVELS).toEqual(['normal', 'caution', 'serious', 'lockdown']);
    });

    it('should have 4 severity levels', () => {
      expect(SEVERITY_LEVELS).toHaveLength(4);
    });

    it('should have 8 response categories', () => {
      expect(RESPONSE_CATEGORIES).toHaveLength(8);
    });

    it('should have escalation table entries for all categories', () => {
      for (const cat of RESPONSE_CATEGORIES) {
        expect(ESCALATION_TABLE[cat]).toBeDefined();
        expect(ESCALATION_TABLE[cat].severity).toBeDefined();
        expect(ESCALATION_TABLE[cat].canonicalPhrase).toBeDefined();
      }
    });
  });

  describe('EscalationStateMachine', () => {
    it('should start at normal level', () => {
      const sm = new EscalationStateMachine();
      expect(sm.getState().level).toBe('normal');
    });

    it('should escalate normal → caution on low severity event', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('uncertainty');
      expect(sm.getState().level).toBe('caution');
    });

    it('should escalate normal → serious on medium severity event', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('access_failure');
      expect(sm.getState().level).toBe('serious');
    });

    it('should escalate normal → lockdown on high severity event', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('destructive_confirmation');
      expect(sm.getState().level).toBe('lockdown');
    });

    it('should escalate normal → lockdown on critical severity event', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('security_incident');
      expect(sm.getState().level).toBe('lockdown');
    });

    it('should not de-escalate from an event', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('security_incident'); // → lockdown
      sm.processEvent('uncertainty'); // low → should NOT de-escalate
      expect(sm.getState().level).toBe('lockdown');
    });

    it('should escalate caution → serious on medium event', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('rate_limit'); // → caution
      sm.processEvent('provider_unavailable'); // → serious
      expect(sm.getState().level).toBe('serious');
    });

    it('should track lastEvent', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('rate_limit');
      expect(sm.getState().lastEvent).toBe('rate_limit');
    });

    it('should set enteredAt timestamp', () => {
      const sm = new EscalationStateMachine();
      const before = Date.now();
      sm.processEvent('uncertainty');
      const after = Date.now();
      const state = sm.getState();
      expect(state.enteredAt).toBeDefined();
      expect(state.enteredAt!).toBeGreaterThanOrEqual(before);
      expect(state.enteredAt!).toBeLessThanOrEqual(after);
    });
  });

  describe('resolve', () => {
    it('should resolve lockdown → normal', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('security_incident');
      sm.resolve();
      expect(sm.getState().level).toBe('normal');
    });

    it('should resolve serious → normal', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('access_failure');
      sm.resolve();
      expect(sm.getState().level).toBe('normal');
    });

    it('should resolve caution → normal', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('uncertainty');
      sm.resolve();
      expect(sm.getState().level).toBe('normal');
    });

    it('should remain normal when resolving from normal', () => {
      const sm = new EscalationStateMachine();
      sm.resolve();
      expect(sm.getState().level).toBe('normal');
    });
  });

  describe('dampenTone', () => {
    const baseTone: ToneSettings = {
      warmth: 0.8,
      directness: 0.5,
      humor: 0.6,
      formality: 0.3,
    };

    it('should not change tone at normal level', () => {
      const sm = new EscalationStateMachine();
      const result = sm.dampenTone(baseTone);
      expect(result).toEqual(baseTone);
    });

    it('should halve humor at caution level', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('uncertainty');
      const result = sm.dampenTone(baseTone);
      expect(result.humor).toBe(0.3); // 0.6 * 0.5
      expect(result.warmth).toBe(baseTone.warmth);
    });

    it('should zero humor and raise directness at serious level', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('access_failure');
      const result = sm.dampenTone(baseTone);
      expect(result.humor).toBe(0);
      expect(result.directness).toBe(0.6); // raised from 0.5
    });

    it('should keep directness if already above 0.6 at serious level', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('access_failure');
      const result = sm.dampenTone({ ...baseTone, directness: 0.8 });
      expect(result.directness).toBe(0.8);
    });

    it('should apply full security floor at lockdown level', () => {
      const sm = new EscalationStateMachine();
      sm.processEvent('security_incident');
      const result = sm.dampenTone(baseTone);
      expect(result.humor).toBe(0);
      expect(result.directness).toBeGreaterThanOrEqual(0.7);
      expect(result.formality).toBeGreaterThanOrEqual(0.5);
    });
  });
});
