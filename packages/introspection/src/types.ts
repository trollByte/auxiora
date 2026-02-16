export interface ToolCapability {
  name: string;
  description: string;
  parameterCount: number;
}

export interface ChannelCapability {
  type: string;
  connected: boolean;
  hasDefault: boolean;
}

export interface BehaviorCapability {
  id: string;
  type: string;
  status: string;
  action: string;
  runCount: number;
  failCount: number;
  maxFailures: number;
  lastRun?: string;
  health: 'healthy' | 'warning' | 'failing' | 'paused';
}

export interface ProviderCapability {
  name: string;
  displayName: string;
  available: boolean;
  isPrimary: boolean;
  isFallback: boolean;
  models: string[];
}

export interface PluginCapability {
  name: string;
  version: string;
  status: string;
  toolCount: number;
  behaviorCount: number;
}

export interface CapabilityCatalog {
  tools: ToolCapability[];
  channels: ChannelCapability[];
  behaviors: BehaviorCapability[];
  providers: ProviderCapability[];
  plugins: PluginCapability[];
  features: Record<string, boolean>;
  updatedAt: string;
}

export interface SubsystemHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: string;
  details?: string;
}

export interface HealthIssue {
  id: string;
  subsystem: string;
  severity: 'warning' | 'critical';
  description: string;
  detectedAt: string;
  resolvedAt?: string;
  suggestedFix?: string;
  autoFixable: boolean;
  trustLevelRequired?: number;
}

export interface HealthState {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  subsystems: SubsystemHealth[];
  issues: HealthIssue[];
  lastCheck: string;
}

export interface IntrospectionSources {
  getTools: () => Array<{ name: string; description: string; parameters: any[] }>;
  getConnectedChannels: () => string[];
  getConfiguredChannels: () => string[];
  getDefaultChannelId?: (type: string) => string | undefined;
  getBehaviors: () => Promise<Array<{
    id: string; type: string; status: string; action: string;
    runCount: number; failCount: number; maxFailures: number; lastRun?: string;
  }>>;
  getProviders: () => Array<{ name: string; displayName: string; models: Record<string, unknown> }>;
  getPrimaryProviderName: () => string;
  getFallbackProviderName: () => string | undefined;
  checkProviderAvailable?: (name: string) => Promise<boolean>;
  getPlugins: () => Array<{
    name: string; version: string; status: string;
    toolCount: number; behaviorNames: string[];
  }>;
  getFeatures: () => Record<string, boolean>;
  getAuditEntries: (limit?: number) => Promise<Array<{
    timestamp: string; event: string; details: Record<string, unknown>;
  }>>;
  getTrustLevel?: (domain: string) => number;
}

export interface AutoFixActions {
  reconnectChannel?: (type: string) => Promise<boolean>;
  restartBehavior?: (id: string) => Promise<boolean>;
  switchToFallbackProvider?: () => Promise<boolean>;
}
