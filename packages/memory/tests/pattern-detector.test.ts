import { describe, it, expect } from 'vitest';
import { PatternDetector } from '../src/pattern-detector.js';

describe('PatternDetector', () => {
  const detector = new PatternDetector();

  it('should return empty for too few messages', () => {
    const signals = detector.detect([
      { content: 'hi', role: 'user', timestamp: Date.now() },
    ]);
    expect(signals).toHaveLength(0);
  });

  it('should detect brief message pattern', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      content: 'short msg',
      role: 'user',
      timestamp: Date.now() + i * 1000,
    }));

    const signals = detector.detect(messages);
    const commSignals = signals.filter(s => s.type === 'communication');
    expect(commSignals.some(s => s.pattern.includes('brief'))).toBe(true);
  });

  it('should detect detailed message pattern', () => {
    const longContent = 'This is a very detailed message about various topics that goes on for quite a while and contains much information and many words to push the character count above two hundred characters easily and without much difficulty at all.';
    const messages = Array.from({ length: 10 }, (_, i) => ({
      content: longContent,
      role: 'user',
      timestamp: Date.now() + i * 1000,
    }));

    const signals = detector.detect(messages);
    const commSignals = signals.filter(s => s.type === 'communication');
    expect(commSignals.some(s => s.pattern.includes('detailed'))).toBe(true);
  });

  it('should detect question-heavy pattern', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      content: `What is the answer to question ${i}?`,
      role: 'user',
      timestamp: Date.now() + i * 1000,
    }));

    const signals = detector.detect(messages);
    const commSignals = signals.filter(s => s.type === 'communication');
    expect(commSignals.some(s => s.pattern.includes('questions'))).toBe(true);
  });

  it('should detect code-heavy pattern', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      content: `const value${i} = ${i}; function doSomething() {}`,
      role: 'user',
      timestamp: Date.now() + i * 1000,
    }));

    const signals = detector.detect(messages);
    const commSignals = signals.filter(s => s.type === 'communication');
    expect(commSignals.some(s => s.pattern.includes('code'))).toBe(true);
  });

  it('should detect schedule patterns', () => {
    // All messages at 10 PM
    const messages = Array.from({ length: 10 }, (_, i) => {
      const date = new Date();
      date.setHours(22, 0, 0, 0);
      date.setDate(date.getDate() - i);
      return {
        content: `Working late on day ${i}`,
        role: 'user',
        timestamp: date.getTime(),
      };
    });

    const signals = detector.detect(messages);
    const scheduleSignals = signals.filter(s => s.type === 'schedule');
    expect(scheduleSignals.length).toBeGreaterThanOrEqual(1);
    expect(scheduleSignals[0].pattern).toContain('active');
  });

  it('should detect topic patterns', () => {
    const messages = [
      { content: 'TypeScript generics are tricky', role: 'user', timestamp: Date.now() },
      { content: 'TypeScript types need work', role: 'user', timestamp: Date.now() + 1000 },
      { content: 'TypeScript compiler is slow', role: 'user', timestamp: Date.now() + 2000 },
      { content: 'React components need TypeScript', role: 'user', timestamp: Date.now() + 3000 },
      { content: 'TypeScript interfaces rock', role: 'user', timestamp: Date.now() + 4000 },
      { content: 'Need help with TypeScript React', role: 'user', timestamp: Date.now() + 5000 },
    ];

    const signals = detector.detect(messages);
    const topicSignals = signals.filter(s => s.type === 'topic');
    expect(topicSignals.length).toBeGreaterThanOrEqual(1);
    expect(topicSignals[0].pattern).toContain('typescript');
  });

  it('should detect enthusiastic mood', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      content: `This is amazing! Great work! I love it!`,
      role: 'user',
      timestamp: Date.now() + i * 1000,
    }));

    const signals = detector.detect(messages);
    const moodSignals = signals.filter(s => s.type === 'mood');
    expect(moodSignals.some(s => s.pattern.includes('enthusiastic'))).toBe(true);
  });

  it('should detect casual mood', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      content: `lol tbh gonna try this haha`,
      role: 'user',
      timestamp: Date.now() + i * 1000,
    }));

    const signals = detector.detect(messages);
    const moodSignals = signals.filter(s => s.type === 'mood');
    expect(moodSignals.some(s => s.pattern.includes('casual'))).toBe(true);
  });

  it('should only analyze user messages', () => {
    const messages = [
      { content: 'hi', role: 'user', timestamp: Date.now() },
      { content: 'Hello! How can I help?', role: 'assistant', timestamp: Date.now() + 1000 },
      { content: 'thanks', role: 'user', timestamp: Date.now() + 2000 },
      { content: 'You are welcome!', role: 'assistant', timestamp: Date.now() + 3000 },
    ];

    // Should return empty because only 2 user messages (need >= 5 for most patterns)
    const signals = detector.detect(messages);
    // Communication patterns require >= 5 user messages
    const commSignals = signals.filter(s => s.type === 'communication');
    expect(commSignals).toHaveLength(0);
  });

  it('should have confidence between 0 and 1', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      content: 'short',
      role: 'user',
      timestamp: Date.now() + i * 1000,
    }));

    const signals = detector.detect(messages);
    for (const s of signals) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });
});
