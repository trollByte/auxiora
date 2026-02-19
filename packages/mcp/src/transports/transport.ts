import type { JsonRpcMessage } from '../config-types.js';

export interface McpTransport {
  open(): Promise<void>;
  close(): Promise<void>;
  send(message: JsonRpcMessage): Promise<void>;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: () => void): void;
}
