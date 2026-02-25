import type { ResearchDepth, ResearchIntent } from './types.js';

interface SignalMatch {
  pattern: string;
  weight: number;
}

const COMPLEXITY_MARKERS: readonly string[] = [
  'compare',
  'contrast',
  'analyze',
  'pros and cons',
  'differ from',
  'differences between',
  'trade-offs',
  'trade offs',
  'advantages and disadvantages',
  'implications',
  'impact of',
  'relationship between',
];

const RESEARCH_KEYWORDS: readonly string[] = [
  'research',
  'investigate',
  'deep dive',
  'in-depth',
  'in depth',
  'comprehensive',
  'thorough',
  'detailed analysis',
  'study',
  'explore',
  'survey of',
  'state of the art',
];

const FACT_SEEKING: readonly string[] = [
  'current state of',
  'latest developments',
  'recent advances',
  'what is known about',
  'evidence for',
];

const MULTI_FACET_MARKERS: readonly string[] = [
  ' and ',
  ' vs ',
  ' versus ',
  ' or ',
  ' compared to ',
];

const CODE_TASK_PATTERNS: readonly string[] = [
  'write a',
  'create a',
  'implement',
  'fix',
  'debug',
  'build a',
  'function',
  'class',
  'script',
  'refactor',
  'deploy',
];

const SIMPLE_FACTUAL: readonly string[] = [
  'what is the',
  'who is',
  'when was',
  'where is',
  'how many',
  'define ',
];

const CONVERSATIONAL: readonly string[] = [
  'hello',
  'hi ',
  'hey ',
  'how are you',
  'thanks',
  'goodbye',
];

export class ResearchIntentDetector {
  detect(message: string): ResearchIntent {
    const lower = message.toLowerCase();
    const positiveMatches: SignalMatch[] = [];
    const negativeMatches: SignalMatch[] = [];

    // Positive signals
    for (const pattern of COMPLEXITY_MARKERS) {
      if (lower.includes(pattern)) {
        positiveMatches.push({ pattern, weight: 0.2 });
      }
    }

    for (const pattern of RESEARCH_KEYWORDS) {
      if (lower.includes(pattern)) {
        positiveMatches.push({ pattern, weight: 0.6 });
      }
    }

    for (const pattern of FACT_SEEKING) {
      if (lower.includes(pattern)) {
        positiveMatches.push({ pattern, weight: 0.25 });
      }
    }

    for (const pattern of MULTI_FACET_MARKERS) {
      if (lower.includes(pattern)) {
        positiveMatches.push({ pattern: pattern.trim(), weight: 0.05 });
      }
    }

    // Long question bonus
    const wordCount = message.split(/\s+/).filter(Boolean).length;
    if (wordCount > 20) {
      positiveMatches.push({ pattern: 'long question', weight: 0.1 });
    }

    // Question with domain terms bonus
    if (message.trim().endsWith('?') && wordCount >= 6) {
      positiveMatches.push({ pattern: 'substantive question', weight: 0.15 });
    }

    // Negative signals
    for (const pattern of CODE_TASK_PATTERNS) {
      if (lower.includes(pattern)) {
        negativeMatches.push({ pattern, weight: 0.2 });
      }
    }

    for (const pattern of SIMPLE_FACTUAL) {
      if (lower.includes(pattern)) {
        negativeMatches.push({ pattern, weight: 0.15 });
      }
    }

    for (const pattern of CONVERSATIONAL) {
      if (lower.includes(pattern)) {
        negativeMatches.push({ pattern, weight: 0.3 });
      }
    }

    // Diversity bonus: signals from multiple categories reinforce each other
    const categories = new Set(positiveMatches.map((m) => m.weight));
    if (categories.size >= 2) {
      positiveMatches.push({ pattern: 'multi-category signals', weight: 0.15 });
    }

    // Calculate raw score
    const positiveScore = positiveMatches.reduce((sum, m) => sum + m.weight, 0);
    const negativeScore = negativeMatches.reduce((sum, m) => sum + m.weight, 0);
    const raw = positiveScore - negativeScore;

    // Clamp to 0-1
    const score = Math.max(0, Math.min(1, raw));

    const suggestedDepth = this.scoreToDepth(score);
    const reason = this.buildReason(positiveMatches, negativeMatches, score);
    const subtopicHints = this.extractSubtopicHints(message);

    return { score, suggestedDepth, reason, subtopicHints };
  }

  private scoreToDepth(score: number): ResearchDepth {
    if (score >= 0.6) return 'deep';
    if (score >= 0.4) return 'standard';
    return 'quick';
  }

  private buildReason(
    positive: SignalMatch[],
    negative: SignalMatch[],
    score: number,
  ): string {
    const parts: string[] = [];

    if (positive.length > 0) {
      const patterns = positive.map((m) => m.pattern).join(', ');
      parts.push(`positive signals: ${patterns}`);
    }

    if (negative.length > 0) {
      const patterns = negative.map((m) => m.pattern).join(', ');
      parts.push(`negative signals: ${patterns}`);
    }

    if (parts.length === 0) {
      return `No strong signals detected (score: ${score.toFixed(2)})`;
    }

    return `Score ${score.toFixed(2)} based on ${parts.join('; ')}`;
  }

  private extractSubtopicHints(message: string): string[] {
    const hints = new Set<string>();

    // Extract terms around vs/versus/compared to
    const vsPatterns = [
      /(\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*)\s+(?:vs\.?|versus|compared\s+to)\s+(\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*)/g,
      /(\b[a-zA-Z]+)\s+(?:vs\.?|versus|compared\s+to)\s+(\b[a-zA-Z]+)/gi,
    ];

    for (const pattern of vsPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(message)) !== null) {
        if (match[1]) hints.add(match[1].trim());
        if (match[2]) hints.add(match[2].trim());
      }
    }

    // Extract capitalized noun phrases (likely proper nouns / technologies)
    const capitalizedPattern = /\b([A-Z][a-zA-Z]{1,}(?:\.[a-zA-Z]+)*)\b/g;
    let capMatch: RegExpExecArray | null;
    while ((capMatch = capitalizedPattern.exec(message)) !== null) {
      const word = capMatch[1];
      // Skip words at sentence start by checking if preceded by '. ' or start of string
      const idx = capMatch.index;
      const isStartOfSentence =
        idx === 0 || /[.!?]\s+$/.test(message.slice(0, idx));

      if (!isStartOfSentence) {
        hints.add(word);
      }
    }

    // Extract comma-separated items that look like entities (e.g. "React, Vue, and Angular")
    const listPattern =
      /\b([A-Z][a-zA-Z]+)(?:\s*,\s*([A-Z][a-zA-Z]+))*(?:\s*,?\s*and\s+([A-Z][a-zA-Z]+))/g;
    let listMatch: RegExpExecArray | null;
    while ((listMatch = listPattern.exec(message)) !== null) {
      for (let i = 1; i < listMatch.length; i++) {
        if (listMatch[i]) hints.add(listMatch[i].trim());
      }
    }

    return [...hints];
  }
}
