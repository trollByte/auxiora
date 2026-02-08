import * as crypto from 'node:crypto';
import type { AmbientPattern, AmbientPatternType, ObservedEvent } from './types.js';

/** Sliding window size for frequency analysis. */
const DEFAULT_WINDOW_SIZE = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Minimum occurrences to consider something a pattern. */
const MIN_OCCURRENCES = 3;
/** Minimum confidence to emit a pattern. */
const MIN_CONFIDENCE = 0.3;

/**
 * Ambient pattern engine — observes events and detects behavioral patterns
 * using sliding window frequency analysis.
 */
export class AmbientPatternEngine {
  private events: ObservedEvent[] = [];
  private patterns: Map<string, AmbientPattern> = new Map();
  private windowSize: number;

  constructor(windowSize?: number) {
    this.windowSize = windowSize ?? DEFAULT_WINDOW_SIZE;
  }

  /** Observe a new event. */
  observe(event: ObservedEvent): void {
    this.events.push(event);
    // Prune events outside the window
    const cutoff = Date.now() - this.windowSize;
    this.events = this.events.filter(e => e.timestamp >= cutoff);
  }

  /** Run pattern detection on observed events. */
  detectPatterns(): AmbientPattern[] {
    const detected: AmbientPattern[] = [];

    // Group events by type
    const byType = new Map<string, ObservedEvent[]>();
    for (const event of this.events) {
      const existing = byType.get(event.type) ?? [];
      existing.push(event);
      byType.set(event.type, existing);
    }

    // Detect schedule patterns (recurring events at similar times)
    for (const [type, events] of byType) {
      if (events.length >= MIN_OCCURRENCES) {
        const schedulePattern = this.detectSchedulePattern(type, events);
        if (schedulePattern) detected.push(schedulePattern);

        const frequencyPattern = this.detectFrequencyPattern(type, events);
        if (frequencyPattern) detected.push(frequencyPattern);
      }
    }

    // Detect correlations between event types
    const correlations = this.detectCorrelations(byType);
    detected.push(...correlations);

    // Update stored patterns
    for (const pattern of detected) {
      const existing = this.patterns.get(pattern.id);
      if (existing) {
        existing.lastConfirmedAt = Date.now();
        existing.occurrences++;
        existing.confidence = Math.min(1, existing.confidence + 0.05);
      } else {
        this.patterns.set(pattern.id, pattern);
      }
    }

    return detected;
  }

  /** Get all detected patterns above minimum confidence. */
  getPatterns(): AmbientPattern[] {
    return Array.from(this.patterns.values())
      .filter(p => p.confidence >= MIN_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /** Get a pattern by ID. */
  getPattern(id: string): AmbientPattern | undefined {
    return this.patterns.get(id);
  }

  /** Get the number of observed events in the window. */
  getEventCount(): number {
    return this.events.length;
  }

  /** Clear all events and patterns. */
  reset(): void {
    this.events = [];
    this.patterns.clear();
  }

  private detectSchedulePattern(type: string, events: ObservedEvent[]): AmbientPattern | null {
    // Check if events happen at similar hours of the day
    const hours = events.map(e => new Date(e.timestamp).getHours());
    const hourCounts = new Map<number, number>();
    for (const h of hours) {
      hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
    }

    // Find the most common hour
    let maxHour = 0;
    let maxCount = 0;
    for (const [hour, count] of hourCounts) {
      if (count > maxCount) {
        maxHour = hour;
        maxCount = count;
      }
    }

    const ratio = maxCount / events.length;
    if (ratio < 0.5 || maxCount < MIN_OCCURRENCES) return null;

    const id = crypto.randomUUID();
    return {
      id,
      type: 'schedule',
      description: `"${type}" events frequently occur around ${maxHour}:00`,
      confidence: Math.min(1, ratio * 0.8 + (maxCount / 10) * 0.2),
      evidence: events.slice(-3).map(e => `${type} at ${new Date(e.timestamp).toISOString()}`),
      detectedAt: Date.now(),
      lastConfirmedAt: Date.now(),
      occurrences: maxCount,
    };
  }

  private detectFrequencyPattern(type: string, events: ObservedEvent[]): AmbientPattern | null {
    if (events.length < MIN_OCCURRENCES) return null;

    // Calculate average interval between events
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i].timestamp - sorted[i - 1].timestamp);
    }

    if (intervals.length === 0) return null;

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stdDev = Math.sqrt(
      intervals.reduce((sum, iv) => sum + (iv - avgInterval) ** 2, 0) / intervals.length
    );

    // Low variance means regular frequency
    const cv = avgInterval > 0 ? stdDev / avgInterval : Infinity;
    if (cv > 0.5) return null; // Too irregular

    const confidence = Math.min(1, 1 - cv);
    if (confidence < MIN_CONFIDENCE) return null;

    const hours = Math.round(avgInterval / (60 * 60 * 1000) * 10) / 10;
    const id = crypto.randomUUID();
    return {
      id,
      type: 'preference',
      description: `"${type}" occurs roughly every ${hours} hours`,
      confidence,
      evidence: [`${events.length} occurrences over window`, `Average interval: ${hours}h`],
      detectedAt: Date.now(),
      lastConfirmedAt: Date.now(),
      occurrences: events.length,
    };
  }

  private detectCorrelations(byType: Map<string, ObservedEvent[]>): AmbientPattern[] {
    const patterns: AmbientPattern[] = [];
    const types = Array.from(byType.keys());

    // Check pairs of event types for temporal correlation
    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        const eventsA = byType.get(types[i])!;
        const eventsB = byType.get(types[j])!;

        if (eventsA.length < 2 || eventsB.length < 2) continue;

        // Count how often B follows A within 5 minutes
        const followWindow = 5 * 60 * 1000;
        let follows = 0;
        for (const a of eventsA) {
          for (const b of eventsB) {
            if (b.timestamp > a.timestamp && b.timestamp - a.timestamp <= followWindow) {
              follows++;
              break;
            }
          }
        }

        const followRatio = follows / eventsA.length;
        if (followRatio >= 0.5 && follows >= 2) {
          const id = crypto.randomUUID();
          patterns.push({
            id,
            type: 'correlation',
            description: `"${types[j]}" often follows "${types[i]}" within 5 minutes`,
            confidence: Math.min(1, followRatio * 0.9),
            evidence: [`${follows} of ${eventsA.length} "${types[i]}" events followed by "${types[j]}"`],
            detectedAt: Date.now(),
            lastConfirmedAt: Date.now(),
            occurrences: follows,
          });
        }
      }
    }

    return patterns;
  }
}
