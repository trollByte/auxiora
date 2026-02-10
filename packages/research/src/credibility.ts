import type { CredibilityFactors } from './types.js';

const KNOWN_DOMAINS = new Map<string, number>([
  ['wikipedia.org', 0.95],
  ['arxiv.org', 0.95],
  ['nature.com', 0.95],
  ['science.org', 0.95],
  ['bbc.com', 0.9],
  ['reuters.com', 0.9],
  ['apnews.com', 0.9],
  ['nytimes.com', 0.8],
  ['washingtonpost.com', 0.8],
  ['theguardian.com', 0.8],
  ['techcrunch.com', 0.8],
  ['medium.com', 0.7],
  ['stackoverflow.com', 0.7],
  ['github.com', 0.7],
  ['reddit.com', 0.5],
  ['quora.com', 0.5],
  ['twitter.com', 0.3],
  ['facebook.com', 0.3],
]);

export class CredibilityScorer {
  score(url: string, factors?: Partial<CredibilityFactors>): number {
    const domain = this.extractDomain(url);
    let score = this.getDomainReputation(domain);

    if (factors?.isHttps) {
      score += 0.05;
    }
    if (factors?.hasAuthor) {
      score += 0.05;
    }
    if (factors?.hasDate) {
      score += 0.05;
    }
    if (factors?.crossReferenced) {
      score += 0.1;
    }

    return Math.min(Math.max(score, 0), 1);
  }

  getDomainReputation(domain: string): number {
    const lookup = KNOWN_DOMAINS.get(domain);
    if (lookup !== undefined) {
      return lookup;
    }

    if (domain.endsWith('.gov')) {
      return 0.9;
    }
    if (domain.endsWith('.edu')) {
      return 0.9;
    }

    return 0.5;
  }

  extractDomain(url: string): string {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  }
}
