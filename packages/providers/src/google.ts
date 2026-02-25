import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_MAX_TOKENS = 4096;

export interface GoogleProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class GoogleProvider implements Provider {
  name = 'google';
  metadata: ProviderMetadata = {
    name: 'google',
    displayName: 'Google Gemini',
    models: {
      'gemini-2.5-flash': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.00015,
        costPer1kOutput: 0.0006,
        strengths: ['fast', 'code', 'reasoning'],
        isLocal: false,
      },
      'gemini-2.5-pro': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.00125,
        costPer1kOutput: 0.01,
        strengths: ['reasoning', 'code', 'long-context', 'creative'],
        isLocal: false,
      },
    },
    isAvailable: async () => {
      try {
        return this.client !== undefined;
      } catch {
        return false;
      }
    },
  };
  private client: GoogleGenerativeAI;
  readonly defaultModel: string;
  private defaultMaxTokens: number;

  constructor(options: GoogleProviderOptions) {
    this.client = new GoogleGenerativeAI(options.apiKey);
    this.defaultModel = options.model || DEFAULT_MODEL;
    this.defaultMaxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  }

  setActiveKey(apiKey: string): void {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    const modelName = options?.model || this.defaultModel;
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: options?.systemPrompt,
    });

    const { contents, systemInstruction } = this.prepareMessages(messages, options);
    const genModel = systemInstruction
      ? this.client.getGenerativeModel({ model: modelName, systemInstruction })
      : model;

    const result = await genModel.generateContent({
      contents,
      generationConfig: {
        maxOutputTokens: options?.maxTokens || this.defaultMaxTokens,
        temperature: options?.temperature,
      },
    });

    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

    return {
      content: text,
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
      },
      model: modelName,
      finishReason: response.candidates?.[0]?.finishReason ?? 'unknown',
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const modelName = options?.model || this.defaultModel;
    const { contents, systemInstruction } = this.prepareMessages(messages, options);
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: systemInstruction || options?.systemPrompt,
    });

    try {
      const result = await model.generateContentStream({
        contents,
        generationConfig: {
          maxOutputTokens: options?.maxTokens || this.defaultMaxTokens,
          temperature: options?.temperature,
        },
      });

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          yield { type: 'text', content: text };
        }
      }

      const finalResponse = await result.response;
      const usage = finalResponse.usageMetadata;
      const candidate = finalResponse.candidates?.[0];
      yield {
        type: 'done',
        finishReason: candidate?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : (candidate?.finishReason?.toLowerCase() || 'stop'),
        usage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
        },
      };
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private prepareMessages(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): { contents: Array<{ role: string; parts: Array<{ text: string }> }>; systemInstruction?: string } {
    let systemInstruction = options?.systemPrompt;
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = systemInstruction
          ? `${systemInstruction}\n\n${msg.content}`
          : msg.content;
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    // Gemini requires alternating user/model turns, starting with user
    if (contents.length > 0 && contents[0].role !== 'user') {
      contents.unshift({ role: 'user', parts: [{ text: '(Starting conversation)' }] });
    }

    return { contents, systemInstruction };
  }
}
