import type {
  SignalCollector, CollectionContext, PostResponseContext, AwarenessSignal, AwarenessStorage,
} from '../types.js';

const CLARIFICATION_PATTERNS = [
  'no, i meant',
  "that's not what i",
  'not what i asked',
  'i was asking about',
  'let me rephrase',
  'what i actually',
  'you misunderstood',
  'that is not what i',
  'no i meant',
  'try again',
];

interface ResponseFingerprint {
  keywords: string[];
  length: number;
  timestamp: number;
}

interface ReflectionState {
  fingerprints: ResponseFingerprint[];
}

export class ConversationReflector implements SignalCollector {
  readonly name = 'conversation-reflector';
  enabled = true;

  constructor(private storage: AwarenessStorage) {}

  async collect(context: CollectionContext): Promise<AwarenessSignal[]> {
    const signals: AwarenessSignal[] = [];

    const clarifications = this.countClarifications(context);
    if (clarifications > 0) {
      signals.push({
        dimension: this.name,
        priority: Math.min(0.7 + clarifications * 0.1, 1.0),
        text: clarifications === 1
          ? 'Conversation health: User may be rephrasing — verify you understood correctly.'
          : `Conversation health: User has rephrased ${clarifications} times — likely not getting the answer they need. Try a different approach.`,
        data: { type: 'clarification', count: clarifications },
      });
    }

    const state = await this.storage.read('reflections', context.chatId) as ReflectionState | null;
    if (state?.fingerprints && state.fingerprints.length >= 3) {
      const recent = state.fingerprints.slice(-3);
      if (this.areSimilar(recent)) {
        signals.push({
          dimension: this.name,
          priority: 0.8,
          text: 'Conversation health: Your recent responses are very similar — you may be repeating yourself.',
          data: { type: 'repetition', count: recent.length },
        });
      }
    }

    return signals;
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    const fp = this.fingerprint(context.response);
    const existing = await this.storage.read('reflections', context.chatId) as ReflectionState | null;
    const fingerprints = existing?.fingerprints ?? [];
    fingerprints.push(fp);
    if (fingerprints.length > 10) fingerprints.splice(0, fingerprints.length - 10);
    await this.storage.write('reflections', context.chatId, { fingerprints });
  }

  private countClarifications(context: CollectionContext): number {
    const messages = [
      ...context.recentMessages.filter(m => m.role === 'user'),
      { content: context.currentMessage },
    ];
    let count = 0;
    for (const msg of messages) {
      const lower = msg.content.toLowerCase();
      if (CLARIFICATION_PATTERNS.some(p => lower.includes(p))) {
        count++;
      }
    }
    return count;
  }

  private fingerprint(text: string): ResponseFingerprint {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    const keywords = [...freq.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([w]) => w);
    return { keywords, length: text.length, timestamp: Date.now() };
  }

  private areSimilar(fingerprints: ResponseFingerprint[]): boolean {
    if (fingerprints.length < 2) return false;
    const first = new Set(fingerprints[0].keywords);
    return fingerprints.slice(1).every(fp => {
      const overlap = fp.keywords.filter(k => first.has(k)).length;
      return overlap >= Math.min(5, first.size * 0.6);
    });
  }
}
