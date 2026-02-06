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
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  enabled: false,
  sessionTtlMs: 86_400_000,
};

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 60_000;
