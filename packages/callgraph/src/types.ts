export interface CallgraphConfig {
  maxDepth: number;
}

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentNodeInput {
  id: string;
  name: string;
  startedAt: number;
  parentId?: string;
}

export interface AgentNode {
  id: string;
  name: string;
  parentId?: string;
  depth: number;
  status: AgentStatus;
  startedAt: number;
  completedAt?: number;
  tokenUsage: number;
}

export interface AgentNodeUpdate {
  status?: AgentStatus;
  completedAt?: number;
  tokenUsage?: number;
}

export interface CallgraphEdge {
  parentId: string;
  childId: string;
}

export interface CallgraphSnapshot {
  nodes: AgentNode[];
  edges: CallgraphEdge[];
  maxDepth: number;
  totalTokenUsage: number;
}
