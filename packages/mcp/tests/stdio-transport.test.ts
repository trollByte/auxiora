import { describe, it, expect, afterEach } from 'vitest';
import { StdioTransport } from '../src/transports/stdio-transport.js';
import type { JsonRpcMessage } from '../src/config-types.js';

describe('StdioTransport', () => {
  let transport: StdioTransport;

  afterEach(async () => {
    try { await transport?.close(); } catch { /* ignore */ }
  });

  it('opens a child process and sends/receives JSON-RPC messages', async () => {
    transport = new StdioTransport({
      command: 'node',
      args: ['-e', `
        process.stdin.setEncoding('utf8');
        let buf = '';
        process.stdin.on('data', (chunk) => {
          buf += chunk;
          const lines = buf.split('\\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const msg = JSON.parse(line);
            const response = { jsonrpc: '2.0', id: msg.id, result: { echo: msg.method } };
            process.stdout.write(JSON.stringify(response) + '\\n');
          }
        });
      `],
    });

    const messages: JsonRpcMessage[] = [];
    transport.onMessage((msg) => messages.push(msg));

    await transport.open();

    await transport.send({ jsonrpc: '2.0', id: 1, method: 'test', params: {} });

    // Wait for response
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (messages.length > 0) {
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { echo: 'test' },
    });
  });

  it('emits onClose when child process exits', async () => {
    transport = new StdioTransport({
      command: 'node',
      args: ['-e', 'setTimeout(() => process.exit(0), 50)'],
    });

    let closed = false;
    transport.onClose(() => { closed = true; });
    await transport.open();

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(closed).toBe(true);
  });

  it('emits onError for invalid command', async () => {
    transport = new StdioTransport({
      command: 'nonexistent-command-12345',
      args: [],
    });

    let error: Error | undefined;
    transport.onError((e) => { error = e; });

    await expect(transport.open()).rejects.toThrow();
  });
});
