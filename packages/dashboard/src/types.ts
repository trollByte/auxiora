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
  };
  saveConfig?: (updates: Record<string, unknown>) => Promise<void>;
  getAgentName?: () => string;
  hasSoulFile?: () => Promise<boolean>;
}

export interface DashboardDeps {
  vault: {
    get(name: string): string | undefined;
    has(name: string): boolean;
    add(name: string, value: string): Promise<void>;
  };
  behaviors?: {
    list(filter?: { type?: string; status?: string }): Promise<any[]>;
    update(id: string, updates: Record<string, unknown>): Promise<any>;
    remove(id: string): Promise<boolean>;
  };
  webhooks?: {
    list(): Promise<any[]>;
    update?(id: string, updates: Record<string, unknown>): Promise<any>;
    delete(id: string): Promise<boolean>;
  };
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
    getRoutingConfig(): Record<string, unknown>;
    getCostSummary(): {
      today: number;
      thisMonth: number;
      budgetRemaining?: number;
      isOverBudget: boolean;
      warningThresholdReached: boolean;
    };
  };
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  enabled: false,
  sessionTtlMs: 86_400_000,
};

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 60_000;
