import { randomUUID } from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import type { EntityType, GraphEdge, GraphNode, GraphPath, GraphQuery, QueryResult, RelationType } from './types.js';

const log = getLogger('knowledge-graph:store');

export class GraphStore {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  private nodeIndex = new Map<string, string>(); // lowercase name/alias → node ID

  addNode(input: Omit<GraphNode, 'id' | 'createdAt' | 'updatedAt' | 'mentionCount'>): GraphNode {
    // Check for existing node by name
    const existing = this.resolveNode(input.name);
    if (existing) {
      existing.mentionCount++;
      existing.updatedAt = Date.now();
      // Merge aliases
      for (const alias of input.aliases) {
        if (!existing.aliases.includes(alias)) {
          existing.aliases.push(alias);
          this.nodeIndex.set(alias.toLowerCase(), existing.id);
        }
      }
      // Merge properties
      Object.assign(existing.properties, input.properties);
      if (input.confidence > existing.confidence) {
        existing.confidence = input.confidence;
      }
      log.debug(`Merged into existing node: ${existing.name} (${existing.id})`);
      return existing;
    }

    const now = Date.now();
    const node: GraphNode = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      mentionCount: 1,
    };

    this.nodes.set(node.id, node);
    this.nodeIndex.set(node.name.toLowerCase(), node.id);
    for (const alias of node.aliases) {
      this.nodeIndex.set(alias.toLowerCase(), node.id);
    }

