import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';

const DEFAULT_MODEL = 'meta/meta-llama-3-70b-instruct';
const DEFAULT_POLL_INTERVAL = 1000;
const BASE_URL = 'https://api.replicate.com/v1';

export interface ReplicateProviderOptions {
  apiToken: string;
  model?: string;
  pollInterval?: number;
}

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string[] | string;
  error?: string;
  metrics?: {
    predict_time?: number;
  };
}

export class ReplicateProvider implements Provider {
  name = 'replicate';
  metadata: ProviderMetadata = {
    name: 'replicate',
    displayName: 'Replicate',
    models: {
      'meta/meta-llama-3-70b-instruct': {
        maxContextTokens: 8192,
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: false,
        supportsImageGen: false,
        costPer1kInput: 0.00065,
        costPer1kOutput: 0.00275,
        strengths: ['reasoning', 'code'],
        isLocal: false,
      },
      'stability-ai/sdxl': {
        maxContextTokens: 0,
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: false,
        supportsImageGen: true,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        strengths: ['image-generation'],
        isLocal: false,
      },
    },
    isAvailable: async () => {
      try {
        const response = await fetch(`${BASE_URL}/models`, {
          headers: { Authorization: `Bearer ${this.apiToken}` },
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };

  private apiToken: string;
  private defaultModel: string;
  private pollInterval: number;

  constructor(options: ReplicateProviderOptions) {
    this.apiToken = options.apiToken;
    this.defaultModel = options.model || DEFAULT_MODEL;
    this.pollInterval = options.pollInterval || DEFAULT_POLL_INTERVAL;
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    const model = options?.model || this.defaultModel;
    const prompt = this.formatPrompt(messages, options);

    const prediction = await this.createPrediction(model, {
      prompt,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
    });

    const result = await this.pollPrediction(prediction.id);

    if (result.status === 'failed') {
      throw new Error(`Replicate prediction failed: ${result.error || 'unknown error'}`);
    }

    const output = Array.isArray(result.output)
      ? result.output.join('')
      : result.output || '';

    return {
      content: output,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
      model,
      finishReason: 'stop',
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const model = options?.model || this.defaultModel;
      const prompt = this.formatPrompt(messages, options);

      const response = await fetch(`${BASE_URL}/models/${model}/predictions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
          Prefer: 'respond-async',
        },
        body: JSON.stringify({
          input: {
            prompt,
            max_tokens: options?.maxTokens || 4096,
            temperature: options?.temperature,
          },
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Replicate API error: ${response.status} ${response.statusText}`);
      }

      const prediction = (await response.json()) as ReplicatePrediction;
      const streamUrl = `${BASE_URL}/predictions/${prediction.id}/stream`;

      const streamResponse = await fetch(streamUrl, {
        headers: { Authorization: `Bearer ${this.apiToken}`, Accept: 'text/event-stream' },
      });

      if (!streamResponse.ok || !streamResponse.body) {
        const result = await this.pollPrediction(prediction.id);
        const output = Array.isArray(result.output)
          ? result.output.join('')
          : result.output || '';
        yield { type: 'text', content: output };
        yield { type: 'done', usage: { inputTokens: 0, outputTokens: 0 } };
        return;
      }

      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          yield { type: 'text', content: data };
        }
      }

      yield { type: 'done', usage: { inputTokens: 0, outputTokens: 0 } };
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async createPrediction(
    model: string,
    input: Record<string, unknown>,
  ): Promise<ReplicatePrediction> {
    const response = await fetch(`${BASE_URL}/models/${model}/predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiToken}`,
        Prefer: 'respond-async',
      },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      throw new Error(`Replicate API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as ReplicatePrediction;
  }

  private async pollPrediction(id: string): Promise<ReplicatePrediction> {
    while (true) {
      const response = await fetch(`${BASE_URL}/predictions/${id}`, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });

      if (!response.ok) {
        throw new Error(`Replicate API error: ${response.status} ${response.statusText}`);
      }

      const prediction = (await response.json()) as ReplicatePrediction;

      if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
        return prediction;
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }
  }

  private formatPrompt(messages: ChatMessage[], options?: CompletionOptions): string {
    const parts: string[] = [];

    if (options?.systemPrompt) {
      parts.push(`<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${options.systemPrompt}<|eot_id|>`);
    }

    for (const msg of messages) {
      parts.push(`<|start_header_id|>${msg.role}<|end_header_id|>\n\n${msg.content}<|eot_id|>`);
    }

    parts.push('<|start_header_id|>assistant<|end_header_id|>\n\n');

    return parts.join('');
  }
}
