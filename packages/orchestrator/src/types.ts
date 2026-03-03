import type { ResourceSnapshotLike } from './resource-types.js';

export type OrchestrationPattern = 'parallel' | 'sequential' | 'debate' | 'map-reduce' | 'supervisor' | 'dag';

/** An agent task within a workflow */
export interface AgentTask {
  id: string;
  name: string;
  provider: string;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  tools?: string[];
  dependsOn?: string[];
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

/** A workflow is a set of agent tasks + a pattern */
export interface Workflow {
  id: string;
  pattern: OrchestrationPattern;
  tasks: AgentTask[];
  synthesisPrompt?: string;
  synthesisProvider?: string;
  metadata?: Record<string, unknown>;
}

/** Events streamed back during orchestration */
export type AgentEvent =
  | { type: 'workflow_started'; workflowId: string; pattern: OrchestrationPattern; taskCount: number }
  | { type: 'agent_started'; workflowId: string; taskId: string; name: string; provider: string; model?: string }
  | { type: 'agent_chunk'; workflowId: string; taskId: string; name: string; content: string }
  | { type: 'agent_completed'; workflowId: string; taskId: string; name: string; result: string; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'agent_error'; workflowId: string; taskId: string; name: string; error: string }
  | { type: 'synthesis_started'; workflowId: string }
  | { type: 'synthesis_chunk'; workflowId: string; content: string }
  | { type: 'task_progress'; workflowId: string; taskId: string; name: string; completedTasks: number; totalTasks: number; elapsedMs: number }
  | { type: 'checkpoint_saved'; workflowId: string; completedTaskIds: string[]; savedAt: number }
  | { type: 'resource_snapshot'; workflowId: string; snapshot: ResourceSnapshotLike; safeSlots: number; machineClass: string }
  | { type: 'wave_started'; workflowId: string; waveIndex: number; taskIds: string[]; slots: number }
  | { type: 'wave_completed'; workflowId: string; waveIndex: number; completedTaskIds: string[] }
  | { type: 'resource_warning'; workflowId: string; action: string; reasons: string[] }
  | { type: 'workflow_completed'; workflowId: string; finalResult: string; totalUsage: { inputTokens: number; outputTokens: number }; totalCost: number };

/** Result of a single agent's execution */
export interface AgentResult {
  taskId: string;
  name: string;
  provider: string;
  model: string;
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  duration: number;
  error?: string;
}

/** Checkpoint data for workflow crash recovery */
export interface WorkflowCheckpoint {
  workflowId: string;
  pattern: OrchestrationPattern;
  completedTaskIds: string[];
  completedResults: AgentResult[];
  savedAt: number;
}

/** Handler for persisting and loading workflow checkpoints */
export interface WorkflowCheckpointHandler {
  save(checkpoint: WorkflowCheckpoint): Promise<void>;
  load(workflowId: string): Promise<WorkflowCheckpoint | undefined>;
}

/** Interface for orchestration engine implementations */
export interface OrchestrationEngineLike {
  execute(workflow: Workflow): AsyncGenerator<AgentEvent, OrchestrationResult, unknown>;
}

/** Full orchestration result */
export interface OrchestrationResult {
  workflowId: string;
  pattern: OrchestrationPattern;
  agentResults: AgentResult[];
  synthesis: string;
  totalUsage: { inputTokens: number; outputTokens: number };
  totalCost: number;
  totalDuration: number;
}
