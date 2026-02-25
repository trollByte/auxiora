import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

interface SelfAwarenessAssemblerLike {
  assemble(ctx: {
    userId: string;
    sessionId: string;
    chatId: string;
    currentMessage: string;
    recentMessages: Array<{ role: string; content: string }>;
  }): Promise<string | null>;
}

export class SelfAwarenessStage implements EnrichmentStage {
  readonly name = 'self-awareness';
  readonly order = 400;

  constructor(private readonly assembler: SelfAwarenessAssemblerLike) {}

  enabled(_ctx: EnrichmentContext): boolean {
    return true;
  }

  async enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const fragment = await this.assembler.assemble({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      chatId: ctx.chatId,
      currentMessage: ctx.userMessage,
      recentMessages: ctx.history as Array<{ role: string; content: string }>,
    });

    if (!fragment) return { prompt: currentPrompt };
    return { prompt: currentPrompt + '\n\n[Dynamic Self-Awareness]\n' + fragment };
  }
}
