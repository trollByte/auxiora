import { describe, it, expect } from 'vitest';
import { TaskClassifier } from '../classifier.js';

describe('TaskClassifier', () => {
  const classifier = new TaskClassifier();

  describe('code classification', () => {
    it('should classify code-writing requests', () => {
      const result = classifier.classify('Write a function that sorts an array');
      expect(result.type).toBe('code');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify debug requests', () => {
      const result = classifier.classify('Debug this error in my TypeScript code');
      expect(result.type).toBe('code');
    });

    it('should detect code blocks', () => {
      const result = classifier.classify('What is wrong with this?\n```\nconst x = 1;\n```');
      expect(result.type).toBe('code');
    });

    it('should classify refactoring requests', () => {
      const result = classifier.classify('Refactor this class to use dependency injection');
      expect(result.type).toBe('code');
    });
  });

  describe('reasoning classification', () => {
    it('should classify analysis requests', () => {
      const result = classifier.classify('Analyze the pros and cons of microservices architecture');
      expect(result.type).toBe('reasoning');
    });

    it('should classify explanations', () => {
      const result = classifier.classify('Explain why this design pattern is useful');
      expect(result.type).toBe('reasoning');
    });
  });

  describe('creative classification', () => {
    it('should classify story writing', () => {
      const result = classifier.classify('Write a story about a robot learning to paint');
      expect(result.type).toBe('creative');
    });

    it('should classify brainstorming', () => {
      const result = classifier.classify('Brainstorm some ideas for a new product');
      expect(result.type).toBe('creative');
    });
  });

  describe('vision classification', () => {
    it('should classify image context', () => {
      const result = classifier.classify('What is in this image?', { hasImages: true });
      expect(result.type).toBe('vision');
      expect(result.requiresVision).toBe(true);
    });

    it('should classify screenshot requests', () => {
      const result = classifier.classify('Look at this screenshot and tell me what is wrong');
      expect(result.type).toBe('vision');
    });
  });

  describe('fast classification', () => {
    it('should classify short factual questions', () => {
      const result = classifier.classify('What is the capital of France?');
      expect(result.type).toBe('fast');
    });
  });

  describe('private classification', () => {
    it('should classify sensitive content', () => {
      const result = classifier.classify('Store my password securely');
      expect(result.type).toBe('private');
      expect(result.sensitivityLevel).not.toBe('normal');
    });

    it('should classify medical content', () => {
      const result = classifier.classify('Help me understand my medical records');
      expect(result.sensitivityLevel).not.toBe('normal');
    });
  });

  describe('image-gen classification', () => {
    it('should classify image generation requests', () => {
      const result = classifier.classify('Generate an image of a sunset over mountains');
      expect(result.type).toBe('image-gen');
    });

    it('should classify logo creation', () => {
      const result = classifier.classify('Make a logo for my company');
      expect(result.type).toBe('image-gen');
    });
  });

  describe('general classification', () => {
    it('should fall back to general for ambiguous messages', () => {
      const result = classifier.classify('Hello, how are you?');
      expect(result.type).toBe('general');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('token estimation', () => {
    it('should estimate input tokens', () => {
      const message = 'a'.repeat(400);
      const result = classifier.classify(message);
      expect(result.inputTokenEstimate).toBe(100);
    });
  });

  describe('tool detection', () => {
    it('should detect tool requirements', () => {
      const result = classifier.classify('Search the database for user records');
      expect(result.requiresTools).toBe(true);
    });

    it('should not flag non-tool messages', () => {
      const result = classifier.classify('Hello, how are you?');
      expect(result.requiresTools).toBe(false);
    });
  });
});
