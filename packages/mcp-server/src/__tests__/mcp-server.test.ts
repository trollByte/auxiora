import { describe, it, expect, vi } from 'vitest';
import { createMcpServer } from '../index.js';

describe('createMcpServer', () => {
  it('creates a server with all tools registered', () => {
    const server = createMcpServer({});
    expect(server).toBeDefined();
  });

  it('creates server with memory store deps', () => {
    const mockStore = {
      search: vi.fn().mockResolvedValue([
        {
          id: 'mem-1',
          content: 'test memory',
          category: 'fact',
          importance: 0.5,
          tags: [],
          source: 'explicit',
          createdAt: 1000,
        },
      ]),
      getAll: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue({
        id: 'mem-new',
        content: 'new memory',
        category: 'fact',
        importance: 0.5,
        tags: [],
        source: 'explicit',
        createdAt: Date.now(),
      }),
      remove: vi.fn().mockResolvedValue(true),
    };
    const server = createMcpServer({ memoryStore: mockStore });
    expect(server).toBeDefined();
  });

  it('creates server with user model deps', () => {
    const getUserModel = vi.fn().mockReturnValue({
      narrative: 'Test user',
      totalInteractions: 10,
    });
    const server = createMcpServer({ getUserModel });
    expect(server).toBeDefined();
  });

  it('creates server with personality deps', () => {
    const getPersonality = vi.fn().mockResolvedValue({
      name: 'The Architect',
      traits: { warmth: 0.7 },
    });
    const server = createMcpServer({ getPersonality });
    expect(server).toBeDefined();
  });

  it('creates server with send message deps', () => {
    const sendMessage = vi.fn().mockResolvedValue('Hello back!');
    const server = createMcpServer({ sendMessage });
    expect(server).toBeDefined();
  });

  it('creates server with all deps provided', () => {
    const server = createMcpServer({
      memoryStore: {
        search: vi.fn().mockResolvedValue([]),
        getAll: vi.fn().mockResolvedValue([]),
        add: vi.fn().mockResolvedValue({
          id: 'x',
          content: '',
          category: 'fact',
          importance: 0,
          tags: [],
          source: 'explicit',
          createdAt: 0,
        }),
        remove: vi.fn().mockResolvedValue(false),
      },
      getUserModel: vi.fn().mockReturnValue(null),
      getPersonality: vi.fn().mockResolvedValue({}),
      sendMessage: vi.fn().mockResolvedValue('ok'),
    });
    expect(server).toBeDefined();
  });
});
