import { describe, it, expect } from 'vitest';
import { ToxicityFilter } from '../src/toxicity-filter.js';

describe('ToxicityFilter', () => {
  const filter = new ToxicityFilter();

  describe('violence detection', () => {
    it('detects direct violence threats', () => {
      const threats = filter.detect('I will kill you');
      expect(threats.length).toBeGreaterThan(0);
      expect(threats[0].level).toBe('critical');
    });

    it('detects threats with target', () => {
      const threats = filter.detect('I am going to attack them');
      expect(threats.length).toBeGreaterThan(0);
    });
  });

  describe('self-harm detection', () => {
    it('detects self-harm content', () => {
      const threats = filter.detect('I want to kill myself');
      expect(threats.length).toBeGreaterThan(0);
      expect(threats[0].level).toBe('critical');
    });
  });

  describe('hate speech detection', () => {
    it('detects group-targeted hate', () => {
      const threats = filter.detect('All of them should die');
      expect(threats.length).toBeGreaterThan(0);
    });

    it('detects genocide references', () => {
      const threats = filter.detect('genocide against them');
      expect(threats.length).toBeGreaterThan(0);
      expect(threats[0].level).toBe('high');
    });
  });

  describe('harassment detection', () => {
    it('detects personal attacks', () => {
      const threats = filter.detect("you're worthless");
      expect(threats.length).toBeGreaterThan(0);
      expect(threats[0].level).toBe('medium');
    });
  });

  describe('dangerous instructions', () => {
    it('detects weapon making requests', () => {
      const threats = filter.detect('how to make a bomb');
      expect(threats.length).toBeGreaterThan(0);
      expect(threats[0].level).toBe('high');
    });
  });

  describe('clean input', () => {
    it('returns no threats for normal text', () => {
      const threats = filter.detect('The weather is nice today. Let us go for a walk.');
      expect(threats).toHaveLength(0);
    });

    it('returns no threats for technical discussion', () => {
      const threats = filter.detect('The kill command terminates the process');
      expect(threats).toHaveLength(0);
    });
  });

  describe('threat metadata', () => {
    it('includes location information', () => {
      const threats = filter.detect('I will kill you');
      expect(threats[0].location).toBeDefined();
      expect(threats[0].location!.start).toBeGreaterThanOrEqual(0);
    });

    it('includes match text', () => {
      const threats = filter.detect('I will kill you');
      expect(threats[0].match).toBeDefined();
    });
  });
});
