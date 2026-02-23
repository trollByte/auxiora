import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

export class GroupContextStage implements EnrichmentStage {
  readonly name = 'group-context';
  readonly order = 150;

  enabled(ctx: EnrichmentContext): boolean {
    return ctx.groupContext?.isGroup === true;
  }

  async enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const parts: string[] = ['You are in a group chat'];

    if (ctx.groupContext?.groupName) {
      parts[0] += ` called "${ctx.groupContext.groupName}"`;
    }

    if (ctx.groupContext?.participantCount) {
      parts.push(`with ~${ctx.groupContext.participantCount} participants`);
    }

    const instruction = [parts.join(' ') + '.'];

    if (ctx.senderName) {
      instruction.push(`The current speaker is ${ctx.senderName}. Address them by name.`);
    }

    instruction.push('Keep responses concise — group chats move fast.');

    const section = '\n\n[Group Context]\n' + instruction.join(' ');
    return { prompt: currentPrompt + section };
  }
}
