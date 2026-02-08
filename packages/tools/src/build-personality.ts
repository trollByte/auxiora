import type { Tool, ToolParameter, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { SoulConversationBuilder } from '@auxiora/personality';
import type { ConversationResult } from '@auxiora/personality';

const activeSessions = new Map<string, SoulConversationBuilder>();

function formatResult(result: ConversationResult, progress: number): ToolResult {
  if (result.done) {
    return {
      success: true,
      output: JSON.stringify({
        done: true,
        progress: 100,
        config: result.config,
        soulMd: result.soulMd,
      }),
    };
  }

  return {
    success: true,
    output: JSON.stringify({
      done: false,
      progress,
      question: result.question.text,
      hint: result.question.hint,
    }),
  };
}

export const BuildPersonalityTool: Tool = {
  name: 'build_personality',
  description: 'Start or continue an interactive personality building conversation. Call with no answer to start, or provide an answer to the current question to continue. The tool will return questions one at a time until the personality is fully configured.',

  parameters: [
    {
      name: 'answer',
      type: 'string',
      description: 'Answer to the current personality question. Omit to start a new conversation.',
      required: false,
    },
    {
      name: 'session_id',
      type: 'string',
      description: 'Session ID to track the conversation. Defaults to "default".',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      const sessionId = params.session_id || 'default';
      const answer = params.answer as string | undefined;

      if (!answer) {
        // Start a new conversation
        const builder = new SoulConversationBuilder();
        activeSessions.set(sessionId, builder);
        const result = builder.startConversation();
        return formatResult(result, builder.getProgress());
      }

      // Continue existing conversation
      const existing = activeSessions.get(sessionId);
      if (!existing) {
        return {
          success: false,
          error: 'No active personality building session. Call without an answer to start one.',
        };
      }

      const result = existing.processAnswer(answer);
      const progress = existing.getProgress();

      // Clean up completed sessions
      if (result.done) {
        activeSessions.delete(sessionId);
      }

      return formatResult(result, progress);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
