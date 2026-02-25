import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AgentRouter,
  AgentInstance,
  type AgentRoutingConfig,
  type AgentConfig,
} from '../src/agent-router.js';

describe('AgentInstance', () => {
  let instance: AgentInstance;

  afterEach(() => {
    instance?.destroy();
  });

  it('should store config values', () => {
    instance = new AgentInstance({
      id: 'agent-1',
      name: 'Support Bot',
      systemPrompt: 'You are a support bot.',
      workspacePath: '/tmp/support',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });

    expect(instance.id).toBe('agent-1');
    expect(instance.name).toBe('Support Bot');
    expect(instance.systemPrompt).toBe('You are a support bot.');
    expect(instance.workspacePath).toBe('/tmp/support');
    expect(instance.providerOverride).toBe('anthropic');
    expect(instance.modelOverride).toBe('claude-sonnet-4-20250514');
  });

  it('should use defaults for missing config', () => {
    instance = new AgentInstance({ id: 'agent-2', name: 'Default' });

    expect(instance.systemPrompt).toBe('');
    expect(instance.workspacePath).toBe('');
    expect(instance.providerOverride).toBeUndefined();
    expect(instance.modelOverride).toBeUndefined();
  });

  it('should provide a session manager', () => {
    instance = new AgentInstance({ id: 'agent-3', name: 'Test' });
    const sessions = instance.getSessionManager();
    expect(sessions).toBeDefined();
  });
});

