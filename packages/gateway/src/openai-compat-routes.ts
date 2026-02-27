import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export interface CompletionResult {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
}

export interface OpenAICompatDeps {
  complete: (messages: Array<{ role: string; content: string }>, options: {
    model?: string; temperature?: number; maxTokens?: number;
  }) => Promise<CompletionResult>;
  stream?: (messages: Array<{ role: string; content: string }>, options: {
    model?: string; temperature?: number; maxTokens?: number;
  }) => AsyncGenerator<{ type: string; text?: string }>;
  authToken?: string;
}

function generateId(): string {
  return `chatcmpl-${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export function mountOpenAICompatRoutes(app: Express, deps: OpenAICompatDeps): void {
  app.post('/v1/chat/completions', async (req: Request, res: Response) => {
    // Auth check
    if (deps.authToken) {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${deps.authToken}`) {
        res.status(401).json({
          error: { message: 'Invalid or missing API key', type: 'invalid_request_error' },
        });
        return;
      }
    }

    const { messages, model, temperature, max_tokens, stream } = req.body ?? {};

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error: { message: 'messages is required and must be a non-empty array', type: 'invalid_request_error' },
      });
      return;
    }

    const options = {
      model: model as string | undefined,
      temperature: temperature as number | undefined,
      maxTokens: max_tokens as number | undefined,
    };

    try {
      // Streaming path
      if (stream && deps.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const id = generateId();
        const created = Math.floor(Date.now() / 1000);
        const generator = deps.stream(messages, options);

        for await (const chunk of generator) {
          if (chunk.type === 'delta' && chunk.text !== undefined) {
            const data = {
              id,
              object: 'chat.completion.chunk',
              created,
              model: model ?? 'auxiora-1',
              choices: [{
                index: 0,
                delta: { content: chunk.text },
                finish_reason: null,
              }],
            };
            res.write(`data: ${JSON.stringify(data)}\n\n`);
          }
        }

        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      // Non-streaming path
      const result = await deps.complete(messages, options);

      res.json({
        id: generateId(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: result.model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: result.content },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.promptTokens + result.usage.completionTokens,
        },
      });
    } catch {
      res.status(500).json({
        error: { message: 'Internal server error', type: 'server_error' },
      });
    }
  });
}
