import type {
  SignalCollector, CollectionContext, PostResponseContext, AwarenessSignal, AwarenessStorage,
} from '../types.js';

const HEDGE_PHRASES = [
  "i think", "i believe", "i'm not sure", "i'm not entirely sure",
  "it might be", "it could be", "probably", "possibly", "if i recall",
  "i may be wrong", "not certain",
];

const CORRECTION_PATTERNS = [
  'actually,', "that's wrong", "that's not right", "that's incorrect",
  "you're wrong", "no, it's", "no it's", "you missed", "you forgot",
  "you didn't mention",
];

interface TopicEntry {
  topic: string;
  hedgeCount: number;
  correctionCount: number;
  lastSeen: number;
}

interface KnowledgeMap {
  topics: TopicEntry[];
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'about', 'what', 'when',
  'where', 'which', 'their', 'there', 'these', 'those', 'been',
  'being', 'would', 'could', 'should', 'more', 'some', 'help',
  'tell', 'explain', 'know', 'does', 'will', 'also', 'just',
  'than', 'then', 'them', 'they', 'into', 'your', 'very',
]);

export class KnowledgeBoundary implements SignalCollector {
  readonly name = 'knowledge-boundary';
  enabled = true;

  constructor(private storage: AwarenessStorage) {}

  async collect(context: CollectionContext): Promise<AwarenessSignal[]> {
    const map = await this.storage.read('knowledge-map', context.userId) as KnowledgeMap | null;
    if (!map?.topics?.length) return [];

    const signals: AwarenessSignal[] = [];
    const msgLower = context.currentMessage.toLowerCase();

    for (const entry of map.topics) {
      if (entry.correctionCount >= 1 && msgLower.includes(entry.topic)) {
        signals.push({
          dimension: this.name,
          priority: Math.min(0.7 + entry.correctionCount * 0.1, 1.0),
          text: `Knowledge boundary: User previously corrected you about "${entry.topic}" (${entry.correctionCount} correction${entry.correctionCount > 1 ? 's' : ''}). Verify claims carefully.`,
          data: { topic: entry.topic, corrections: entry.correctionCount, hedges: entry.hedgeCount },
        });
      }
    }

    return signals;
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    const map = await this.storage.read('knowledge-map', context.userId) as KnowledgeMap | null;
    const topics: TopicEntry[] = map?.topics ?? [];

    const topic = this.extractTopic(context.currentMessage);
    if (!topic) return;

    let entry = topics.find(t => t.topic === topic);
    if (!entry) {
      entry = { topic, hedgeCount: 0, correctionCount: 0, lastSeen: Date.now() };
      topics.push(entry);
    }
    entry.lastSeen = Date.now();

    const responseLower = context.response.toLowerCase();
    if (HEDGE_PHRASES.some(h => responseLower.includes(h))) {
      entry.hedgeCount++;
    }

    const msgLower = context.currentMessage.toLowerCase();
    if (CORRECTION_PATTERNS.some(p => msgLower.includes(p))) {
      entry.correctionCount++;
    }

    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const pruned = topics.filter(t => t.lastSeen > cutoff);

    await this.storage.write('knowledge-map', context.userId, { topics: pruned });
  }

  private extractTopic(message: string): string | null {
    const words = message.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    if (words.length === 0) return null;
    return words.slice(0, 3).join(' ');
  }
}