    log.debug(`Added node: ${node.name} (${node.id})`);
    return node;
  }

  addEdge(
    source: string,
    target: string,
    relation: RelationType,
    opts?: { weight?: number; label?: string; evidence?: string[]; properties?: Record<string, unknown> },
  ): GraphEdge {
    const sourceNode = this.resolveNode(source);
    const targetNode = this.resolveNode(target);

    if (!sourceNode) throw new Error(`Source node not found: ${source}`);
    if (!targetNode) throw new Error(`Target node not found: ${target}`);

    const edge: GraphEdge = {
      id: randomUUID(),
      source: sourceNode.id,
      target: targetNode.id,
      relation,
      label: opts?.label,
      weight: opts?.weight ?? 0.5,
      properties: opts?.properties ?? {},
      createdAt: Date.now(),
      evidence: opts?.evidence ?? [],
    };

    this.edges.set(edge.id, edge);
    log.debug(`Added edge: ${sourceNode.name} -[${relation}]-> ${targetNode.name}`);
    return edge;
  }

  getNode(idOrName: string): GraphNode | undefined {
    return this.resolveNode(idOrName);
  }

  getEdges(nodeId: string, direction: 'outgoing' | 'incoming' | 'both' = 'both'): GraphEdge[] {
    const results: GraphEdge[] = [];
    for (const edge of this.edges.values()) {
      if (direction === 'outgoing' || direction === 'both') {
        if (edge.source === nodeId) results.push(edge);
      }
      if (direction === 'incoming' || direction === 'both') {
        if (edge.target === nodeId) results.push(edge);
      }
    }
    return results;
  }

  getNeighbors(nodeId: string, relation?: RelationType): GraphNode[] {
    const neighborIds = new Set<string>();
    for (const edge of this.edges.values()) {
      if (relation && edge.relation !== relation) continue;
      if (edge.source === nodeId) neighborIds.add(edge.target);
      if (edge.target === nodeId) neighborIds.add(edge.source);
    }
    const results: GraphNode[] = [];
    for (const nid of neighborIds) {
      const node = this.nodes.get(nid);
      if (node) results.push(node);
    }
    return results;
  }

  query(q: GraphQuery): QueryResult {
    const maxDepth = q.maxDepth ?? 2;
    const minConfidence = q.minConfidence ?? 0;

    // Resolve start node
    let startNode: GraphNode | undefined;
    if (q.startNode) {
      startNode = this.resolveNode(q.startNode);
      if (!startNode) return { paths: [], nodes: [], edges: [] };
    }

    // BFS traversal
    const visitedNodes = new Map<string, GraphNode>();
    const collectedEdges = new Map<string, GraphEdge>();
    const paths: GraphPath[] = [];

    if (startNode) {
      this.bfs(startNode, maxDepth, minConfidence, q.relation, q.targetType, visitedNodes, collectedEdges, paths);
    } else {
      // No start node: filter all nodes by criteria
      for (const node of this.nodes.values()) {
        if (node.confidence < minConfidence) continue;
        if (q.targetType && node.type !== q.targetType) continue;
        visitedNodes.set(node.id, node);
      }
    }

    return {
      paths,
      nodes: [...visitedNodes.values()],
      edges: [...collectedEdges.values()],
    };
  }

  private bfs(
    start: GraphNode,
    maxDepth: number,
    minConfidence: number,
    relation: RelationType | undefined,
    targetType: EntityType | undefined,
    visitedNodes: Map<string, GraphNode>,
    collectedEdges: Map<string, GraphEdge>,
    paths: GraphPath[],
  ): void {
    interface QueueItem {
      node: GraphNode;
      depth: number;
      pathNodes: GraphNode[];
      pathEdges: GraphEdge[];
      totalWeight: number;
    }

    const queue: QueueItem[] = [{ node: start, depth: 0, pathNodes: [start], pathEdges: [], totalWeight: 0 }];
    const visited = new Set<string>([start.id]);
    visitedNodes.set(start.id, start);

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (item.depth >= maxDepth) continue;

      for (const edge of this.edges.values()) {
        let neighborId: string | undefined;
        if (edge.source === item.node.id) neighborId = edge.target;
        else if (edge.target === item.node.id) neighborId = edge.source;
        if (!neighborId || visited.has(neighborId)) continue;
        if (relation && edge.relation !== relation) continue;

        const neighbor = this.nodes.get(neighborId);
        if (!neighbor || neighbor.confidence < minConfidence) continue;

        visited.add(neighborId);
        visitedNodes.set(neighborId, neighbor);
        collectedEdges.set(edge.id, edge);

        const newPathNodes = [...item.pathNodes, neighbor];
        const newPathEdges = [...item.pathEdges, edge];
        const newWeight = item.totalWeight + edge.weight;

        if (!targetType || neighbor.type === targetType) {
          paths.push({ nodes: newPathNodes, edges: newPathEdges, totalWeight: newWeight });
        }

        queue.push({
          node: neighbor,
          depth: item.depth + 1,
          pathNodes: newPathNodes,
          pathEdges: newPathEdges,
          totalWeight: newWeight,
        });
      }
    }
  }

  merge(nodeId1: string, nodeId2: string): GraphNode {
    const node1 = this.nodes.get(nodeId1);
    const node2 = this.nodes.get(nodeId2);
    if (!node1) throw new Error(`Node not found: ${nodeId1}`);
    if (!node2) throw new Error(`Node not found: ${nodeId2}`);

    // Merge into node1
    node1.mentionCount += node2.mentionCount;
    node1.confidence = Math.max(node1.confidence, node2.confidence);
    node1.updatedAt = Date.now();

    // Merge aliases
    if (!node1.aliases.includes(node2.name)) {
      node1.aliases.push(node2.name);
    }
    for (const alias of node2.aliases) {
      if (!node1.aliases.includes(alias)) {
        node1.aliases.push(alias);
      }
    }

    // Merge properties
    Object.assign(node1.properties, node2.properties);

    // Reassign edges
    for (const edge of this.edges.values()) {
      if (edge.source === nodeId2) edge.source = nodeId1;
      if (edge.target === nodeId2) edge.target = nodeId1;
    }

    // Update index
    this.nodeIndex.set(node2.name.toLowerCase(), nodeId1);
    for (const alias of node2.aliases) {
      this.nodeIndex.set(alias.toLowerCase(), nodeId1);
    }

    // Remove node2
    this.nodes.delete(nodeId2);

    log.debug(`Merged node ${node2.name} into ${node1.name}`);
    return node1;
  }

  removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Remove connected edges
    for (const [edgeId, edge] of this.edges) {
      if (edge.source === id || edge.target === id) {
        this.edges.delete(edgeId);
      }
    }

    // Remove from index
    this.nodeIndex.delete(node.name.toLowerCase());
    for (const alias of node.aliases) {
      this.nodeIndex.delete(alias.toLowerCase());
    }

    this.nodes.delete(id);
    log.debug(`Removed node: ${node.name}`);
  }

  removeEdge(id: string): void {
    this.edges.delete(id);
  }

  stats(): { nodeCount: number; edgeCount: number; relationCounts: Record<string, number> } {
    const relationCounts: Record<string, number> = {};
    for (const edge of this.edges.values()) {
      relationCounts[edge.relation] = (relationCounts[edge.relation] ?? 0) + 1;
    }
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      relationCounts,
    };
  }

  toJSON(): string {
    return JSON.stringify({
      nodes: [...this.nodes.values()],
      edges: [...this.edges.values()],
    });
  }

  static fromJSON(json: string): GraphStore {
    let data: { nodes: GraphNode[]; edges: GraphEdge[] };
    try {
      data = JSON.parse(json) as { nodes: GraphNode[]; edges: GraphEdge[] };
    } catch {
      throw new Error('Invalid JSON input for GraphStore');
    }

    if (!Array.isArray(data?.nodes) || !Array.isArray(data?.edges)) {
      throw new Error('Invalid GraphStore data: expected { nodes: [], edges: [] }');
    }

    const store = new GraphStore();

    for (const node of data.nodes) {
      store.nodes.set(node.id, node);
      store.nodeIndex.set(node.name.toLowerCase(), node.id);
      for (const alias of node.aliases) {
        store.nodeIndex.set(alias.toLowerCase(), node.id);
      }
    }

    for (const edge of data.edges) {
      store.edges.set(edge.id, edge);
    }

    return store;
  }

  private resolveNode(idOrName: string): GraphNode | undefined {
    // Try direct ID lookup first
    const byId = this.nodes.get(idOrName);
    if (byId) return byId;

    // Try name/alias index
    const nodeId = this.nodeIndex.get(idOrName.toLowerCase());
    if (nodeId) return this.nodes.get(nodeId);

    return undefined;
  }
}
