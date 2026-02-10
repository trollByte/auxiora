import { describe, it, expect } from 'vitest';
import { LanguageDetector } from '../src/language.js';

describe('LanguageDetector', () => {
  const detector = new LanguageDetector();

  it('detect English text', () => {
    const result = detector.detect('The cat is sitting on the mat with this from that');
    expect(result.language).toBe('english');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detect Spanish text', () => {
    const result = detector.detect('El gato es un animal que los tiene en las casas por la noche');
    expect(result.language).toBe('spanish');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detect French text', () => {
    const result = detector.detect('Le chat est un animal que les gens ont dans une maison avec des amis');
    expect(result.language).toBe('french');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detect German text', () => {
    const result = detector.detect('Der Hund ist ein Tier und die Katze ist mit das Haus');
    expect(result.language).toBe('german');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('isRTL true for arabic', () => {
    expect(detector.isRTL('arabic')).toBe(true);
  });

  it('isRTL false for english', () => {
    expect(detector.isRTL('english')).toBe(false);
  });
});
