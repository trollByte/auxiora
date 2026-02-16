import type {
  SignalCollector, CollectionContext, PostResponseContext, AwarenessSignal, AwarenessStorage,
} from '../types.js';

interface MetaState {
  responseLengths: number[];
  insights: string[];
}

export class MetaCognitor implements SignalCollector {
  readonly name = 'meta-cognitor';
  enabled = true;

  constructor(private storage: AwarenessStorage) {}

  async collect(context: CollectionContext): Promise<AwarenessSignal[]> {
    const state = await this.storage.read('meta', context.chatId) as MetaState | null;
    if (!state?.insights?.length) return [];

    return state.insights.map((insight, i) => ({
      dimension: this.name,
      priority: 0.2 + (i === 0 ? 0.1 : 0),
      text: `Meta: ${insight}`,
      data: { insight },
    }));
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    const existing = await this.storage.read('meta', context.chatId) as MetaState | null;
    const responseLengths = existing?.responseLengths ?? [];
    const insights = existing?.insights ?? [];

    responseLengths.push(context.response.length);

    if (responseLengths.length > 10) {
      responseLengths.splice(0, responseLengths.length - 10);
    }

    if (responseLengths.length >= 4) {
      const recent = responseLengths.slice(-4);
      const isIncreasing = recent.every((val, i) => i === 0 || val > recent[i - 1] * 1.3);
      const isDecreasing = recent.every((val, i) => i === 0 || val < recent[i - 1] * 0.7);

      if (isIncreasing && !insights.some(i => i.includes('length trending up'))) {
        insights.push('Response length trending up significantly — consider being more concise.');
      }
      if (isDecreasing && !insights.some(i => i.includes('length trending down'))) {
        insights.push('Response length trending down — ensure you are providing enough detail.');
      }
    }

    if (insights.length > 5) {
      insights.splice(0, insights.length - 5);
    }

    await this.storage.write('meta', context.chatId, { responseLengths, insights });
  }
}
