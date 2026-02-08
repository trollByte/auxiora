import type { Intent, IntentType, IntentEntity, IntentParserConfig } from './types.js';
import { DEFAULT_INTENT_PARSER_CONFIG } from './types.js';

interface KeywordRule {
  type: IntentType;
  keywords: string[];
  weight: number;
}

const KEYWORD_RULES: KeywordRule[] = [
  { type: 'send_message', keywords: ['send', 'message', 'tell', 'notify', 'text', 'dm', 'reply'], weight: 1 },
  { type: 'read_message', keywords: ['read', 'check', 'inbox', 'unread', 'messages'], weight: 1 },
  { type: 'search', keywords: ['search', 'find', 'look up', 'lookup'], weight: 1 },
  { type: 'create_file', keywords: ['create', 'new file', 'write file', 'make file', 'generate'], weight: 1 },
  { type: 'read_file', keywords: ['read file', 'open file', 'show file', 'view'], weight: 1 },
  { type: 'edit_file', keywords: ['edit', 'modify', 'update file', 'change file'], weight: 1 },
  { type: 'delete_file', keywords: ['delete', 'remove', 'trash'], weight: 1 },
  { type: 'browse_web', keywords: ['browse', 'visit', 'open url', 'navigate', 'website', 'go to'], weight: 1 },
  { type: 'run_command', keywords: ['run', 'command', 'terminal'], weight: 1 },
  { type: 'schedule', keywords: ['schedule', 'calendar', 'appointment', 'meeting', 'book'], weight: 1 },
  { type: 'remind', keywords: ['remind', 'reminder', 'alarm', 'alert me'], weight: 1 },
  { type: 'query', keywords: ['what is', 'who is', 'how to', 'explain', 'tell me about'], weight: 0.8 },
  { type: 'summarize', keywords: ['summarize', 'summary', 'tldr', 'recap', 'brief'], weight: 1 },
  { type: 'translate', keywords: ['translate', 'translation', 'in spanish', 'in french', 'in german'], weight: 1 },
  { type: 'compose', keywords: ['compose', 'draft', 'write an email', 'write a letter', 'write a message'], weight: 1 },
  { type: 'analyze', keywords: ['analyze', 'analysis', 'review', 'assess'], weight: 0.9 },
  { type: 'configure', keywords: ['configure', 'settings', 'set up', 'config', 'preferences'], weight: 1 },
];

const ENTITY_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'url', pattern: /https?:\/\/[^\s]+/gi },
  { type: 'email', pattern: /[\w.-]+@[\w.-]+\.\w+/gi },
  { type: 'file_path', pattern: /(?:\/[\w.-]+)+/g },
  { type: 'time', pattern: /\b\d{1,2}:\d{2}(?:\s*(?:am|pm))?\b/gi },
  { type: 'date', pattern: /\b(?:today|tomorrow|yesterday|\d{4}-\d{2}-\d{2})\b/gi },
  { type: 'mention', pattern: /@[\w.-]+/g },
];

const CONNECTOR_KEYWORDS: Record<string, string[]> = {
  slack: ['slack', 'channel'],
  discord: ['discord', 'server'],
  email: ['email', 'mail', 'inbox', 'gmail'],
  calendar: ['calendar', 'schedule', 'meeting', 'appointment'],
  github: ['github', 'repository', 'repo', 'pull request', 'pr', 'issue'],
  notion: ['notion', 'page', 'database'],
};

export class IntentParser {
  private config: IntentParserConfig;

  constructor(config?: Partial<IntentParserConfig>) {
    this.config = { ...DEFAULT_INTENT_PARSER_CONFIG, ...config };
  }

  parse(message: string, context?: Record<string, unknown>): Intent {
    const lower = message.toLowerCase();

    // Score each intent type
    const scores = new Map<IntentType, number>();

    for (const rule of KEYWORD_RULES) {
      let matchCount = 0;
      for (const keyword of rule.keywords) {
        if (lower.includes(keyword)) {
          matchCount++;
        }
      }
      if (matchCount > 0) {
        // Base score of 0.5 for first match, increasing with more matches
        const score = Math.min(0.5 + (matchCount - 1) * 0.15, 1) * rule.weight;
        const current = scores.get(rule.type) ?? 0;
        scores.set(rule.type, Math.max(current, score));
      }
    }

    // Find best match
    let bestType: IntentType = 'unknown';
    let bestScore = 0;

    for (const [type, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    // Apply confidence threshold
    const confidence = Math.min(bestScore, 1);
    if (confidence < this.config.confidenceThreshold) {
      bestType = 'unknown';
    }

    // Extract entities
    const entities = this.extractEntities(message);

    // Detect required connectors
    const requiredConnectors = this.detectConnectors(lower);

    return {
      type: bestType,
      confidence: bestType === 'unknown' ? 0 : confidence,
      entities,
      requiredConnectors,
      actionSteps: [],
      rawText: message,
    };
  }

  private extractEntities(text: string): IntentEntity[] {
    const entities: IntentEntity[] = [];

    for (const { type, pattern } of ENTITY_PATTERNS) {
      // Reset regex state for global patterns
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          type,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    return entities;
  }

  private detectConnectors(text: string): string[] {
    const connectors: string[] = [];

    for (const [connector, keywords] of Object.entries(CONNECTOR_KEYWORDS)) {
      if (keywords.some((kw) => text.includes(kw))) {
        connectors.push(connector);
      }
    }

    return connectors;
  }
}
