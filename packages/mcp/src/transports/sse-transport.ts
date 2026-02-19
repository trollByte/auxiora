import type { JsonRpcMessage } from '../config-types.js';
import type { McpTransport } from './transport.js';

export interface SseTransportOptions {
  url: string;
  headers?: Record<string, string>;
}

export class SseTransport implements McpTransport {
  private messageHandlers: Array<(msg: JsonRpcMessage) => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private abortController: AbortController | null = null;
  private postEndpoint: string | null = null;
  private readonly baseUrl: string;

  constructor(private readonly options: SseTransportOptions) {
    const parsed = new URL(options.url);
    this.baseUrl = `${parsed.protocol}//${parsed.host}`;
  }

  async open(): Promise<void> {
    this.abortController = new AbortController();

    const response = await fetch(this.options.url, {
      headers: {
        Accept: 'text/event-stream',
        ...this.options.headers,
      },
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('SSE response has no body');
    }

    // Process SSE stream in background
    this.processStream(response.body).catch((err) => {
      if (err.name !== 'AbortError') {
        for (const handler of this.errorHandlers) handler(err);
      }
    });

    // Wait for the endpoint event
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for SSE endpoint event')), 10_000);
      const check = setInterval(() => {
        if (this.postEndpoint) {
          clearTimeout(timeout);
          clearInterval(check);
          resolve();
        }
      }, 10);
    });
  }

  private async processStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventType = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (eventType === 'endpoint') {
              this.postEndpoint = data.trim();
            } else if (eventType === 'message') {
              try {
                const msg = JSON.parse(data) as JsonRpcMessage;
                for (const handler of this.messageHandlers) handler(msg);
              } catch {
                /* skip non-JSON */
              }
            }
            eventType = '';
          } else if (line === '') {
            eventType = '';
          }
        }
      }
    } finally {
      reader.releaseLock();
      for (const handler of this.closeHandlers) handler();
    }
  }

  async close(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
    this.postEndpoint = null;
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.postEndpoint) {
      throw new Error('Transport not connected');
    }

    const url = this.postEndpoint.startsWith('http')
      ? this.postEndpoint
      : `${this.baseUrl}${this.postEndpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.options.headers,
      },
      body: JSON.stringify(message),
    });

    if (!response.ok && response.status !== 202) {
      throw new Error(`POST failed: ${response.status} ${response.statusText}`);
    }
  }

  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }
}
