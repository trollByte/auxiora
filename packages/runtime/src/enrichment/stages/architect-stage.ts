import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

/** Structural type for TheArchitect — avoids import coupling. */
interface ArchitectLike {
  generatePrompt(
    userMessage: string,
    history?: ReadonlyArray<{ role: string; content: string }>,
  ): {
    contextModifier: string;
    detectedContext: Record<string, unknown>;
    activeTraits: ReadonlyArray<Record<string, unknown>>;
    emotionalTrajectory?: string;
    escalationAlert?: boolean;
    recommendation?: Record<string, unknown>;
    relevantDecisions?: ReadonlyArray<{ summary: string; status: string }>;
    feedbackInsight?: {
      weakDomains: string[];
      trend: string;
      suggestedAdjustments: Record<string, number>;
    };
  };
  getTraitMix(context: Record<string, unknown>): Record<string, number>;
}

/** Structural type for ArchitectBridge. */
interface BridgeLike {
  afterPrompt(
    detectedContext: Record<string, unknown>,
    emotionalTrajectory: string | undefined,
    escalationAlert: boolean | undefined,
    chatId: string,
  ): void;
}

/** Structural type for ArchitectAwarenessCollector. */
interface CollectorLike {
  updateToolContext(tools: ReadonlyArray<{ name: string; success: boolean }>): void;
}

export class ArchitectStage implements EnrichmentStage {
  readonly name = 'architect';
  readonly order = 300;

  constructor(
    private readonly architect: ArchitectLike,
    private readonly bridge?: BridgeLike,
    private readonly awarenessCollector?: CollectorLike,
    private readonly selfModelGetter?: () => Promise<{ selfNarrative?: string } | null>,
    private readonly userModelGetter?: () => { narrative?: string } | null,
  ) {}

  enabled(ctx: EnrichmentContext): boolean {
    return (ctx.config as any).agent?.personality === 'the-architect';
  }

  async enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    // GAP 1: Pass conversation history to generatePrompt
    const output = this.architect.generatePrompt(ctx.userMessage, ctx.history);

    // GAP 2: Feed tool usage to awareness collector
    if (this.awarenessCollector && ctx.toolsUsed.length > 0) {
      this.awarenessCollector.updateToolContext(ctx.toolsUsed);
    }

    // Bridge side effects: persistence, awareness feeding, escalation logging
    if (this.bridge && ctx.chatId) {
      this.bridge.afterPrompt(
        { ...output.detectedContext },
        output.emotionalTrajectory,
        output.escalationAlert,
        ctx.chatId,
      );
    }

    // GAP 3: Channel hint for non-webchat channels
    let channelHint = '';
    if (ctx.channelType && ctx.channelType !== 'webchat') {
      channelHint = `\n[Channel: ${ctx.channelType}]`;
    }

    // Build trait weights map
    const mix = this.architect.getTraitMix(output.detectedContext as Record<string, unknown>);
    const traitWeights: Record<string, number> = {};
    for (const [key, val] of Object.entries(mix)) {
      traitWeights[key] = val;
    }

    // Build consciousness section
    const consciousnessSection = await this.buildConsciousnessSection(output);

    // Assemble final prompt
    const prompt =
      currentPrompt +
      '\n\n' +
      output.contextModifier +
      channelHint +
      consciousnessSection;

    // GAP 4: Return full architect metadata including channelType
    return {
      prompt,
      metadata: {
        architect: {
          detectedContext: output.detectedContext,
          activeTraits: output.activeTraits,
          traitWeights,
          recommendation: output.recommendation,
          escalationAlert: output.escalationAlert,
          channelType: ctx.channelType,
        },
      },
    };
  }

  private async buildConsciousnessSection(output: ReturnType<ArchitectLike['generatePrompt']>): Promise<string> {
    const parts: string[] = [];

    // Active decisions (top 5)
    if (output.relevantDecisions && output.relevantDecisions.length > 0) {
      const items = output.relevantDecisions
        .slice(0, 5)
        .map((d) => `- ${d.summary} [${d.status}]`)
        .join('\n');
      parts.push(`**Active Decisions:**\n${items}`);
    }

    // Self-improvement notes from feedback
    if (output.feedbackInsight) {
      const fi = output.feedbackInsight;
      const notes: string[] = [];
      if (fi.weakDomains.length > 0) {
        notes.push(`Weak domains: ${fi.weakDomains.join(', ')}`);
      }
      if (fi.trend !== 'stable') {
        notes.push(`Satisfaction trend: ${fi.trend}`);
      }
      const adjustments = Object.entries(fi.suggestedAdjustments);
      if (adjustments.length > 0) {
        notes.push(
          `Suggested adjustments: ${adjustments.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')}`,
        );
      }
      if (notes.length > 0) {
        parts.push(`**Self-Improvement Notes:**\n${notes.map((n) => `- ${n}`).join('\n')}`);
      }
    }

    // Self-model narrative
    if (this.selfModelGetter) {
      const selfModel = await this.selfModelGetter();
      if (selfModel?.selfNarrative) {
        parts.push(`**Self-Model:**\n${selfModel.selfNarrative}`);
      }
    }

    // User model narrative
    if (this.userModelGetter) {
      const userModel = this.userModelGetter();
      if (userModel?.narrative) {
        parts.push(`**User Model:**\n${userModel.narrative}`);
      }
    }

    if (parts.length > 0) {
      return '\n\n[Consciousness]\n' + parts.join('\n\n');
    }
    return '';
  }
}
