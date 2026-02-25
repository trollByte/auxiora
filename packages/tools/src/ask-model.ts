import type { ProviderFactory } from '@auxiora/providers';
import type { Tool, ToolResult, ExecutionContext } from './index.js';
import { ToolPermission } from './index.js';

let providerFactory: ProviderFactory | undefined;

export function setProviderFactory(factory: ProviderFactory): void {
  providerFactory = factory;
}

export const AskModelTool: Tool = {
  name: 'ask_model',
  description:
    'Ask a specific AI model a question. Use this to get a response from a different model than the one currently handling the conversation.',
  parameters: [
    {
      name: 'provider',
      type: 'string',
      description: 'Provider name (anthropic, openai, google, ollama)',
      required: true,
    },
    {
      name: 'model',
      type: 'string',
      description: 'Model name (e.g., gpt-4o, gemini-2.5-flash). If omitted, uses provider default.',
      required: false,
    },
    {
      name: 'prompt',
      type: 'string',
      description: 'The question or instruction to send',
      required: true,
    },
    {
      name: 'systemPrompt',
      type: 'string',
      description: 'Optional system prompt for context',
      required: false,
    },
  ],
  execute: async (
    params: { provider: string; model?: string; prompt: string; systemPrompt?: string },
    _context: ExecutionContext,
  ): Promise<ToolResult> => {
    if (!providerFactory) {
      return {
        success: false,
        error: 'Provider factory not initialized. No AI providers available.',
      };
    }

    try {
      const provider = providerFactory.getProvider(params.provider);
      const result = await provider.complete(
        [{ role: 'user', content: params.prompt }],
        {
          model: params.model,
          systemPrompt: params.systemPrompt,
          maxTokens: 4096,
        },
      );

      return {
        success: true,
        output: result.content,
        metadata: {
          model: result.model,
          provider: params.provider,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
  getPermission: () => ToolPermission.AUTO_APPROVE,
};
