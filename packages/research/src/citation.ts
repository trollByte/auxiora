import { nanoid } from 'nanoid';
import type { Source, Finding } from './types.js';

export class CitationTracker {
  private sources = new Map<string, Source>();
  private findings: Finding[] = [];

  addSource(url: string, title: string, credibilityScore?: number): Source {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, '');

    const source: Source = {
      id: nanoid(),
      url,
      title,
      domain,
      accessedAt: Date.now(),
      credibilityScore: credibilityScore ?? 0.5,
    };

    this.sources.set(source.id, source);
    return source;
  }

  addFinding(content: string, sourceId: string, relevance?: number, category?: string): Finding {
    const finding: Finding = {
      id: nanoid(),
      content,
      sourceId,
      relevance: relevance ?? 0.5,
      category: category ?? 'general',
    };

    this.findings.push(finding);
    return finding;
  }

  getSources(): Source[] {
    return Array.from(this.sources.values());
  }

  getFindings(sourceId?: string): Finding[] {
    if (sourceId) {
      return this.findings.filter((f) => f.sourceId === sourceId);
    }
    return [...this.findings];
  }

  formatCitations(style: 'inline' | 'footnote' | 'bibliography'): string {
    const sources = this.getSources();

    switch (style) {
      case 'inline':
        return sources
          .map((s, i) => `[${i + 1}] ${s.title} (${s.domain})`)
          .join('\n');

      case 'footnote':
        return sources
          .map((s, i) => {
            const date = new Date(s.accessedAt).toISOString().split('T')[0];
            return `^${i + 1} ${s.title}. ${s.url}. Accessed: ${date}`;
          })
          .join('\n');

      case 'bibliography':
        return sources
          .map(
            (s) =>
              `${s.title}. ${s.domain}. ${s.url}. Credibility: ${s.credibilityScore.toFixed(2)}`,
          )
          .join('\n');
    }
  }

  clear(): void {
    this.sources.clear();
    this.findings = [];
  }
}
