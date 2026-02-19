import type { JsonRpcMessage } from '../config-types.js';
import type { McpTransport } from './transport.js';

export interface StreamableHttpTransportOptions {
  url: string;
  headers?: Record<string, string>;
}

export class StreamableHttpTransport implements McpTransport {
  private messageHandlers: Array<(msg: JsonRpcMessage) => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private _sessionId: string | null = null;

  constructor(private readonly options: StreamableHttpTransportOptions) {}

  get sessionId(): string | null {
    return this._sessionId;
  }

  async open(): Promise<void> {
    // Streamable HTTP is stateless per-request.
  }

  async close(): Promise<void> {
    this._sessionId = null;
    for (const handler of this.closeHandlers) handler();
  }

  async send(message: JsonRpcMessage): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...this.options.headers,
    };

    if (this._sessionId) {
      headers['Mcp-Session-Id'] = this._sessionId;
    }

    const response = await fetch(this.options.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
    });

    // Capture session ID
    const sessionHeader = response.headers.get('Mcp-Session-Id');
    if (sessionHeader) {
      this._sessionId = sessionHeader;
    }

    if (!response.ok) {
      throw new Error(`HTTP POST failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type') || '';

    if (contentType.includes('text/event-stream')) {
      await this.processSSEResponse(response);
    } else {
      const text = await response.text();
      if (text.trim()) {
        try {
          const msg = JSON.parse(text) as JsonRpcMessage;
          for (const handler of this.messageHandlers) handler(msg);
        } catch { /* Non-JSON response */ }
      }
    }
  }

  private async processSSEResponse(response: Response): Promise<void> {
    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const msg = JSON.parse(data) as JsonRpcMessage;
              for (const handler of this.messageHandlers) handler(msg);
            } catch { /* skip */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
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
