import { describe, it, expect } from 'vitest';
import { SoulConversationBuilder } from '../conversation-builder.js';

describe('SoulConversationBuilder', () => {
  it('should start a conversation with the first question', () => {
    const builder = new SoulConversationBuilder();
    const result = builder.startConversation();

    expect(result.done).toBe(false);
    if (!result.done) {
      expect(result.question.id).toBe('name');
      expect(result.question.text).toContain('name');
    }
  });

  it('should track progress through questions', () => {
    const builder = new SoulConversationBuilder();
    builder.startConversation();
    expect(builder.getProgress()).toBe(0);

    builder.processAnswer('Nova');
    expect(builder.getProgress()).toBeGreaterThan(0);
  });

  it('should complete after all questions are answered', () => {
    const builder = new SoulConversationBuilder();
    builder.startConversation();

    const answers = [
      'Nova',                      // name
      'self_deprecating',          // error style
      '7',                         // humor
      'legal, medical',            // advice boundaries
      'health',                    // joke boundaries
      'TypeScript, DevOps',        // expertise
      'greeting=Hey there!',       // catchphrases
      'warm and casual',           // communication style
    ];

    let result;
    for (const answer of answers) {
      result = builder.processAnswer(answer);
    }

    expect(result!.done).toBe(true);
    if (result!.done) {
      expect(result!.config.name).toBe('Nova');
      expect(result!.config.errorStyle).toBe('self_deprecating');
      expect(result!.config.tone.humor).toBe(0.7);
      expect(result!.config.boundaries.neverAdviseOn).toEqual(['legal', 'medical']);
      expect(result!.config.boundaries.neverJokeAbout).toEqual(['health']);
      expect(result!.config.expertise).toEqual(['TypeScript', 'DevOps']);
      expect(result!.config.catchphrases).toEqual({ greeting: 'Hey there!' });
      expect(result!.soulMd).toContain('name: Nova');
    }
  });

  it('should return 100% progress when complete', () => {
    const builder = new SoulConversationBuilder();
    builder.startConversation();

    const answers = ['Bot', 'professional', '5', 'none', 'none', 'general', 'none', 'balanced'];
    for (const answer of answers) {
      builder.processAnswer(answer);
    }

    expect(builder.getProgress()).toBe(100);
  });

  it('should default to professional error style for invalid input', () => {
    const builder = new SoulConversationBuilder();
    builder.startConversation();

    const answers = ['Bot', 'invalid_style', '5', 'none', 'none', 'general', 'none', 'balanced'];
    let result;
    for (const answer of answers) {
      result = builder.processAnswer(answer);
    }

    expect(result!.done).toBe(true);
    if (result!.done) {
      expect(result!.config.errorStyle).toBe('professional');
    }
  });

  it('should clamp humor to valid range', () => {
    const builder = new SoulConversationBuilder();
    builder.startConversation();

    const answers = ['Bot', 'professional', '15', 'none', 'none', 'general', 'none', 'balanced'];
    let result;
    for (const answer of answers) {
      result = builder.processAnswer(answer);
    }

    expect(result!.done).toBe(true);
    if (result!.done) {
      expect(result!.config.tone.humor).toBe(1.0);
    }
  });

  it('should handle negative humor values', () => {
    const builder = new SoulConversationBuilder();
    builder.startConversation();

    const answers = ['Bot', 'professional', '-5', 'none', 'none', 'general', 'none', 'balanced'];
    let result;
    for (const answer of answers) {
      result = builder.processAnswer(answer);
    }

    expect(result!.done).toBe(true);
    if (result!.done) {
      expect(result!.config.tone.humor).toBe(0);
    }
  });

  it('should infer warm tone from communication style', () => {
    const builder = new SoulConversationBuilder();
    builder.startConversation();

    const answers = ['Bot', 'professional', '5', 'none', 'none', 'general', 'none', 'warm and friendly'];
    let result;
    for (const answer of answers) {
      result = builder.processAnswer(answer);
    }

    expect(result!.done).toBe(true);
    if (result!.done) {
      expect(result!.config.tone.warmth).toBe(0.8);
      expect(result!.config.tone.formality).toBe(0.2);
    }
  });

  it('should infer formal tone from communication style', () => {
    const builder = new SoulConversationBuilder();
    builder.startConversation();

    const answers = ['Bot', 'professional', '5', 'none', 'none', 'general', 'none', 'formal and precise'];
    let result;
    for (const answer of answers) {
      result = builder.processAnswer(answer);
    }

    expect(result!.done).toBe(true);
    if (result!.done) {
      expect(result!.config.tone.warmth).toBe(0.4);
      expect(result!.config.tone.formality).toBe(0.8);
    }
  });

  it('should infer direct tone from communication style', () => {
    const builder = new SoulConversationBuilder();
    builder.startConversation();

    const answers = ['Bot', 'professional', '5', 'none', 'none', 'general', 'none', 'brief and direct'];
    let result;
    for (const answer of answers) {
      result = builder.processAnswer(answer);
    }

    expect(result!.done).toBe(true);
    if (result!.done) {
      expect(result!.config.tone.directness).toBe(0.9);
    }
  });

  it('should parse multiple catchphrases', () => {
    const builder = new SoulConversationBuilder();
    builder.startConversation();

    const answers = ['Bot', 'professional', '5', 'none', 'none', 'general', 'greeting=Hi!, farewell=Bye!', 'balanced'];
    let result;
    for (const answer of answers) {
      result = builder.processAnswer(answer);
    }

    expect(result!.done).toBe(true);
    if (result!.done) {
      expect(result!.config.catchphrases).toEqual({
        greeting: 'Hi!',
        farewell: 'Bye!',
      });
    }
  });

  it('should generate valid SOUL.md content', () => {
    const builder = new SoulConversationBuilder();
    builder.startConversation();

    const answers = ['Nova', 'apologetic', '3', 'legal', 'health', 'Python', 'none', 'balanced'];
    let result;
    for (const answer of answers) {
      result = builder.processAnswer(answer);
    }

    expect(result!.done).toBe(true);
    if (result!.done) {
      expect(result!.soulMd).toContain('---');
      expect(result!.soulMd).toContain('name: Nova');
      expect(result!.soulMd).toContain('errorStyle: apologetic');
      expect(result!.soulMd).toContain('- Python');
    }
  });

  it('should handle non-numeric humor input', () => {
    const builder = new SoulConversationBuilder();
    builder.startConversation();

    const answers = ['Bot', 'professional', 'lots', 'none', 'none', 'general', 'none', 'balanced'];
    let result;
    for (const answer of answers) {
      result = builder.processAnswer(answer);
    }

    expect(result!.done).toBe(true);
    if (result!.done) {
      expect(result!.config.tone.humor).toBe(0.3); // default
    }
  });
});
