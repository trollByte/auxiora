import { describe, it, expect, vi } from 'vitest';
import { mountOpenAICompatRoutes } from '../src/openai-compat-routes.js';
import type { OpenAICompatDeps, CompletionResult } from '../src/openai-compat-routes.js';

function setup(deps: Partial<OpenAICompatDeps> = {}) {
  const routes: Record<string, Function> = {};
  const mockApp = {
    post: vi.fn((path: string, handler: Function) => { routes[path] = handler; }),
  } as any;

  const defaultComplete = vi.fn<(
    messages: Array<{ role: string; content: string }>,
    options: { model?: string; temperature?: number; maxTokens?: number },
  ) => Promise<CompletionResult>>().mockResolvedValue({
    content: 'Hello!',
    model: 'auxiora-1',
    usage: { promptTokens: 10, completionTokens: 5 },
  });

  const fullDeps: OpenAICompatDeps = {
    complete: defaultComplete,
    ...deps,
  };

  mountOpenAICompatRoutes(mockApp, fullDeps);

  return { routes, mockApp, defaultComplete };
}

function makeRes() {
  const res = {
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  } as any;
  return res;
}

describe('OpenAI-compatible /v1/chat/completions', () => {
  it('returns 401 without auth when authToken is configured', () => {
    const { routes } = setup({ authToken: 'secret-token' });
    const req = { headers: {}, body: { messages: [{ role: 'user', content: 'hi' }] } } as any;
    const res = makeRes();

    routes['/v1/chat/completions'](req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Invalid or missing API key', type: 'invalid_request_error' } });
  });

  it('returns 401 with wrong Bearer token', () => {
    const { routes } = setup({ authToken: 'secret-token' });
    const req = { headers: { authorization: 'Bearer wrong-token' }, body: { messages: [{ role: 'user', content: 'hi' }] } } as any;
    const res = makeRes();

    routes['/v1/chat/completions'](req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('skips auth check when no authToken configured', async () => {
    const { routes, defaultComplete } = setup();
    const req = { headers: {}, body: { messages: [{ role: 'user', content: 'hi' }] } } as any;
    const res = makeRes();

    await routes['/v1/chat/completions'](req, res);

    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(defaultComplete).toHaveBeenCalled();
  });

  it('returns 200 with valid Bearer token and OpenAI-format response', async () => {
    const { routes, defaultComplete } = setup({ authToken: 'secret-token' });
    const req = {
      headers: { authorization: 'Bearer secret-token' },
      body: {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 100,
      },
    } as any;
    const res = makeRes();

    await routes['/v1/chat/completions'](req, res);

    expect(defaultComplete).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Hello' }],
      { model: 'gpt-4', temperature: 0.7, maxTokens: 100 },
    );

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      object: 'chat.completion',
      model: 'auxiora-1',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    }));

    // Check id and created fields exist
    const response = res.json.mock.calls[0][0];
    expect(response.id).toMatch(/^chatcmpl-/);
    expect(typeof response.created).toBe('number');
  });

  it('returns 400 with missing messages', async () => {
    const { routes } = setup();
    const req = { headers: {}, body: {} } as any;
    const res = makeRes();

    await routes['/v1/chat/completions'](req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'messages is required and must be a non-empty array', type: 'invalid_request_error' },
    });
  });

  it('returns 400 with empty messages array', async () => {
    const { routes } = setup();
    const req = { headers: {}, body: { messages: [] } } as any;
    const res = makeRes();

    await routes['/v1/chat/completions'](req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('handles SSE streaming when stream=true and deps.stream is provided', async () => {
    async function* mockStream() {
      yield { type: 'delta', text: 'Hello' };
      yield { type: 'delta', text: ' world' };
      yield { type: 'done' };
    }

    const streamFn = vi.fn().mockReturnValue(mockStream());
    const { routes } = setup({ stream: streamFn });

    const req = {
      headers: {},
      body: {
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      },
    } as any;
    const res = makeRes();

    await routes['/v1/chat/completions'](req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');

    expect(streamFn).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hi' }],
      { model: undefined, temperature: undefined, maxTokens: undefined },
    );

    // Should have written SSE data lines for deltas
    const writes = res.write.mock.calls.map((c: any[]) => c[0]);
    const deltaWrites = writes.filter((w: string) => w.startsWith('data: {'));
    expect(deltaWrites.length).toBe(2);

    // Verify delta format
    const firstChunk = JSON.parse(deltaWrites[0].replace('data: ', '').trim());
    expect(firstChunk.object).toBe('chat.completion.chunk');
    expect(firstChunk.choices[0].delta.content).toBe('Hello');

    // Should end with [DONE]
    const lastWrite = writes[writes.length - 1];
    expect(lastWrite).toBe('data: [DONE]\n\n');

    expect(res.end).toHaveBeenCalled();
  });

  it('falls back to non-streaming when stream=true but deps.stream is not provided', async () => {
    const { routes, defaultComplete } = setup();
    const req = {
      headers: {},
      body: {
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      },
    } as any;
    const res = makeRes();

    await routes['/v1/chat/completions'](req, res);

    // Should fall back to complete()
    expect(defaultComplete).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('returns 500 on internal error', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('boom'));
    const { routes } = setup({ complete });
    const req = { headers: {}, body: { messages: [{ role: 'user', content: 'hi' }] } } as any;
    const res = makeRes();

    await routes['/v1/chat/completions'](req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'Internal server error', type: 'server_error' },
    });
  });
});
