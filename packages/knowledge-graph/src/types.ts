export type EntityType = 'person' | 'organization' | 'place' | 'project' | 'concept' | 'event' | 'tool' | 'custom';
export type RelationType = 'works_at' | 'manages' | 'reports_to' | 'competes_with' | 'partners_with' | 'located_in' | 'member_of' | 'related_to' | 'uses' | 'created' | 'owns' | 'depends_on' | 'custom';

export interface GraphNode {
  id: string;
  name: string;
  type: EntityType;
  aliases: string[];
  properties: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  mentionCount: number;
  confidence: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: RelationType;
  label?: string;
  weight: number;
  properties: Record<string, unknown>;
  createdAt: number;
  evidence: string[];
}

export interface GraphQuery {
  startNode?: string;
  relation?: RelationType;
  targetType?: EntityType;
  maxDepth?: number;
  minConfidence?: number;
}

export interface QueryResult {
  paths: GraphPath[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalWeight: number;
}

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  confidence: number;
  span: [number, number];
}

export interface ExtractedRelation {
  source: string;
  target: string;
  relation: RelationType;
  label?: string;
  evidence: string;
}
