import { describe, it, expect } from 'vitest';
import { SentimentAnalyzer } from '../src/sentiment.js';
import { PatternDetector } from '../src/pattern-detector.js';
import type { SentimentSnapshot } from '../src/types.js';

describe('SentimentAnalyzer', () => {
  const analyzer = new SentimentAnalyzer();

  describe('positive sentiment', () => {
    it('should detect positive sentiment from positive words', () => {
      const result = analyzer.analyzeSentiment('This is great and amazing!');
      expect(result.sentiment).toBe('positive');
      expect(result.confidence).toBeGreaterThan(0.4);
      expect(result.keywords).toContain('great');
      expect(result.keywords).toContain('amazing');
    });

    it('should detect positive sentiment from gratitude', () => {
      const result = analyzer.analyzeSentiment('Thanks so much, this is really helpful!');
      expect(result.sentiment).toBe('positive');
      expect(result.keywords).toContain('thanks');
      expect(result.keywords).toContain('helpful');
    });

    it('should detect positive sentiment from excitement', () => {
      const result = analyzer.analyzeSentiment('I love it, this is perfect and beautiful!');
      expect(result.sentiment).toBe('positive');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should boost positive sentiment with emojis', () => {
      const withoutEmoji = analyzer.analyzeSentiment('This is good');
      const withEmoji = analyzer.analyzeSentiment('This is good 😊👍');
      expect(withEmoji.confidence).toBeGreaterThanOrEqual(withoutEmoji.confidence);
    });
  });

  describe('negative sentiment', () => {
    it('should detect negative sentiment from negative words', () => {
      const result = analyzer.analyzeSentiment('This is terrible and broken');
      expect(result.sentiment).toBe('negative');
      expect(result.confidence).toBeGreaterThan(0.4);
      expect(result.keywords).toContain('terrible');
      expect(result.keywords).toContain('broken');
    });

    it('should detect negative sentiment from frustration', () => {
      const result = analyzer.analyzeSentiment('Ugh, this is so annoying and frustrating');
      expect(result.sentiment).toBe('negative');
    });

    it('should detect negative sentiment from error-related words', () => {
      const result = analyzer.analyzeSentiment('The error keeps happening, the bug is still there, it failed again');
      expect(result.sentiment).toBe('negative');
      expect(result.keywords.length).toBeGreaterThan(0);
    });

    it('should boost negative sentiment with negative emojis', () => {
      const result = analyzer.analyzeSentiment('This is bad 😢😡');
      expect(result.sentiment).toBe('negative');
    });
  });

  describe('neutral sentiment', () => {
    it('should return neutral for factual statements', () => {
      const result = analyzer.analyzeSentiment('The function takes two parameters and returns a string');
      expect(result.sentiment).toBe('neutral');
    });

    it('should return neutral for questions without sentiment', () => {
      const result = analyzer.analyzeSentiment('How do I configure the database connection?');
      expect(result.sentiment).toBe('neutral');
    });

    it('should return neutral for balanced sentiment', () => {
      const result = analyzer.analyzeSentiment('It has a good side but also a bad side');
      expect(result.sentiment).toBe('neutral');
    });
  });

  describe('negation handling', () => {
    it('should handle "not good" as less positive', () => {
      const good = analyzer.analyzeSentiment('This is good');
      const notGood = analyzer.analyzeSentiment('This is not good');
      // "not good" should be less positive or neutral/negative
      expect(notGood.sentiment !== 'positive' || notGood.confidence < good.confidence).toBe(true);
    });
  });

  describe('confidence levels', () => {
    it('should have higher confidence with more signal words', () => {
      const weak = analyzer.analyzeSentiment('This is good');
      const strong = analyzer.analyzeSentiment('This is good, great, amazing, excellent, and perfect!');
      expect(strong.confidence).toBeGreaterThanOrEqual(weak.confidence);
    });

    it('should return reasonable confidence for neutral text', () => {
      const result = analyzer.analyzeSentiment('Set the variable to 42');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('keyword extraction', () => {
    it('should return unique keywords', () => {
      const result = analyzer.analyzeSentiment('good good good');
      const uniqueCount = new Set(result.keywords).size;
      expect(result.keywords.length).toBe(uniqueCount);
    });

    it('should return empty keywords for neutral text', () => {
      const result = analyzer.analyzeSentiment('Define a variable');
      expect(result.keywords).toEqual([]);
    });
  });
});

describe('PatternDetector mood tracking', () => {
  it('should record and retrieve sentiment history', () => {
    const detector = new PatternDetector();

    const snapshot: SentimentSnapshot = {
      sentiment: 'positive',
      confidence: 0.8,
      timestamp: Date.now(),
      hour: 10,
      dayOfWeek: 1,
    };

    detector.recordSentiment(snapshot);
    const history = detector.getSentimentHistory();
    expect(history).toHaveLength(1);
    expect(history[0].sentiment).toBe('positive');
  });

  it('should detect mood patterns by time of day', () => {
    const detector = new PatternDetector();

    // Add 5 positive morning snapshots
    for (let i = 0; i < 5; i++) {
      detector.recordSentiment({
        sentiment: 'positive',
        confidence: 0.7,
        timestamp: Date.now() - i * 86400000,
        hour: 9,
        dayOfWeek: (i + 1) % 7,
      });
    }

    const signals = detector.detectMoodByTime();
    const morningSignal = signals.find(s => s.pattern.includes('morning'));
    expect(morningSignal).toBeDefined();
    expect(morningSignal!.pattern).toContain('positive');
  });

  it('should detect mood patterns by day of week', () => {
    const detector = new PatternDetector();

    // Add 4 negative Monday snapshots
    for (let i = 0; i < 4; i++) {
      detector.recordSentiment({
        sentiment: 'negative',
        confidence: 0.8,
        timestamp: Date.now() - i * 604800000,
        hour: 14,
        dayOfWeek: 1, // Monday
      });
    }

    const signals = detector.detectMoodByTime();
    const mondaySignal = signals.find(s => s.pattern.includes('Monday'));
    expect(mondaySignal).toBeDefined();
    expect(mondaySignal!.pattern).toContain('negative');
  });

  it('should not detect patterns with insufficient data', () => {
    const detector = new PatternDetector();

    detector.recordSentiment({
      sentiment: 'positive',
      confidence: 0.8,
      timestamp: Date.now(),
      hour: 10,
      dayOfWeek: 1,
    });

    const signals = detector.detectMoodByTime();
    expect(signals).toHaveLength(0);
  });

  it('should limit history to 200 snapshots', () => {
    const detector = new PatternDetector();

    for (let i = 0; i < 250; i++) {
      detector.recordSentiment({
        sentiment: 'neutral',
        confidence: 0.5,
        timestamp: Date.now() - i * 1000,
        hour: i % 24,
        dayOfWeek: i % 7,
      });
    }

    const history = detector.getSentimentHistory();
    expect(history.length).toBeLessThanOrEqual(200);
  });
});
