import { getLogger } from '@auxiora/logger';
import type { Threat, ThreatLevel } from './types.js';

const logger = getLogger('guardrails:toxicity');

/**
 * Basic keyword/pattern-based toxicity filter.
 * NOTE: This is not an ML-based classifier. It uses pattern matching
 * for common toxic content indicators. For production use, consider
 * supplementing with an ML-based toxicity detection service.
 */

interface ToxicCategory {
  name: string;
  patterns: RegExp[];
  level: ThreatLevel;
  description: string;
}

const TOXIC_CATEGORIES: ToxicCategory[] = [
  {
    name: 'violence_threat',
    patterns: [
      /\b(?:i\s+will|i'm\s+going\s+to|gonna|want\s+to)\s+(?:kill|murder|hurt|harm|attack|destroy|eliminate)\b/i,
      /\b(?:kill|murder|attack|destroy)\s+(?:you|them|him|her|everyone|people)\b/i,
    ],
    level: 'critical',
    description: 'Direct threat of violence',
  },
  {
    name: 'self_harm',
    patterns: [
      /\b(?:i\s+will|i'm\s+going\s+to|want\s+to)\s+(?:kill\s+myself|end\s+my\s+life|commit\s+suicide)\b/i,
      /\bhow\s+to\s+(?:kill\s+myself|commit\s+suicide|end\s+my\s+life)\b/i,
    ],
    level: 'critical',
    description: 'Self-harm or suicide-related content',
  },
  {
    name: 'hate_speech',
    patterns: [
      /\b(?:all|every|those)\s+(?:\w+\s+)*(?:should\s+die|are\s+(?:worthless|inferior|subhuman))\b/i,
      /\b(?:death\s+to|exterminate|genocide\s+(?:of|against))\b/i,
    ],
    level: 'high',
    description: 'Hate speech targeting groups',
  },
  {
    name: 'harassment',
    patterns: [
      /\byou(?:\s+are|'re)\s+(?:worthless|pathetic|disgusting|garbage|trash|an?\s+idiot)\b/i,
      /\b(?:shut\s+up|go\s+die|nobody\s+(?:likes|cares\s+about)\s+you)\b/i,
    ],
    level: 'medium',
    description: 'Targeted harassment or personal attack',
  },
  {
    name: 'dangerous_instructions',
    patterns: [
      /\bhow\s+to\s+(?:make|build|create)\s+(?:a\s+)?(?:bomb|explosive|weapon|poison)\b/i,
      /\b(?:instructions|guide|tutorial)\s+(?:for|to)\s+(?:making|building|creating)\s+(?:a\s+)?(?:bomb|explosive|weapon)\b/i,
    ],
    level: 'high',
    description: 'Request for dangerous/illegal instructions',
  },
  {
    name: 'profanity_heavy',
    patterns: [
      /\bf+u+c+k+\s+(?:you|off|this)\b/i,
    ],
    level: 'low',
    description: 'Heavy profanity directed at someone',
  },
];

export class ToxicityFilter {
  detect(text: string): Threat[] {
    const threats: Threat[] = [];

    for (const category of TOXIC_CATEGORIES) {
      for (const pattern of category.patterns) {
        const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
          threats.push({
            type: 'toxicity',
            level: category.level,
            description: category.description,
            location: { start: match.index, end: match.index + match[0].length },
            match: match[0],
          });
        }
      }
    }

    logger.debug({ threatCount: threats.length }, 'Toxicity scan complete');
    return threats;
  }
}
