export interface DashboardConfig {
  enabled: boolean;
  sessionTtlMs: number;
}

export interface DashboardSession {
  id: string;
  createdAt: number;
  lastActive: number;
  ip: string;
}

export interface PersonalityTemplateSummary {
  id: string;
  name: string;
  description: string;
  preview: string;
}

export interface SetupDeps {
  personality?: {
    listTemplates(): Promise<PersonalityTemplateSummary[]>;
    applyTemplate(id: string): Promise<void>;
    buildCustom(config: Record<string, unknown>): Promise<string>;
    getActiveTemplate?(): Promise<{ id: string; name: string } | null>;
  };
  saveConfig?: (updates: Record<string, unknown>) => Promise<void>;
  getAgentName?: () => string;
  getAgentPronouns?: () => string;
  getAgentConfig?: () => Record<string, unknown>;
  getSoulContent?: () => Promise<string | null>;
  saveSoulContent?: (content: string) => Promise<void>;
  hasSoulFile?: () => Promise<boolean>;
  vaultExists?: () => Promise<boolean>;
  onSetupComplete?: () => Promise<void>;
}

export interface DashboardDeps {
  vault: {
    get(name: string): string | undefined;
    has(name: string): boolean;
    add(name: string, value: string): Promise<void>;
    unlock(password: string): Promise<void>;
    changePassword(newPassword: string): Promise<void>;
  };
  onVaultUnlocked?: () => Promise<void>;
  getActiveModel?: () => { provider: string; model: string };
  behaviors?: {
    list(filter?: { type?: string; status?: string }): Promise<any[]>;
    create(input: Record<string, unknown>): Promise<any>;
    update(id: string, updates: Record<string, unknown>): Promise<any>;
    remove(id: string): Promise<boolean>;
  };
  webhooks?: {
    list(): Promise<any[]>;
    create(options: Record<string, unknown>): Promise<any>;
    update?(id: string, updates: Record<string, unknown>): Promise<any>;
    delete(id: string): Promise<boolean>;
  };
  getConfiguredChannels?: () => Array<{ type: string; enabled: boolean }>;
  getConnections: () => Array<{
    id: string;
    authenticated: boolean;
    channelType: string;
    lastActive: number;
    voiceActive?: boolean;
  }>;
  getAuditEntries: (limit?: number) => Promise<any[]>;
  getPlugins?: () => Array<{
    name: string;
    version: string;
    file: string;
    toolCount: number;
    toolNames: string[];
    behaviorNames: string[];
    providerNames: string[];
    permissions: string[];
    status: string;
    error?: string;
  }>;
  pluginManager?: {
    enable(id: string): Promise<boolean>;
    disable(id: string): Promise<boolean>;
    remove(id: string): Promise<boolean>;
    getConfig(id: string): Record<string, unknown> | null;
    setConfig(id: string, config: Record<string, unknown>): Promise<boolean>;
    getPermissions(id: string): string[] | null;
    setPermissions(id: string, permissions: string[]): Promise<boolean>;
  };
  marketplace?: {
    search(query: string): Promise<any[]>;
    getPlugin(id: string): Promise<any | null>;
    install(id: string): Promise<{ success: boolean; error?: string }>;
  };
  getMemories?: () => Promise<Array<{
    id: string;
    content: string;
    category: string;
    source: string;
    createdAt: number;
    updatedAt: number;
    accessCount: number;
  }>>;
  memory?: {
    getLivingState(): Promise<{
      facts: any[];
      relationships: any[];
      patterns: any[];
      adaptations: any[];
      stats: any;
    }>;
    getStats(): Promise<any>;
    getAdaptations(): Promise<any[]>;
    deleteMemory(id: string): Promise<boolean>;
    exportAll(): Promise<any>;
    importAll(data: { memories: any[] }): Promise<{ imported: number; skipped: number }>;
  };
  setup?: SetupDeps;
  orchestration?: {
    getConfig(): {
      enabled: boolean;
      maxConcurrentAgents: number;
      allowedPatterns: string[];
    };
    getHistory(limit?: number): Array<{
      workflowId: string;
      pattern: string;
      taskCount: number;
      totalCost: number;
      duration: number;
      timestamp: number;
    }>;
  };
  models?: {
    listProviders(): Array<{
      name: string;
      displayName: string;
      available: boolean;
      models: Record<string, unknown>;
    }>;
    getRoutingConfig(): {
      enabled: boolean;
      primary: string;
      fallback?: string;
      defaultModel?: string;
      rules: unknown[];
      preferences: Record<string, unknown>;
      costLimits: Record<string, unknown>;
    };
    getCostSummary(): {
      today: number;
      thisMonth: number;
      budgetRemaining?: number;
      isOverBudget: boolean;
      warningThresholdReached: boolean;
    };
  };
  // --- [P13] Connectors ---
  connectors?: {
    list(): Array<{ id: string; name: string; category: string; auth: { type: string } }>;
    get(id: string): any | undefined;
    connect(connectorId: string, credentials: Record<string, string>, label?: string): Promise<any | null>;
    disconnect(connectorId: string): Promise<boolean>;
    getActions(connectorId: string): any[];
    executeAction(connectorId: string, actionId: string, params: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }>;
  };
  // --- Trust / Autonomy (Phase 12) ---
  trust?: {
    getLevels(): Record<string, number>;
    getLevel(domain: string): number;
    setLevel(domain: string, level: number, reason: string): Promise<void>;
    getAuditEntries(limit?: number): any[];
    getAuditEntry(id: string): any | undefined;
    rollback(id: string): Promise<{ success: boolean; error?: string }>;
    getPromotions(): any[];
  };
  // --- [P6] Desktop ---
  desktop?: {
    getStatus(): {
      status: string;
      autoStart: boolean;
      hotkey: string;
      notificationsEnabled: boolean;
      ollamaRunning: boolean;
      updateChannel: string;
    };
    updateConfig(updates: Record<string, unknown>): Promise<Record<string, unknown>>;
    sendNotification(payload: { title: string; body: string }): Promise<void>;
    checkUpdates(): Promise<{
      available: boolean;
      currentVersion: string;
      latestVersion?: string;
      channel: string;
    }>;
  };
  // --- Cloud (Phase 7) ---
  cloud?: import('./cloud-types.js').CloudDeps;
  // --- [P14] Team / Social ---
  team?: {
    listUsers(): Promise<any[]>;
    createUser(name: string, role: string, channels?: any[]): Promise<any>;
    deleteUser(id: string): Promise<boolean>;
  };
  // --- [P14] Workflows ---
  workflows?: {
    listActive(): Promise<any[]>;
    listAll(): Promise<any[]>;
    getStatus(id: string): Promise<any | undefined>;
    createWorkflow(options: any): Promise<any>;
    completeStep(workflowId: string, stepId: string, completedBy: string): Promise<any>;
    cancelWorkflow(id: string): Promise<boolean>;
    getPendingApprovals(userId?: string): Promise<any[]>;
    approve(id: string, userId: string, reason?: string): Promise<any>;
    reject(id: string, userId: string, reason?: string): Promise<any>;
  };
  // --- [P14] Agent Protocol ---
  agentProtocol?: {
    getIdentity(): any;
    getInbox(limit?: number): any[];
    discover(query: string): Promise<any[]>;
    getDirectory(): Promise<any[]>;
  };
  // --- [P15] Screen ---
  screen?: {
    capture(): Promise<{ image: string; dimensions: { width: number; height: number } }>;
    analyze(question?: string): Promise<string>;
  };
  // --- [P15] Ambient ---
  ambient?: {
    getPatterns(): any[];
    getNotifications(): any[];
    dismissNotification(id: string): boolean;
    getBriefing(time: string): any;
    getAnticipations(): any[];
  };
  // --- [P15] Conversation ---
  conversation?: {
    getState(): string;
    start(): void;
    stop(): void;
    getTurnCount(): number;
  };
  // --- Chat session history ---
  sessions?: {
    getWebchatMessages(): Promise<Array<{ id: string; role: string; content: string; timestamp: number }>>;
  };
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  enabled: false,
  sessionTtlMs: 86_400_000,
};

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 60_000;
