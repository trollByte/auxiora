import type { LanguageResult } from './types.js';

const LANGUAGE_INDICATORS: Record<string, string[]> = {
  english: ['the', 'is', 'are', 'was', 'have', 'been', 'that', 'this', 'with', 'from'],
  spanish: ['el', 'la', 'los', 'las', 'de', 'en', 'que', 'un', 'una', 'por', 'con', 'es'],
  french: ['le', 'la', 'les', 'des', 'un', 'une', 'de', 'en', 'est', 'que', 'dans', 'avec'],
  german: ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'mit', 'auf', 'für', 'von'],
  portuguese: ['o', 'a', 'os', 'as', 'de', 'em', 'que', 'um', 'uma', 'com', 'por'],
};

const RTL_LANGUAGES = new Set(['arabic', 'hebrew', 'persian', 'urdu']);

export class LanguageDetector {
  detect(text: string): LanguageResult {
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      return { language: 'unknown', confidence: 0 };
    }

    let bestLanguage = 'unknown';
    let bestCount = 0;

    for (const [language, indicators] of Object.entries(LANGUAGE_INDICATORS)) {
      let count = 0;
      for (const word of words) {
        if (indicators.includes(word)) {
          count++;
        }
      }
      if (count > bestCount) {
        bestCount = count;
        bestLanguage = language;
      }
    }

    const confidence = bestCount / words.length;

    return {
      language: bestLanguage,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  isRTL(language: string): boolean {
    return RTL_LANGUAGES.has(language.toLowerCase());
  }
}
