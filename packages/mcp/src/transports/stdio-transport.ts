import { spawn, type ChildProcess } from 'node:child_process';
import type { JsonRpcMessage } from '../config-types.js';
import type { McpTransport } from './transport.js';

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export class StdioTransport implements McpTransport {
  private process: ChildProcess | null = null;
  private messageHandlers: Array<(msg: JsonRpcMessage) => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private buffer = '';

  constructor(private readonly options: StdioTransportOptions) {}

  async open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.process = spawn(this.options.command, this.options.args ?? [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.options.env },
          cwd: this.options.cwd,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        for (const handler of this.errorHandlers) handler(error);
        reject(error);
        return;
      }

      let settled = false;

      this.process.on('error', (err) => {
        for (const handler of this.errorHandlers) handler(err);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      this.process.stdout!.setEncoding('utf8');
      this.process.stdout!.on('data', (chunk: string) => {
        this.buffer += chunk;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as JsonRpcMessage;
            for (const handler of this.messageHandlers) handler(msg);
          } catch {
            // Skip non-JSON lines
          }
        }
      });

      this.process.stderr!.setEncoding('utf8');
      this.process.stderr!.on('data', (_chunk: string) => {
        // stderr is for logging in MCP spec
      });

      this.process.on('close', () => {
        for (const handler of this.closeHandlers) handler();
      });

      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      }, 50);
    });
  }

  async close(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.process?.stdin?.writable) {
      throw new Error('Transport not connected');
    }
    const data = JSON.stringify(message) + '\n';
    return new Promise<void>((resolve, reject) => {
      this.process!.stdin!.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
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
