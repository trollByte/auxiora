import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailAdapter } from '../src/adapters/email.js';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

const createMockSocket = () => {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const socket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
      return socket;
    }),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
      // Auto-fire connect/secureConnect immediately
      if (event === 'connect' || event === 'secureConnect') {
        queueMicrotask(() => handler());
      }
      return socket;
    }),
    removeListener: vi.fn(),
    write: vi.fn((_data: string, cb?: (err?: Error | null) => void) => {
      cb?.();
      return true;
    }),
    destroy: vi.fn(),
    emit: (event: string, ...args: unknown[]) => {
      handlers[event]?.forEach((h) => h(...args));
    },
  };
  return socket;
};

// Mock node:net and node:tls
vi.mock('node:net', () => ({
  default: { connect: vi.fn(() => createMockSocket()) },
  connect: vi.fn(() => createMockSocket()),
}));

vi.mock('node:tls', () => ({
  default: { connect: vi.fn(() => createMockSocket()) },
  connect: vi.fn(() => createMockSocket()),
}));

describe('EmailAdapter', () => {
  let adapter: EmailAdapter;

  beforeEach(() => {
    adapter = new EmailAdapter({
      imapHost: 'imap.example.com',
      imapPort: 993,
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      email: 'bot@example.com',
      password: 'secret-password',
      pollInterval: 60000,
      allowedSenders: ['alice@example.com', 'bob@example.com'],
      tls: false,
    });
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(adapter.type).toBe('email');
    expect(adapter.name).toBe('Email');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should connect and disconnect', async () => {
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('should register message handler', () => {
    const handler = vi.fn();
    adapter.onMessage(handler);
  });

  it('should register error handler', () => {
    const handler = vi.fn();
    adapter.onError(handler);
  });

  it('should handle send when SMTP not connected', async () => {
    const result = await adapter.send('user@example.com', {
      content: 'Hello!',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('SMTP not connected');
  });

  it('should handle disconnect when not connected', async () => {
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('should accept allowed senders config', () => {
    const adapterWithAllowed = new EmailAdapter({
      imapHost: 'imap.example.com',
      imapPort: 993,
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      email: 'bot@example.com',
      password: 'pass',
      allowedSenders: ['trusted@example.com'],
    });

    expect(adapterWithAllowed.type).toBe('email');
  });

  it('should set default poll interval', () => {
    const adapterNoPoll = new EmailAdapter({
      imapHost: 'imap.example.com',
      imapPort: 993,
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      email: 'bot@example.com',
      password: 'pass',
    });

    expect(adapterNoPoll.type).toBe('email');
  });
});
