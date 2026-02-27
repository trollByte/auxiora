export type NicheComplexity = 'simple' | 'moderate' | 'complex';

export interface Niche {
  domain: string;
  complexity: NicheComplexity;
}

export type MutationStrategy = 'create_new' | 'mutate' | 'crossover' | 'refine_prompt';
export type VariantType = 'skill' | 'prompt' | 'config';
export type VariantStatus = 'evaluated' | 'deployed' | 'failed' | 'reverted';

export interface VariantMetrics {
  accuracy: number;
  latencyP50: number;
  latencyP95: number;
  errorRate: number;
}

export interface Variant {
  id: string;
  generation: number;
  parentIds: string[];
  strategy: MutationStrategy;
  type: VariantType;
  content: string;
  metadata: Record<string, unknown>;
  metrics: VariantMetrics;
  securityPassed: boolean;
  reviewScore: number;
  status: VariantStatus;
  createdAt: number;
}

export interface ArchiveCell {
  niche: Niche;
  variantId: string;
  benchmarkScore: number;
  lastEvaluated: number;
  staleness: number;
}

export interface StrategyWeights {
  refine_prompt: number;
  mutate: number;
  create_new: number;
  crossover: number;
}

export interface DarwinConfig {
  tickIntervalMs: number;
  tokenBudgetPerHour: number;
  maxConcurrentEvaluations: number;
  maxVariantsPerDay: number;
  pauseDuringUserActivity: boolean;
  sandboxMemoryMb: number;
  sandboxTimeoutMs: number;
  strategyWeights: StrategyWeights;
  stalenessThreshold: number;
  minAccuracy: number;
  maxErrorRate: number;
  maxLatencyP95: number;
  reviewScoreThreshold: number;
  revertThreshold: number;
  revertWindowMs: number;
}

export const DEFAULT_DARWIN_CONFIG: DarwinConfig = {
  tickIntervalMs: 60_000,
  tokenBudgetPerHour: 50_000,
  maxConcurrentEvaluations: 1,
  maxVariantsPerDay: 500,
  pauseDuringUserActivity: true,
  sandboxMemoryMb: 256,
  sandboxTimeoutMs: 30_000,
  strategyWeights: { refine_prompt: 0.4, mutate: 0.35, create_new: 0.15, crossover: 0.10 },
  stalenessThreshold: 50,
  minAccuracy: 0.5,
  maxErrorRate: 0.2,
  maxLatencyP95: 10_000,
  reviewScoreThreshold: 0.6,
  revertThreshold: 0.10,
  revertWindowMs: 3_600_000,
};

export interface DarwinCheckpoint {
  phase: 'observe' | 'propose' | 'mutate' | 'evaluate' | 'select' | 'deploy';
  targetNiche?: Niche;
  strategy?: MutationStrategy;
  variantId?: string;
  parentIds?: string[];
}

export interface EvaluationResult {
  variantId: string;
  passed: boolean;
  failedStage?: string;
  failureReason?: string;
  metrics?: VariantMetrics;
  securityPassed: boolean;
  reviewScore: number;
  reviewApproved: boolean;
}

export type DeployClass = 'minor' | 'major';

export interface LLMCallerLike {
  call(prompt: string, options?: { maxTokens?: number }): Promise<string>;
}

export interface SandboxLike {
  createSession(sessionId: string, workspaceDir: string): Promise<{
    runCommand(command: string[]): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }>;
    stop(): Promise<void>;
  }>;
  destroySession(sessionId: string): Promise<boolean>;
}

export interface PluginLoaderLike {
  loadSingle(filePath: string): Promise<{ name: string; status: string; error?: string }>;
}

export interface TelemetryLike {
  getFlaggedTools(threshold: number, minCalls: number): Array<{ tool: string; successRate: number; totalCalls: number }>;
  getAllStats(): Array<{ tool: string; successRate: number; totalCalls: number; avgDurationMs: number }>;
}

export interface EventBusLike {
  publish(event: { topic: string; agentId?: string; data?: Record<string, unknown> }): void;
}