describe('AgentRouter', () => {
  let router: AgentRouter;

  const createRouter = (
    rules: AgentRoutingConfig['rules'],
    agents: AgentConfig[],
    defaultAgentId = 'default',
  ) => {
    const config: AgentRoutingConfig = {
      enabled: true,
      defaultAgentId,
      agents,
      rules,
    };
    router = new AgentRouter(config);

    // Register agent instances
    for (const agentConfig of agents) {
      router.registerAgent(new AgentInstance(agentConfig));
    }
  };

  afterEach(() => {
    router?.destroy();
  });

  it('should route to default agent when no rules match', () => {
    createRouter(
      [{ id: 'rule-1', channelType: 'telegram', agentId: 'telegram-agent' }],
      [
        { id: 'default', name: 'Default Agent' },
        { id: 'telegram-agent', name: 'Telegram Agent' },
      ],
    );

    const agent = router.route({ channelType: 'discord' });
    expect(agent?.id).toBe('default');
  });

  it('should route by channel type', () => {
    createRouter(
      [
        { id: 'rule-1', channelType: 'discord', agentId: 'discord-agent' },
        { id: 'rule-2', channelType: 'telegram', agentId: 'telegram-agent' },
      ],
      [
        { id: 'default', name: 'Default' },
        { id: 'discord-agent', name: 'Discord Bot' },
        { id: 'telegram-agent', name: 'Telegram Bot' },
      ],
    );

    expect(router.route({ channelType: 'discord' })?.id).toBe('discord-agent');
    expect(router.route({ channelType: 'telegram' })?.id).toBe('telegram-agent');
    expect(router.route({ channelType: 'webchat' })?.id).toBe('default');
  });

  it('should route by sender ID (exact match)', () => {
    createRouter(
      [{ id: 'rule-1', senderId: 'user-123', agentId: 'vip-agent' }],
      [
        { id: 'default', name: 'Default' },
        { id: 'vip-agent', name: 'VIP Agent' },
      ],
    );

    expect(router.route({ senderId: 'user-123' })?.id).toBe('vip-agent');
    expect(router.route({ senderId: 'user-456' })?.id).toBe('default');
  });

  it('should route by sender ID (glob pattern)', () => {
    createRouter(
      [{ id: 'rule-1', senderId: 'admin-*', agentId: 'admin-agent' }],
      [
        { id: 'default', name: 'Default' },
        { id: 'admin-agent', name: 'Admin Agent' },
      ],
    );

    expect(router.route({ senderId: 'admin-alice' })?.id).toBe('admin-agent');
    expect(router.route({ senderId: 'admin-bob' })?.id).toBe('admin-agent');
    expect(router.route({ senderId: 'user-alice' })?.id).toBe('default');
  });

  it('should route by channel ID', () => {
    createRouter(
      [{ id: 'rule-1', channelId: 'support-*', agentId: 'support-agent' }],
      [
        { id: 'default', name: 'Default' },
        { id: 'support-agent', name: 'Support Agent' },
      ],
    );

    expect(router.route({ channelId: 'support-general' })?.id).toBe('support-agent');
    expect(router.route({ channelId: 'random' })?.id).toBe('default');
  });

  it('should combine multiple match criteria (AND logic)', () => {
    createRouter(
      [{
        id: 'rule-1',
        channelType: 'discord',
        senderId: 'admin-*',
        agentId: 'discord-admin-agent',
      }],
      [
        { id: 'default', name: 'Default' },
        { id: 'discord-admin-agent', name: 'Discord Admin' },
      ],
    );

    // Both must match
    expect(router.route({ channelType: 'discord', senderId: 'admin-alice' })?.id)
      .toBe('discord-admin-agent');
    // Channel type doesn't match
    expect(router.route({ channelType: 'telegram', senderId: 'admin-alice' })?.id)
      .toBe('default');
    // Sender doesn't match
    expect(router.route({ channelType: 'discord', senderId: 'user-bob' })?.id)
      .toBe('default');
  });

  it('should respect priority order', () => {
    createRouter(
      [
        { id: 'rule-low', channelType: 'discord', agentId: 'generic-discord', priority: 0 },
        { id: 'rule-high', channelType: 'discord', senderId: 'vip-user', agentId: 'vip-discord', priority: 10 },
      ],
      [
        { id: 'default', name: 'Default' },
        { id: 'generic-discord', name: 'Generic Discord' },
        { id: 'vip-discord', name: 'VIP Discord' },
      ],
    );

    // VIP user should match the high-priority rule
    expect(router.route({ channelType: 'discord', senderId: 'vip-user' })?.id)
      .toBe('vip-discord');
    // Non-VIP should match the generic rule
    expect(router.route({ channelType: 'discord', senderId: 'regular-user' })?.id)
      .toBe('generic-discord');
  });

  it('should not match rules with no criteria', () => {
    createRouter(
      [{ id: 'rule-empty', agentId: 'catch-all' }],
      [
        { id: 'default', name: 'Default' },
        { id: 'catch-all', name: 'Catch All' },
      ],
    );

    // Empty rule should not match; falls through to default
    expect(router.route({ channelType: 'webchat' })?.id).toBe('default');
  });

  it('should register and remove agents', () => {
    createRouter([], [{ id: 'default', name: 'Default' }]);

    const newAgent = new AgentInstance({ id: 'new-agent', name: 'New' });
    router.registerAgent(newAgent);
    expect(router.getAgent('new-agent')?.id).toBe('new-agent');

    router.removeAgent('new-agent');
    expect(router.getAgent('new-agent')).toBeUndefined();
  });

  it('should list all agents', () => {
    createRouter(
      [],
      [
        { id: 'default', name: 'Default' },
        { id: 'second', name: 'Second' },
      ],
    );

    const agents = router.listAgents();
    expect(agents).toHaveLength(2);
    expect(agents.map(a => a.id).sort()).toEqual(['default', 'second']);
  });

  it('should return undefined when default agent is not registered', () => {
    const config: AgentRoutingConfig = {
      enabled: true,
      defaultAgentId: 'nonexistent',
      agents: [],
      rules: [],
    };
    router = new AgentRouter(config);
    expect(router.route({ channelType: 'webchat' })).toBeUndefined();
  });

  it('should match wildcard * sender pattern', () => {
    createRouter(
      [{ id: 'rule-1', channelType: 'slack', senderId: '*', agentId: 'slack-agent' }],
      [
        { id: 'default', name: 'Default' },
        { id: 'slack-agent', name: 'Slack Agent' },
      ],
    );

    expect(router.route({ channelType: 'slack', senderId: 'anyone' })?.id).toBe('slack-agent');
  });
});
