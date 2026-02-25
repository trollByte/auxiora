import type { GrammarIssue } from './types.js';

export class GrammarChecker {
  check(text: string): GrammarIssue[] {
    const issues: GrammarIssue[] = [
      ...this.checkDoubleSpaces(text),
      ...this.checkRepeatedWords(text),
      ...this.checkLongSentences(text),
      ...this.checkPassiveVoice(text),
      ...this.checkWeaselWords(text),
      ...this.checkMissingPeriod(text),
    ];

    issues.sort((a, b) => a.position.start - b.position.start);
    return issues;
  }

  private checkDoubleSpaces(text: string): GrammarIssue[] {
    const issues: GrammarIssue[] = [];
    const pattern = /  /g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      issues.push({
        type: 'style',
        message: 'Double space detected',
        position: { start: match.index, end: match.index + 2 },
        suggestion: ' ',
        severity: 'warning',
      });
    }

    return issues;
  }

  private checkRepeatedWords(text: string): GrammarIssue[] {
    const issues: GrammarIssue[] = [];
    const pattern = /\b(\w+)\s+\1\b/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      issues.push({
        type: 'grammar',
        message: `Repeated word: "${match[1]}"`,
        position: { start: match.index, end: match.index + match[0].length },
        suggestion: match[1],
        severity: 'error',
      });
    }

    return issues;
  }

  private checkLongSentences(text: string): GrammarIssue[] {
    const issues: GrammarIssue[] = [];
    const sentences = text.split(/[.!?]+/);
    let offset = 0;

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;

      if (wordCount > 40) {
        const start = text.indexOf(trimmed, offset);
        issues.push({
          type: 'style',
          message: `Sentence is ${wordCount} words long (recommended: under 40)`,
          position: { start, end: start + trimmed.length },
          severity: 'warning',
        });
      }

      offset += sentence.length + 1;
    }

    return issues;
  }

  private checkPassiveVoice(text: string): GrammarIssue[] {
    const issues: GrammarIssue[] = [];
    const pattern = /\b(was|were|been|being)\s+\w+ed\b/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      issues.push({
        type: 'clarity',
        message: 'Possible passive voice',
        position: { start: match.index, end: match.index + match[0].length },
        severity: 'info',
      });
    }

    return issues;
  }

  private checkWeaselWords(text: string): GrammarIssue[] {
    const issues: GrammarIssue[] = [];
    const weaselWords = [
      'very', 'really', 'quite', 'somewhat', 'fairly',
      'rather', 'basically', 'essentially', 'generally',
    ];

    for (const word of weaselWords) {
      const pattern = new RegExp(`\\b${word}\\b`, 'gi');
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        issues.push({
          type: 'style',
          message: `Weasel word: "${match[0]}"`,
          position: { start: match.index, end: match.index + match[0].length },
          severity: 'warning',
        });
      }
    }

    return issues;
  }

  private checkMissingPeriod(text: string): GrammarIssue[] {
    const trimmed = text.trim();
    if (trimmed.length === 0) return [];

    const lastChar = trimmed[trimmed.length - 1];
    if (!['.', '!', '?', ':', ';'].includes(lastChar)) {
      return [
        {
          type: 'grammar',
          message: 'Text does not end with punctuation',
          position: { start: trimmed.length - 1, end: trimmed.length },
          suggestion: trimmed + '.',
          severity: 'warning',
        },
      ];
    }

    return [];
  }
}
