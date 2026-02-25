export interface SubsystemStatus {
  name: string;
  status: 'up' | 'degraded' | 'down';
  lastCheck: number;
  metrics?: Record<string, number>;
}

export interface Anomaly {
  subsystem: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: number;
}

export interface ReasoningMetrics {
  avgResponseQuality: number;
  domainAccuracy: number;
  preferenceStability: number;
}

export interface ResourceMetrics {
  memoryUsageMb: number;
  cpuPercent: number;
  activeConnections: number;
  uptimeSeconds: number;
}

export interface CapabilityMetrics {
  totalCapabilities: number;
  healthyCapabilities: number;
  degradedCapabilities: string[];
}

export interface SystemPulse {
  timestamp: number;
  overall: 'healthy' | 'degraded' | 'critical';
  subsystems: SubsystemStatus[];
  anomalies: Anomaly[];
  reasoning: ReasoningMetrics;
  resources: ResourceMetrics;
  capabilities: CapabilityMetrics;
}
