import type { McpTransport } from './transports/transport.js';
import type {
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolDefinition,
  McpToolResult,
  McpInitializeResult,
} from './config-types.js';

type ConnectionState = 'disconnected' | 'connecting' | 'ready' | 'error';

export class McpConnection {
  private _state: ConnectionState = 'disconnected';
  private _tools: McpToolDefinition[] = [];
  private serverInfo: McpInitializeResult | null = null;
  private nextId = 1;
  private pendingRequests = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();

  constructor(
    readonly name: string,
    private readonly transport: McpTransport,
  ) {
    this.transport.onMessage((msg) => this.handleMessage(msg));
    this.transport.onError((err) => {
      this._state = 'error';
      for (const [, pending] of this.pendingRequests) {
        pending.reject(err);
      }
      this.pendingRequests.clear();
    });
  }

  get state(): ConnectionState {
    return this._state;
  }

  get tools(): McpToolDefinition[] {
    return this._tools;
  }

  async connect(): Promise<void> {
    this._state = 'connecting';
    await this.transport.open();

    // Step 1: Initialize handshake
    const initResult = (await this.sendRequest('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      clientInfo: { name: 'auxiora', version: '1.4.0' },
    })) as McpInitializeResult;

    this.serverInfo = initResult;

    // Step 2: Send initialized notification
    await this.transport.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    // Step 3: Discover tools
    const toolsResult = (await this.sendRequest('tools/list', {})) as {
      tools: McpToolDefinition[];
    };
    this._tools = toolsResult.tools;

    this._state = 'ready';
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
    this._state = 'disconnected';
    this._tools = [];
    this.pendingRequests.clear();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = (await this.sendRequest('tools/call', {
      name,
      arguments: args,
    })) as McpToolResult;
    return result;
  }

  async refreshTools(): Promise<McpToolDefinition[]> {
    const result = (await this.sendRequest('tools/list', {})) as {
      tools: McpToolDefinition[];
    };
    this._tools = result.tools;
    return this._tools;
  }

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, 30_000);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.transport.send(request).catch((err: Error) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }

  private handleMessage(msg: JsonRpcMessage): void {
    if ('id' in msg && msg.id !== undefined) {
      const response = msg as JsonRpcResponse;
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        if (response.error) {
          pending.reject(new Error(`MCP error ${response.error.code}: ${response.error.message}`));
        } else {
          pending.resolve(response.result);
        }
      }
    }
  }
}
