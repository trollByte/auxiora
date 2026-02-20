import { describe, it, expect } from 'vitest';
import { ResearchIntentDetector } from '../src/intent-detector.js';

describe('ResearchIntentDetector', () => {
  const detector = new ResearchIntentDetector();

  describe('detect()', () => {
    it('scores high for complex analytical questions', () => {
      const result = detector.detect('Compare and analyze the pros and cons of React vs Vue for enterprise applications');
      expect(result.score).toBeGreaterThanOrEqual(0.6);
      expect(result.suggestedDepth).toBe('deep');
      expect(result.subtopicHints.length).toBeGreaterThan(0);
    });

    it('scores high for multi-faceted research requests', () => {
      const result = detector.detect('Research the current state of quantum computing and its implications for cryptography');
      expect(result.score).toBeGreaterThanOrEqual(0.6);
      expect(result.suggestedDepth).toBe('deep');
    });

    it('scores medium for standard fact-seeking', () => {
      const result = detector.detect('What are the latest developments in renewable energy?');
      expect(result.score).toBeGreaterThanOrEqual(0.4);
      expect(result.score).toBeLessThan(0.8);
      expect(['standard', 'deep']).toContain(result.suggestedDepth);
    });

    it('scores low for simple factual questions', () => {
      const result = detector.detect('What is the capital of France?');
      expect(result.score).toBeLessThan(0.4);
      expect(result.suggestedDepth).toBe('quick');
    });

    it('scores low for code/task requests', () => {
      const result = detector.detect('Write a function to sort an array in JavaScript');
      expect(result.score).toBeLessThan(0.3);
    });

    it('scores low for personal/conversational messages', () => {
      const result = detector.detect('Hello, how are you today?');
      expect(result.score).toBeLessThan(0.2);
    });

    it('scores high for explicit research keywords', () => {
      const result = detector.detect('Do a deep dive into microservices architecture patterns');
      expect(result.score).toBeGreaterThanOrEqual(0.6);
    });

    it('maps score to appropriate depth', () => {
      const low = detector.detect('Hi there');
      expect(low.suggestedDepth).toBe('quick');

      const high = detector.detect('Analyze and compare the different approaches to distributed consensus algorithms, their trade-offs, and real-world applications');
      expect(high.suggestedDepth).toBe('deep');
    });

    it('provides a reason string', () => {
      const result = detector.detect('Compare React and Vue frameworks');
      expect(result.reason).toBeTruthy();
      expect(typeof result.reason).toBe('string');
    });

    it('extracts subtopic hints from multi-entity questions', () => {
      const result = detector.detect('Compare React, Vue, and Angular for building large-scale applications');
      expect(result.subtopicHints.length).toBeGreaterThanOrEqual(2);
    });
  });
});
