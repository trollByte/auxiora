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
    status: string;
    error?: string;
  }>;
  getMemories?: () => Promise<Array<{
    id: string;
    content: string;
    category: string;
    source: string;
    createdAt: number;
    updatedAt: number;
    accessCount: number;
  }>>;
  setup?: SetupDeps;
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
