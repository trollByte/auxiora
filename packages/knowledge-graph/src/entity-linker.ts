import { getLogger } from '@auxiora/logger';
import type { GraphStore } from './graph-store.js';
import type { EntityType, ExtractedEntity, ExtractedRelation, GraphEdge, GraphNode, RelationType } from './types.js';

const log = getLogger('knowledge-graph:linker');

const COMPANY_SUFFIXES = /\b(Inc|Corp|Corporation|Ltd|LLC|GmbH|Co|PLC|AG|SA|NV|BV)\b\.?/;

interface RelationPattern {
  pattern: RegExp;
  relation: RelationType;
  sourceGroup: number;
  targetGroup: number;
}

const RELATION_PATTERNS: RelationPattern[] = [
  { pattern: /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+works?\s+at\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g, relation: 'works_at', sourceGroup: 1, targetGroup: 2 },
  { pattern: /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+manages?\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/g, relation: 'manages', sourceGroup: 1, targetGroup: 2 },
  { pattern: /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+reports?\s+to\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/g, relation: 'reports_to', sourceGroup: 1, targetGroup: 2 },
  { pattern: /([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)\s+(?:competes?|is a competitor)\s+(?:with|of)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g, relation: 'competes_with', sourceGroup: 1, targetGroup: 2 },
  { pattern: /([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)\s+(?:partners?|partnered)\s+with\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g, relation: 'partners_with', sourceGroup: 1, targetGroup: 2 },
  { pattern: /([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)\s+(?:is |are )?located\s+in\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g, relation: 'located_in', sourceGroup: 1, targetGroup: 2 },
  { pattern: /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+(?:is |are )?(?:a )?(?:CEO|CTO|CFO|founder|director|president|VP|head)\s+(?:of|at)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g, relation: 'manages', sourceGroup: 1, targetGroup: 2 },
  { pattern: /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+(?:uses?|utilizes?)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g, relation: 'uses', sourceGroup: 1, targetGroup: 2 },
  { pattern: /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+(?:created|founded|built)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g, relation: 'created', sourceGroup: 1, targetGroup: 2 },
  { pattern: /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+(?:owns?|acquired)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g, relation: 'owns', sourceGroup: 1, targetGroup: 2 },
  { pattern: /([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)\s+and\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)\s+are\s+(?:competitors|rivals)/g, relation: 'competes_with', sourceGroup: 1, targetGroup: 2 },
];

export class EntityLinker {
  extractEntities(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const seen = new Set<string>();

    // Capitalized multi-word phrases (person/org names)
    const namePattern = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g;
    for (const match of text.matchAll(namePattern)) {
      const name = match[1];
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());

      const type = this.inferEntityType(name, text);
      entities.push({
        name,
        type,
        confidence: 0.7,
        span: [match.index!, match.index! + match[0].length],
      });
    }

    // Company suffixes -> organization
    const orgPattern = /\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*\s+(?:Inc|Corp|Corporation|Ltd|LLC|GmbH|Co|PLC|AG|SA|NV|BV))\.?\b/g;
    for (const match of text.matchAll(orgPattern)) {
      const name = match[1];
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      entities.push({
        name,
        type: 'organization',
        confidence: 0.9,
        span: [match.index!, match.index! + match[0].length],
      });
    }

    // Single capitalized words near relation keywords
    const singleCapPattern = /\b([A-Z][a-z]{2,})\b/g;
    for (const match of text.matchAll(singleCapPattern)) {
      const name = match[1];
      if (seen.has(name.toLowerCase())) continue;
      if (COMMON_WORDS.has(name.toLowerCase())) continue;
      const surroundingText = text.slice(Math.max(0, match.index! - 50), match.index! + name.length + 50);
      if (/(?:works?|manages?|CEO|CTO|founded|competes?|partners?|located|reports?|uses?|created|owns?)/i.test(surroundingText)) {
        seen.add(name.toLowerCase());
        entities.push({
          name,
          type: this.inferEntityType(name, text),
          confidence: 0.5,
          span: [match.index!, match.index! + match[0].length],
        });
      }
    }

    // Email addresses -> person
    const emailPattern = /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
    for (const match of text.matchAll(emailPattern)) {
      const localPart = match[1];
      const name = localPart.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      entities.push({
        name,
        type: 'person',
        confidence: 0.6,
        span: [match.index!, match.index! + match[0].length],
      });
    }

    // @mentions -> person
    const mentionPattern = /@([a-zA-Z][a-zA-Z0-9_]+)/g;
    for (const match of text.matchAll(mentionPattern)) {
      const name = match[1];
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      entities.push({
        name,
        type: 'person',
        confidence: 0.6,
        span: [match.index!, match.index! + match[0].length],
      });
    }

    log.debug(`Extracted ${entities.length} entities from text`);
    return entities;
  }

  extractRelationships(text: string, entities: ExtractedEntity[]): ExtractedRelation[] {
    const relations: ExtractedRelation[] = [];

    for (const rp of RELATION_PATTERNS) {
      const pattern = new RegExp(rp.pattern.source, rp.pattern.flags);
      for (const match of text.matchAll(pattern)) {
        const source = match[rp.sourceGroup];
        const target = match[rp.targetGroup];
        if (!source || !target) continue;

        relations.push({
          source,
          target,
          relation: rp.relation,
          evidence: match[0],
        });
      }
    }

    log.debug(`Extracted ${relations.length} relationships from text`);
    return relations;
  }

  linkToGraph(text: string, graph: GraphStore): { newNodes: GraphNode[]; newEdges: GraphEdge[] } {
    const entities = this.extractEntities(text);
    const relations = this.extractRelationships(text, entities);

    const newNodes: GraphNode[] = [];
    const newEdges: GraphEdge[] = [];

    for (const entity of entities) {
      const existing = graph.getNode(entity.name);
      const node = graph.addNode({
        name: entity.name,
        type: entity.type,
        aliases: [],
        properties: {},
        confidence: entity.confidence,
      });
      if (!existing) {
        newNodes.push(node);
      }
    }

    for (const rel of relations) {
      try {
        const edge = graph.addEdge(rel.source, rel.target, rel.relation, {
          evidence: [rel.evidence],
          label: rel.label,
        });
        newEdges.push(edge);
      } catch {
        log.debug(`Could not link relationship: ${rel.source} -> ${rel.target}`);
      }
    }

    log.debug(`Linked ${newNodes.length} new nodes and ${newEdges.length} new edges`);
    return { newNodes, newEdges };
  }

  private inferEntityType(name: string, context: string): EntityType {
    if (COMPANY_SUFFIXES.test(name)) return 'organization';

    const nameEscaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const surrounding = new RegExp(`(?:${nameEscaped})\\s+(?:Inc|Corp|Ltd|LLC|Company|Group)`, 'i');
    if (surrounding.test(context)) return 'organization';

    const rolePattern = new RegExp(`(?:${nameEscaped})\\s+(?:is|was)\\s+(?:a\\s+)?(?:CEO|CTO|CFO|manager|engineer|developer|designer|director|president|founder)`, 'i');
    if (rolePattern.test(context)) return 'person';

    const worksPattern = new RegExp(`(?:${nameEscaped})\\s+(?:works?|manages?|reports?|joined)`, 'i');
    if (worksPattern.test(context)) return 'person';

    const placePattern = new RegExp(`(?:in|at|from|near)\\s+${nameEscaped}`, 'i');
    if (placePattern.test(context)) return 'place';

    return 'person';
  }
}

const COMMON_WORDS = new Set([
  'the', 'this', 'that', 'with', 'from', 'have', 'has', 'had', 'been', 'were',
  'was', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'his', 'one',
  'our', 'out', 'day', 'get', 'him', 'how', 'its', 'may', 'new',
  'now', 'old', 'see', 'way', 'who', 'did', 'let', 'say', 'she', 'too',
  'use', 'and', 'for', 'also', 'just', 'will', 'than', 'then', 'when',
  'what', 'some', 'into', 'them', 'they', 'here', 'there', 'where',
]);
