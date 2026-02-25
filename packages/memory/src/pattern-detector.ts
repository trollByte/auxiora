import type { SentimentSnapshot, SentimentLabel } from './types.js';

export interface PatternSignal {
  type: 'communication' | 'schedule' | 'topic' | 'mood';
  pattern: string;
  confidence: number;
}

interface MessageInfo {
  content: string;
  role: string;
  timestamp: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export class PatternDetector {
  private sentimentHistory: SentimentSnapshot[] = [];

  recordSentiment(snapshot: SentimentSnapshot): void {
    this.sentimentHistory.push(snapshot);
    // Keep only the last 200 snapshots
    if (this.sentimentHistory.length > 200) {
      this.sentimentHistory = this.sentimentHistory.slice(-200);
    }
  }

  getSentimentHistory(): SentimentSnapshot[] {
    return [...this.sentimentHistory];
  }

  detectMoodByTime(): PatternSignal[] {
    if (this.sentimentHistory.length < 3) return [];

    const signals: PatternSignal[] = [];

    // Group by time period
    const periodSentiments = new Map<string, SentimentLabel[]>();
    for (const snap of this.sentimentHistory) {
      const period = this.getTimePeriodName(snap.hour);
      const list = periodSentiments.get(period) ?? [];
      list.push(snap.sentiment);
      periodSentiments.set(period, list);
    }

    for (const [period, sentiments] of periodSentiments) {
      if (sentiments.length < 3) continue;
      const dominant = this.getDominantSentiment(sentiments);
      if (dominant && dominant.label !== 'neutral' && dominant.ratio > 0.6) {
        signals.push({
          type: 'mood',
          pattern: `User tends to be ${dominant.label} in the ${period}`,
          confidence: Math.min(0.4 + dominant.ratio * 0.4, 0.85),
        });
      }
    }

    // Group by day of week
    const daySentiments = new Map<number, SentimentLabel[]>();
    for (const snap of this.sentimentHistory) {
      const list = daySentiments.get(snap.dayOfWeek) ?? [];
      list.push(snap.sentiment);
      daySentiments.set(snap.dayOfWeek, list);
    }

    for (const [day, sentiments] of daySentiments) {
      if (sentiments.length < 3) continue;
      const dominant = this.getDominantSentiment(sentiments);
      if (dominant && dominant.label !== 'neutral' && dominant.ratio > 0.7) {
        signals.push({
          type: 'mood',
          pattern: `User tends to be ${dominant.label} on ${DAY_NAMES[day]}s`,
          confidence: Math.min(0.4 + dominant.ratio * 0.4, 0.85),
        });
      }
    }

    return signals;
  }

  private getDominantSentiment(sentiments: SentimentLabel[]): { label: SentimentLabel; ratio: number } | null {
    const counts: Record<SentimentLabel, number> = { positive: 0, negative: 0, neutral: 0 };
    for (const s of sentiments) {
      counts[s]++;
    }
    const total = sentiments.length;
    const entries: Array<[SentimentLabel, number]> = [
      ['positive', counts.positive],
      ['negative', counts.negative],
      ['neutral', counts.neutral],
    ];
    entries.sort((a, b) => b[1] - a[1]);
    return { label: entries[0][0], ratio: entries[0][1] / total };
  }

  private getTimePeriodName(hour: number): string {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  detect(messages: MessageInfo[]): PatternSignal[] {
    if (messages.length < 3) return [];

    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) return [];

    const signals: PatternSignal[] = [];

    signals.push(...this.detectCommunicationPatterns(userMessages));
    signals.push(...this.detectSchedulePatterns(userMessages));
    signals.push(...this.detectTopicPatterns(userMessages));
    signals.push(...this.detectMoodPatterns(userMessages));

    return signals;
  }

  private detectCommunicationPatterns(messages: MessageInfo[]): PatternSignal[] {
    const signals: PatternSignal[] = [];
    const lengths = messages.map(m => m.content.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

    if (avgLength < 50 && messages.length >= 5) {
      signals.push({
        type: 'communication',
        pattern: 'User prefers brief messages',
        confidence: Math.min(0.5 + messages.length * 0.05, 0.9),
      });
    } else if (avgLength > 200 && messages.length >= 5) {
      signals.push({
        type: 'communication',
        pattern: 'User writes detailed messages',
        confidence: Math.min(0.5 + messages.length * 0.05, 0.9),
      });
    }

    // Question frequency
    const questionMessages = messages.filter(m => m.content.includes('?'));
    const questionRatio = questionMessages.length / messages.length;
    if (questionRatio > 0.6 && messages.length >= 5) {
      signals.push({
        type: 'communication',
        pattern: 'User frequently asks questions',
        confidence: Math.min(0.4 + questionRatio * 0.5, 0.9),
      });
    }

    // Code-heavy detection
    const codeMessages = messages.filter(m =>
      m.content.includes('```') || m.content.includes('function ') || m.content.includes('const ') || m.content.includes('import '),
    );
    const codeRatio = codeMessages.length / messages.length;
    if (codeRatio > 0.3 && messages.length >= 5) {
      signals.push({
        type: 'communication',
        pattern: 'User frequently shares code snippets',
        confidence: Math.min(0.4 + codeRatio * 0.5, 0.9),
      });
    }

    return signals;
  }

  private detectSchedulePatterns(messages: MessageInfo[]): PatternSignal[] {
    const signals: PatternSignal[] = [];
    if (messages.length < 5) return signals;

    const hours = messages.map(m => new Date(m.timestamp).getHours());
    const hourCounts = new Map<number, number>();
    for (const h of hours) {
      hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
    }

    // Find the peak 3-hour window
    let peakStart = 0;
    let peakCount = 0;
    for (let h = 0; h < 24; h++) {
      const count =
        (hourCounts.get(h) ?? 0) +
        (hourCounts.get((h + 1) % 24) ?? 0) +
        (hourCounts.get((h + 2) % 24) ?? 0);
      if (count > peakCount) {
        peakCount = count;
        peakStart = h;
      }
    }

    const peakRatio = peakCount / messages.length;
    if (peakRatio > 0.5) {
      const peakEnd = (peakStart + 2) % 24;
      const period = this.getTimePeriod(peakStart);
      signals.push({
        type: 'schedule',
        pattern: `User is most active in the ${period} (${peakStart}:00-${peakEnd}:59)`,
        confidence: Math.min(0.4 + peakRatio * 0.5, 0.9),
      });
    }

    return signals;
  }

  private detectTopicPatterns(messages: MessageInfo[]): PatternSignal[] {
    const signals: PatternSignal[] = [];
    if (messages.length < 5) return signals;

    const wordCounts = new Map<string, number>();
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'and', 'but', 'or', 'not', 'so', 'yet', 'i', 'me', 'my', 'we', 'you',
      'your', 'he', 'she', 'they', 'it', 'what', 'which', 'who', 'when',
      'where', 'how', 'that', 'this', 'just', 'like', 'also', 'about',
      'than', 'too', 'very', 'its', 'them', 'their', 'our',
    ]);

    for (const msg of messages) {
      const words = msg.content
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));

      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
      }
    }

    const topWords = Array.from(wordCounts.entries())
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topWords.length >= 2) {
      const topics = topWords.map(([word]) => word).join(', ');
      signals.push({
        type: 'topic',
        pattern: `User frequently discusses: ${topics}`,
        confidence: Math.min(0.5 + topWords.length * 0.05, 0.85),
      });
    }

    return signals;
  }

  private detectMoodPatterns(messages: MessageInfo[]): PatternSignal[] {
    const signals: PatternSignal[] = [];
    if (messages.length < 5) return signals;

    let enthusiastic = 0;
    let frustrated = 0;
    let casual = 0;

    for (const msg of messages) {
      const text = msg.content;
      if (text.includes('!') || /\b(great|awesome|love|amazing|excellent|perfect)\b/i.test(text)) {
        enthusiastic++;
      }
      if (/\b(ugh|damn|broken|bug|error|fail|wrong|issue|problem)\b/i.test(text)) {
        frustrated++;
      }
      if (/\b(lol|haha|heh|lmao|tbh|imo|btw|gonna|wanna)\b/i.test(text)) {
        casual++;
      }
    }

    const total = messages.length;

    if (enthusiastic / total > 0.3) {
      signals.push({
        type: 'mood',
        pattern: 'User tends to be enthusiastic and positive',
        confidence: Math.min(0.4 + (enthusiastic / total) * 0.5, 0.85),
      });
    }

    if (frustrated / total > 0.3) {
      signals.push({
        type: 'mood',
        pattern: 'User may be experiencing frustration',
        confidence: Math.min(0.4 + (frustrated / total) * 0.5, 0.85),
      });
    }

    if (casual / total > 0.3) {
      signals.push({
        type: 'mood',
        pattern: 'User uses casual, informal language',
        confidence: Math.min(0.4 + (casual / total) * 0.5, 0.85),
      });
    }

    return signals;
  }

  private getTimePeriod(hour: number): string {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }
}
