import type { CallgraphConfig, AgentNode, AgentNodeInput, AgentNodeUpdate, CallgraphEdge } from './types.js';

export class CallgraphTracker {
  private readonly nodes = new Map<string, AgentNode>();
  private readonly edges: CallgraphEdge[] = [];
  private readonly children = new Map<string, string[]>();
  private readonly config: CallgraphConfig;

  constructor(config: CallgraphConfig) {
    this.config = config;
  }

  addAgent(input: AgentNodeInput): void {
    if (this.nodes.has(input.id)) {
      throw new Error(`Agent ${input.id} already exists in callgraph`);
    }

    let depth = 0;
    if (input.parentId) {
      const parent = this.nodes.get(input.parentId);
      if (!parent) {
        throw new Error(`Parent agent ${input.parentId} not found`);
      }
      depth = parent.depth + 1;
      if (depth > this.config.maxDepth) {
        throw new Error(`Agent ${input.id} exceeds depth limit (${depth} > ${this.config.maxDepth})`);
      }
      this.edges.push({ parentId: input.parentId, childId: input.id });
      const siblings = this.children.get(input.parentId) ?? [];
      siblings.push(input.id);
      this.children.set(input.parentId, siblings);
    }

    this.nodes.set(input.id, {
      id: input.id,
      name: input.name,
      parentId: input.parentId,
      depth,
      status: 'running',
      startedAt: input.startedAt,
      tokenUsage: 0,
    });
  }

  updateAgent(id: string, update: AgentNodeUpdate): void {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Agent ${id} not found`);
    }
    if (update.status !== undefined) node.status = update.status;
    if (update.completedAt !== undefined) node.completedAt = update.completedAt;
    if (update.tokenUsage !== undefined) node.tokenUsage = update.tokenUsage;
  }

  getNode(id: string): AgentNode | undefined {
    return this.nodes.get(id);
  }

  getNodes(): AgentNode[] {
    return [...this.nodes.values()];
  }

  getEdges(): CallgraphEdge[] {
    return [...this.edges];
  }

  getChildren(parentId: string): AgentNode[] {
    const childIds = this.children.get(parentId) ?? [];
    return childIds.map((id) => this.nodes.get(id)!);
  }

  getMaxDepth(): number {
    let max = 0;
    for (const node of this.nodes.values()) {
      if (node.depth > max) max = node.depth;
    }
    return max;
  }

  topologicalOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      result.push(id);
      const childIds = this.children.get(id) ?? [];
      for (const childId of childIds) {
        visit(childId);
      }
    };

    for (const node of this.nodes.values()) {
      if (!node.parentId) {
        visit(node.id);
      }
    }

    return result;
  }

  getSubtreeTokenUsage(rootId: string): number {
    const node = this.nodes.get(rootId);
    if (!node) return 0;

    let total = node.tokenUsage;
    const childIds = this.children.get(rootId) ?? [];
    for (const childId of childIds) {
      total += this.getSubtreeTokenUsage(childId);
    }
    return total;
  }

  getSnapshot(): { nodes: AgentNode[]; edges: CallgraphEdge[]; maxDepth: number; totalTokenUsage: number } {
    let totalTokens = 0;
    for (const node of this.nodes.values()) {
      totalTokens += node.tokenUsage;
    }
    return {
      nodes: this.getNodes(),
      edges: this.getEdges(),
      maxDepth: this.getMaxDepth(),
      totalTokenUsage: totalTokens,
    };
  }
}
