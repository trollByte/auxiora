import { DatabaseSync } from 'node:sqlite';
import type { AgentStatus } from './types.js';

export interface StoredNode {
  id: string;
  workflowId: string;
  name: string;
  parentId?: string;
  depth: number;
  status: AgentStatus;
  startedAt: number;
  completedAt?: number;
  tokenUsage: number;
}

export interface StoredEdge {
  workflowId: string;
  parentId: string;
  childId: string;
}

export interface WorkflowSummary {
  workflowId: string;
  nodeCount: number;
  firstStartedAt: number;
}

export interface StoredSnapshot {
  nodes: StoredNode[];
  edges: StoredEdge[];
  totalTokenUsage: number;
}

const NODES_DDL = `
  CREATE TABLE IF NOT EXISTS callgraph_nodes (
    id TEXT NOT NULL,
    workflowId TEXT NOT NULL,
    name TEXT NOT NULL,
    parentId TEXT,
    depth INTEGER NOT NULL,
    status TEXT NOT NULL,
    startedAt INTEGER NOT NULL,
    completedAt INTEGER,
    tokenUsage INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id, workflowId)
  )
`;

const EDGES_DDL = `
  CREATE TABLE IF NOT EXISTS callgraph_edges (
    workflowId TEXT NOT NULL,
    parentId TEXT NOT NULL,
    childId TEXT NOT NULL,
    PRIMARY KEY (workflowId, parentId, childId)
  )
`;

export class CallgraphStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA busy_timeout=5000');
    this.db.exec(NODES_DDL);
    this.db.exec(EDGES_DDL);
  }

  recordNode(node: StoredNode): void {
    if (this.closed) return;
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO callgraph_nodes (id, workflowId, name, parentId, depth, status, startedAt, completedAt, tokenUsage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    stmt.run(node.id, node.workflowId, node.name, node.parentId ?? null, node.depth, node.status, node.startedAt, node.completedAt ?? null, node.tokenUsage);
  }

  recordEdge(edge: StoredEdge): void {
    if (this.closed) return;
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO callgraph_edges (workflowId, parentId, childId) VALUES (?, ?, ?)',
    );
    stmt.run(edge.workflowId, edge.parentId, edge.childId);
  }

  getNodesByWorkflow(workflowId: string): StoredNode[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM callgraph_nodes WHERE workflowId = ? ORDER BY depth ASC, startedAt ASC');
    const rows = stmt.all(workflowId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string,
      workflowId: r.workflowId as string,
      name: r.name as string,
      parentId: (r.parentId as string) || undefined,
      depth: r.depth as number,
      status: r.status as AgentStatus,
      startedAt: r.startedAt as number,
      completedAt: (r.completedAt as number) || undefined,
      tokenUsage: r.tokenUsage as number,
    }));
  }

  getEdgesByWorkflow(workflowId: string): StoredEdge[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM callgraph_edges WHERE workflowId = ?');
    const rows = stmt.all(workflowId) as Record<string, unknown>[];
    return rows.map((r) => ({
      workflowId: r.workflowId as string,
      parentId: r.parentId as string,
      childId: r.childId as string,
    }));
  }

  getSnapshot(workflowId: string): StoredSnapshot {
    const nodes = this.getNodesByWorkflow(workflowId);
    const edges = this.getEdgesByWorkflow(workflowId);
    let totalTokenUsage = 0;
    for (const node of nodes) {
      totalTokenUsage += node.tokenUsage;
    }
    return { nodes, edges, totalTokenUsage };
  }

  listWorkflows(): WorkflowSummary[] {
    if (this.closed) return [];
    const stmt = this.db.prepare(
      'SELECT workflowId, COUNT(*) as nodeCount, MIN(startedAt) as firstStartedAt FROM callgraph_nodes GROUP BY workflowId ORDER BY firstStartedAt DESC',
    );
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((r) => ({
      workflowId: r.workflowId as string,
      nodeCount: r.nodeCount as number,
      firstStartedAt: r.firstStartedAt as number,
    }));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
