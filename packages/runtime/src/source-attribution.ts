import { getLogger } from '@auxiora/logger';

const logger = getLogger('runtime:source-attribution');

export type SourceType = 'user_data' | 'web_search' | 'knowledge_graph' | 'model_generation' | 'tool_output' | 'memory';

export interface Attribution {
  /** What type of source this came from */
  sourceType: SourceType;
  /** Human-readable label */
  label: string;
  /** Reference to the specific source (memory ID, URL, tool name, etc.) */
  reference?: string;
  /** Confidence that this attribution is correct (0-1) */
  confidence: number;
}

export interface AttributedSegment {
  /** The text content */
  content: string;
  /** Attribution for this segment */
  attribution: Attribution;
}

export interface ResponseAttribution {
  /** Original full response text */
  fullResponse: string;
  /** Segments with attribution */
  segments: AttributedSegment[];
  /** Summary of sources used */
  sourcesSummary: Record<SourceType, number>;
  /** Overall confidence score */
  overallConfidence: number;
}

/** Source that was available during response generation */
export interface AttributionSource {
  type: SourceType;
  label: string;
  /** The actual content from this source */
  content?: string;
  /** Reference identifier (memory ID, URL, etc.) */
  reference?: string;
  /** How confident we are this source was used */
  confidence?: number;
}

export class SourceAttributor {
  /**
   * Attribute a response based on the context that produced it.
   * Takes the response text and the sources that were available during generation.
   */
  attribute(
    response: string,
    sources: AttributionSource[],
  ): ResponseAttribution {
    const segments: AttributedSegment[] = [];
    let remainingText = response;
    const sourcesSummary: Record<string, number> = {};

    // Match response segments to known sources
    for (const source of sources) {
      if (!source.content) continue;

      // Find if any source content appears (or closely matches) in the response
      const matchIndex = this.findMatch(remainingText, source.content);
      if (matchIndex >= 0) {
        const matchLength = Math.min(source.content.length, remainingText.length - matchIndex);

        // Add pre-match text as model generation
        if (matchIndex > 0) {
          const preText = remainingText.slice(0, matchIndex);
          segments.push({
            content: preText,
            attribution: { sourceType: 'model_generation', label: 'AI generated', confidence: 0.5 },
          });
        }

        // Add matched segment
        const matchedText = remainingText.slice(matchIndex, matchIndex + matchLength);
        const attr: Attribution = {
          sourceType: source.type,
          label: source.label,
          reference: source.reference,
          confidence: source.confidence ?? 0.8,
        };
        segments.push({ content: matchedText, attribution: attr });
        sourcesSummary[source.type] = (sourcesSummary[source.type] ?? 0) + 1;

        remainingText = remainingText.slice(matchIndex + matchLength);
      }
    }

    // Any remaining text is model generation
    if (remainingText.length > 0) {
      segments.push({
        content: remainingText,
        attribution: { sourceType: 'model_generation', label: 'AI generated', confidence: 0.5 },
      });
      sourcesSummary['model_generation'] = (sourcesSummary['model_generation'] ?? 0) + 1;
    }

    // If no specific sources matched, the whole thing is model generation
    if (segments.length === 0) {
      segments.push({
        content: response,
        attribution: { sourceType: 'model_generation', label: 'AI generated', confidence: 0.5 },
      });
      sourcesSummary['model_generation'] = 1;
    }

    const confidences = segments.map(s => s.attribution.confidence);
    const overallConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0.5;

    logger.debug('Response attributed', {
      segmentCount: segments.length,
      sourceTypes: Object.keys(sourcesSummary),
    });

    return {
      fullResponse: response,
      segments,
      sourcesSummary: sourcesSummary as Record<SourceType, number>,
      overallConfidence,
    };
  }

  /**
   * Create a simple attribution for a fully-generated response (no specific sources).
   */
  attributeGenerated(response: string): ResponseAttribution {
    return {
      fullResponse: response,
      segments: [{
        content: response,
        attribution: { sourceType: 'model_generation', label: 'AI generated', confidence: 0.5 },
      }],
      sourcesSummary: { model_generation: 1 } as Record<SourceType, number>,
      overallConfidence: 0.5,
    };
  }

  /**
   * Simple substring match finder (case-insensitive, whitespace-normalized).
   * Returns the start index or -1 if not found.
   */
  private findMatch(text: string, source: string): number {
    const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
    const normalizedSource = source.toLowerCase().replace(/\s+/g, ' ');

    // Try exact substring first
    const idx = normalizedText.indexOf(normalizedSource);
    if (idx >= 0) return idx;

    // Try first 50 chars of source for partial match
    if (normalizedSource.length > 50) {
      const partial = normalizedSource.slice(0, 50);
      const partialIdx = normalizedText.indexOf(partial);
      if (partialIdx >= 0) return partialIdx;
    }

    return -1;
  }
}
