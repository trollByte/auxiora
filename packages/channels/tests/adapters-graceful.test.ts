import { describe, it, expect, vi } from 'vitest';
import { audit } from '@auxiora/audit';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

// Mock discord.js
vi.mock('discord.js', () => {
  class MockClient {
    user: { id: string; tag: string } | null = null;
    channels = { cache: new Map(), fetch: vi.fn() };
    on() { return this; }
    async login() { this.user = { id: 'bot', tag: 'Bot#0001' }; }
    destroy() {}
  }
  return {
    Client: MockClient,
    GatewayIntentBits: { Guilds: 1, GuildMessages: 2, DirectMessages: 4, MessageContent: 8 },
    Partials: { Channel: 0, Message: 1 },
    ChannelType: { GuildText: 0 },
  };
});

// Mock @slack/bolt
vi.mock('@slack/bolt', () => {
  class MockApp {
    client = { auth: { test: vi.fn() }, chat: { postMessage: vi.fn(), update: vi.fn() } };
    message = vi.fn();
    event = vi.fn();
    error = vi.fn();
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
  }
  return { App: MockApp, LogLevel: { WARN: 'warn' } };
});

// Mock grammy
vi.mock('grammy', () => {
  class MockBot {
    api = { setWebhook: vi.fn(), sendMessage: vi.fn(), sendChatAction: vi.fn(), editMessageText: vi.fn() };
    on = vi.fn();
    catch = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    handleUpdate = vi.fn();
  }
  return { Bot: MockBot, Context: class {} };
});

// Mock twilio
vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: vi.fn() } })),
}));

import { DiscordAdapter } from '../src/adapters/discord.js';
import { SlackAdapter } from '../src/adapters/slack.js';
import { TelegramAdapter } from '../src/adapters/telegram.js';
import { SignalAdapter } from '../src/adapters/signal.js';
import { EmailAdapter } from '../src/adapters/email.js';
import { TeamsAdapter } from '../src/adapters/teams.js';
import { MatrixAdapter } from '../src/adapters/matrix.js';
import { WhatsAppAdapter } from '../src/adapters/whatsapp.js';

describe('Channel adapters graceful degradation', () => {
  it('Discord: skips connect when token is missing', async () => {
    const adapter = new DiscordAdapter({ token: '' });
    await adapter.connect();
    expect(adapter.isConnected()).toBe(false);
    expect(audit).toHaveBeenCalledWith('channel.skipped', expect.objectContaining({ channelType: 'discord' }));
  });

  it('Slack: skips connect when botToken is missing', async () => {
    const adapter = new SlackAdapter({ botToken: '', appToken: '' });
    await adapter.connect();
    expect(adapter.isConnected()).toBe(false);
    expect(audit).toHaveBeenCalledWith('channel.skipped', expect.objectContaining({ channelType: 'slack' }));
  });

  it('Slack: skips connect when appToken is missing', async () => {
    const adapter = new SlackAdapter({ botToken: 'xoxb-test', appToken: '' });
    await adapter.connect();
    expect(adapter.isConnected()).toBe(false);
    expect(audit).toHaveBeenCalledWith('channel.skipped', expect.objectContaining({ channelType: 'slack' }));
  });

  it('Telegram: skips connect when token is missing', async () => {
    const adapter = new TelegramAdapter({ token: '' });
    await adapter.connect();
    expect(adapter.isConnected()).toBe(false);
    expect(audit).toHaveBeenCalledWith('channel.skipped', expect.objectContaining({ channelType: 'telegram' }));
  });

  it('Signal: skips connect when signalCliEndpoint is missing', async () => {
    const adapter = new SignalAdapter({ signalCliEndpoint: '', phoneNumber: '+1234' });
    await adapter.connect();
    expect(adapter.isConnected()).toBe(false);
    expect(audit).toHaveBeenCalledWith('channel.skipped', expect.objectContaining({ channelType: 'signal' }));
  });

  it('Signal: skips connect when phoneNumber is missing', async () => {
    const adapter = new SignalAdapter({ signalCliEndpoint: 'http://localhost:8080', phoneNumber: '' });
    await adapter.connect();
    expect(adapter.isConnected()).toBe(false);
    expect(audit).toHaveBeenCalledWith('channel.skipped', expect.objectContaining({ channelType: 'signal' }));
  });

  it('Email: skips connect when IMAP/SMTP credentials are missing', async () => {
    const adapter = new EmailAdapter({
      imapHost: '',
      imapPort: 993,
      smtpHost: '',
      smtpPort: 587,
      email: '',
      password: '',
    });
    await adapter.connect();
    expect(adapter.isConnected()).toBe(false);
    expect(audit).toHaveBeenCalledWith('channel.skipped', expect.objectContaining({ channelType: 'email' }));
  });

  it('Teams: skips connect when microsoftAppId is missing', async () => {
    const adapter = new TeamsAdapter({ microsoftAppId: '', microsoftAppPassword: '' });
    await adapter.connect();
    expect(adapter.isConnected()).toBe(false);
    expect(audit).toHaveBeenCalledWith('channel.skipped', expect.objectContaining({ channelType: 'teams' }));
  });

  it('Matrix: skips connect when homeserverUrl is missing', async () => {
    const adapter = new MatrixAdapter({ homeserverUrl: '', userId: '@bot:example.com', accessToken: '' });
    await adapter.connect();
    expect(adapter.isConnected()).toBe(false);
    expect(audit).toHaveBeenCalledWith('channel.skipped', expect.objectContaining({ channelType: 'matrix' }));
  });

  it('Matrix: skips connect when accessToken is missing', async () => {
    const adapter = new MatrixAdapter({ homeserverUrl: 'https://matrix.org', userId: '@bot:example.com', accessToken: '' });
    await adapter.connect();
    expect(adapter.isConnected()).toBe(false);
    expect(audit).toHaveBeenCalledWith('channel.skipped', expect.objectContaining({ channelType: 'matrix' }));
  });

  it('WhatsApp: skips connect when accessToken is missing', async () => {
    const adapter = new WhatsAppAdapter({ phoneNumberId: '123', accessToken: '', verifyToken: '' });
    await adapter.connect();
    expect(adapter.isConnected()).toBe(false);
    expect(audit).toHaveBeenCalledWith('channel.skipped', expect.objectContaining({ channelType: 'whatsapp' }));
  });
});
