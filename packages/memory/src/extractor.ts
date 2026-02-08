import { getLogger } from '@auxiora/logger';
import type { MemoryEntry, PersonalityAdaptation, SentimentResult } from './types.js';
import type { MemoryStore } from './store.js';
import { SentimentAnalyzer } from './sentiment.js';

const logger = getLogger('memory:extractor');

export interface ExtractionResult {
  factsExtracted: MemoryEntry[];
  patternsDetected: MemoryEntry[];
  relationshipsFound: MemoryEntry[];
  contradictionsFound: Array<{ existing: MemoryEntry; new: string; resolution: string }>;
  personalitySignals: PersonalityAdaptation[];
  sentiment?: SentimentResult;
}

export interface AIProvider {
  complete(messages: Array<{ role: string; content: string }>, options?: { systemPrompt?: string; temperature?: number }): Promise<{ content: string }>;
}

const EXTRACTION_PROMPT = `Analyze this conversation exchange and extract structured information.

User: {userMessage}
Assistant: {assistantResponse}

Respond ONLY with valid JSON (no markdown fences) with these sections:
{
  "facts": [{"content": "...", "category": "preference|fact|context", "importance": 0.0}],
  "relationships": [{"content": "...", "type": "inside_joke|shared_experience|milestone|callback"}],
  "patterns": [{"pattern": "...", "type": "communication|schedule|topic|mood"}],
  "contradictions": [{"existingFact": "...", "newFact": "...", "resolution": "update|keep_both|ignore"}],
  "personalitySignals": [{"trait": "humor|formality|verbosity|directness", "direction": "increase|decrease", "reason": "..."}]
}

Only extract if there's clear signal. Empty arrays are fine. Be conservative.`;

interface RawFact {
  content: string;
  category: 'preference' | 'fact' | 'context';
  importance: number;
}

interface RawRelationship {
  content: string;
  type: string;
}

interface RawPattern {
  pattern: string;
  type: string;
}

interface RawContradiction {
  existingFact: string;
  newFact: string;
  resolution: string;
}

interface RawPersonalitySignal {
  trait: string;
  direction: 'increase' | 'decrease';
  reason: string;
}

interface RawExtraction {
  facts?: RawFact[];
  relationships?: RawRelationship[];
  patterns?: RawPattern[];
  contradictions?: RawContradiction[];
  personalitySignals?: RawPersonalitySignal[];
}

export class MemoryExtractor {
  private sentimentAnalyzer = new SentimentAnalyzer();

  constructor(
    private store: MemoryStore,
    private provider: AIProvider,
  ) {}

  async extract(
    userMessage: string,
    assistantResponse: string,
    _sessionContext?: { messageCount: number; sessionAge: number },
  ): Promise<ExtractionResult> {
    const result: ExtractionResult = {
      factsExtracted: [],
      patternsDetected: [],
      relationshipsFound: [],
      contradictionsFound: [],
      personalitySignals: [],
    };

    // Run heuristic sentiment analysis on user message
    result.sentiment = this.sentimentAnalyzer.analyzeSentiment(userMessage);

    try {
      const prompt = EXTRACTION_PROMPT
        .replace('{userMessage}', userMessage)
        .replace('{assistantResponse}', assistantResponse);

      const response = await this.provider.complete(
        [{ role: 'user', content: prompt }],
        { temperature: 0.1 },
      );

      const parsed = this.parseResponse(response.content);
      if (!parsed) return result;

      // Process facts
      if (parsed.facts) {
        for (const fact of parsed.facts) {
          if (!fact.content || typeof fact.content !== 'string') continue;
          const entry = await this.store.add(
            fact.content,
            fact.category ?? 'fact',
            'extracted',
            { importance: clampNumber(fact.importance ?? 0.5, 0, 1) },
          );
          result.factsExtracted.push(entry);
        }
      }

      // Process relationships
      if (parsed.relationships) {
        for (const rel of parsed.relationships) {
          if (!rel.content || typeof rel.content !== 'string') continue;
          const entry = await this.store.add(
            rel.content,
            'relationship',
            'extracted',
            { importance: 0.7 },
          );
          result.relationshipsFound.push(entry);
        }
      }

      // Process patterns
      if (parsed.patterns) {
        for (const pat of parsed.patterns) {
          if (!pat.pattern || typeof pat.pattern !== 'string') continue;
          const entry = await this.store.add(
            pat.pattern,
            'pattern',
            'observed',
            { importance: 0.5, confidence: 0.4 },
          );
          result.patternsDetected.push(entry);
        }
      }

      // Process contradictions
      if (parsed.contradictions) {
        for (const contra of parsed.contradictions) {
          if (!contra.existingFact || !contra.newFact) continue;
          const existingMemories = await this.store.search(contra.existingFact);
          if (existingMemories.length > 0) {
            result.contradictionsFound.push({
              existing: existingMemories[0],
              new: contra.newFact,
              resolution: contra.resolution ?? 'keep_both',
            });

            if (contra.resolution === 'update' && existingMemories[0]) {
              await this.store.update(existingMemories[0].id, {
                content: contra.newFact,
              });
            }
          }
        }
      }

      // Process personality signals
      if (parsed.personalitySignals) {
        for (const sig of parsed.personalitySignals) {
          if (!sig.trait || !sig.direction) continue;
          result.personalitySignals.push({
            trait: sig.trait,
            adjustment: sig.direction === 'increase' ? 0.1 : -0.1,
            reason: sig.reason ?? '',
            signalCount: 1,
          });
        }
      }
    } catch (error) {
      logger.debug('Memory extraction failed', { error: error as Error });
    }

    return result;
  }

  private parseResponse(content: string): RawExtraction | undefined {
    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      return JSON.parse(cleaned) as RawExtraction;
    } catch {
      logger.debug('Failed to parse extraction response', {});
      return undefined;
    }
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
