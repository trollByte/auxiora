import { getLogger } from '@auxiora/logger';
import type { Behavior, BehaviorExecution } from './types.js';

const logger = getLogger('behaviors:executor');

export interface ExecutorDeps {
  getProvider: () => {
    name: string;
    complete: (messages: Array<{ role: string; content: string }>, options?: any) => Promise<{
      content: string;
      usage: { inputTokens: number; outputTokens: number };
      model: string;
      finishReason: string;
    }>;
  };
  sendToChannel: (
    channelType: string,
    channelId: string,
    message: { content: string }
  ) => Promise<{ success: boolean; error?: string }>;
  getSystemPrompt: () => string;
  executeWithTools?: (
    messages: Array<{ role: string; content: string }>,
    systemPrompt: string,
  ) => Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }>;
}

export class BehaviorExecutor {
  private deps: ExecutorDeps;

  constructor(deps: ExecutorDeps) {
    this.deps = deps;
  }

  async execute(behavior: Behavior): Promise<BehaviorExecution> {
    const startedAt = new Date().toISOString();
    logger.info('Executing behavior', { id: behavior.id, type: behavior.type, action: behavior.action });

    try {
      const provider = this.deps.getProvider();
      const messages = this.buildMessages(behavior);
      const systemPrompt = this.buildSystemPrompt(behavior);

      const result = await provider.complete(messages, { systemPrompt });
      const content = result.content;

      logger.debug('Behavior AI response received', {
        id: behavior.id,
        tokens: result.usage,
      });

      // Deliver to channel
      const label = this.getLabel(behavior);
      const formattedContent = label + '\n' + content;

      const sendResult = await this.deps.sendToChannel(
        behavior.channel.type,
        behavior.channel.id,
        { content: formattedContent }
      );

      if (!sendResult.success) {
        logger.warn('Failed to deliver behavior result', {
          id: behavior.id,
          channelType: behavior.channel.type,
          error: sendResult.error ? new Error(sendResult.error) : undefined,
        });

        return {
          behaviorId: behavior.id,
          startedAt,
          completedAt: new Date().toISOString(),
          success: false,
          error: 'Delivery failed: ' + sendResult.error,
        };
      }

      logger.info('Behavior executed successfully', { id: behavior.id });

      return {
        behaviorId: behavior.id,
        startedAt,
        completedAt: new Date().toISOString(),
        success: true,
        result: content,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Behavior execution failed', { id: behavior.id, error: new Error(errorMessage) });

      return {
        behaviorId: behavior.id,
        startedAt,
        completedAt: new Date().toISOString(),
        success: false,
        error: errorMessage,
      };
    }
  }

  private buildMessages(behavior: Behavior): Array<{ role: string; content: string }> {
    if (behavior.type === 'monitor' && behavior.polling?.condition) {
      return [
        {
          role: 'user',
          content: behavior.action + '\n\nIMPORTANT: Only provide a result if this condition is met: ' + behavior.polling.condition + '\nIf the condition is NOT met, respond with exactly: [CONDITION_NOT_MET]',
        },
      ];
    }

    return [{ role: 'user', content: behavior.action }];
  }

  private buildSystemPrompt(behavior: Behavior): string {
    const base = this.deps.getSystemPrompt();
    const context = '\n\n---\nThis is an automated proactive behavior execution. Behavior ID: ' + behavior.id + '. Be concise and direct in your response.';
    return base + context;
  }

  private getLabel(behavior: Behavior): string {
    switch (behavior.type) {
      case 'scheduled':
        return '**[Scheduled]** _' + behavior.action.slice(0, 50) + '_';
      case 'monitor':
        return '**[Monitor Alert]** _' + (behavior.polling?.condition || behavior.action.slice(0, 50)) + '_';
      case 'one-shot':
        return '**[Reminder]**';
      default:
        return '**[Behavior]**';
    }
  }
}
