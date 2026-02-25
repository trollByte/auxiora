import { SessionManager } from '@auxiora/sessions';
import type { Provider } from '@auxiora/providers';

/**
 * Routing rule that maps incoming messages to agent instances.
 */
export interface AgentRoutingRule {
  /** Unique ID for this rule */
  id: string;
  /** Match by channel type (e.g. 'discord', 'telegram', 'webchat') */
  channelType?: string;
  /** Match by sender ID pattern (exact or glob with *) */
  senderId?: string;
  /** Match by channel ID pattern (exact or glob with *) */
  channelId?: string;
  /** The agent instance ID to route to */
  agentId: string;
  /** Priority (higher = checked first). Default 0. */
  priority?: number;
}

/**
 * Configuration for an individual agent instance.
 */
export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt?: string;
  workspacePath?: string;
  /** Provider override (uses default if not set) */
  provider?: string;
  /** Model override */
  model?: string;
}

/**
 * Full agent routing configuration.
 */
export interface AgentRoutingConfig {
  enabled: boolean;
  /** Default agent ID when no rules match */
  defaultAgentId: string;
  agents: AgentConfig[];
  rules: AgentRoutingRule[];
}

/**
 * Holds isolated state for a single agent instance.
 */
export class AgentInstance {
  readonly id: string;
  readonly name: string;
  readonly systemPrompt: string;
  readonly workspacePath: string;
  readonly providerOverride?: string;
  readonly modelOverride?: string;
  private sessions: SessionManager;

  constructor(config: AgentConfig, sessionConfig?: { maxContextTokens?: number; ttlMinutes?: number }) {
    this.id = config.id;
    this.name = config.name;
    this.systemPrompt = config.systemPrompt ?? '';
    this.workspacePath = config.workspacePath ?? '';
    this.providerOverride = config.provider;
    this.modelOverride = config.model;
    this.sessions = new SessionManager({
      maxContextTokens: sessionConfig?.maxContextTokens ?? 100000,
      ttlMinutes: sessionConfig?.ttlMinutes ?? 1440,
      autoSave: true,
      compactionEnabled: true,
    });
  }

  async initialize(): Promise<void> {
    await this.sessions.initialize();
  }

  getSessionManager(): SessionManager {
    return this.sessions;
  }

  destroy(): void {
    this.sessions.destroy();
  }
}

/**
 * Routes incoming messages to the appropriate agent instance
 * based on channel type, sender ID, and channel ID patterns.
 */
export class AgentRouter {
  private agents: Map<string, AgentInstance> = new Map();
  private rules: AgentRoutingRule[];
  private defaultAgentId: string;

  constructor(config: AgentRoutingConfig) {
    this.defaultAgentId = config.defaultAgentId;
    // Sort rules by priority (descending)
    this.rules = [...config.rules].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
  }

  /**
   * Register an agent instance. Call after constructing.
   */
  registerAgent(agent: AgentInstance): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Remove an agent instance.
   */
  removeAgent(id: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.destroy();
      this.agents.delete(id);
    }
  }

  /**
   * Route an incoming message context to an agent instance.
   */
  route(context: {
    channelType?: string;
    senderId?: string;
    channelId?: string;
  }): AgentInstance | undefined {
    for (const rule of this.rules) {
      if (this.matchesRule(rule, context)) {
        return this.agents.get(rule.agentId);
      }
    }
    return this.agents.get(this.defaultAgentId);
  }

  /**
   * Get an agent by ID.
   */
  getAgent(id: string): AgentInstance | undefined {
    return this.agents.get(id);
  }

  /**
   * List all registered agents.
   */
  listAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Destroy all agents and clean up.
   */
  destroy(): void {
    for (const agent of this.agents.values()) {
      agent.destroy();
    }
    this.agents.clear();
  }

  private matchesRule(
    rule: AgentRoutingRule,
    context: { channelType?: string; senderId?: string; channelId?: string },
  ): boolean {
    if (rule.channelType && rule.channelType !== context.channelType) {
      return false;
    }
    if (rule.senderId && !this.matchPattern(rule.senderId, context.senderId ?? '')) {
      return false;
    }
    if (rule.channelId && !this.matchPattern(rule.channelId, context.channelId ?? '')) {
      return false;
    }
    // At least one field must be specified in the rule
    if (!rule.channelType && !rule.senderId && !rule.channelId) {
      return false;
    }
    return true;
  }

  /**
   * Simple glob matching: supports * as wildcard for any sequence of characters.
   */
  private matchPattern(pattern: string, value: string): boolean {
    if (pattern === '*') return true;
    if (!pattern.includes('*')) return pattern === value;

    // Convert glob to regex
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
    return new RegExp(regexStr).test(value);
  }
}
