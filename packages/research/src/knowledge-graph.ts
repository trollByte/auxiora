import { nanoid } from 'nanoid';
import type { KnowledgeEntity, KnowledgeRelation } from './types.js';

export class KnowledgeGraph {
  private entities = new Map<string, KnowledgeEntity>();
  private relations: KnowledgeRelation[] = [];

  addEntity(name: string, type: string, properties?: Record<string, string>): KnowledgeEntity {
    const entity: KnowledgeEntity = {
      id: nanoid(),
      name,
      type,
      properties: properties ?? {},
    };

    this.entities.set(entity.id, entity);
    return entity;
  }

  getEntity(id: string): KnowledgeEntity | undefined {
    return this.entities.get(id);
  }

  findByName(name: string): KnowledgeEntity | undefined {
    for (const entity of this.entities.values()) {
      if (entity.name === name) {
        return entity;
      }
    }
    return undefined;
  }

  findByType(type: string): KnowledgeEntity[] {
    const result: KnowledgeEntity[] = [];
    for (const entity of this.entities.values()) {
      if (entity.type === type) {
        result.push(entity);
      }
    }
    return result;
  }

  addRelation(fromId: string, toId: string, relation: string): void {
    this.relations.push({ fromId, toId, relation });
  }

  getRelated(entityId: string): Array<{ entity: KnowledgeEntity; relation: string; direction: 'from' | 'to' }> {
    const result: Array<{ entity: KnowledgeEntity; relation: string; direction: 'from' | 'to' }> = [];

    for (const rel of this.relations) {
      if (rel.fromId === entityId) {
        const entity = this.entities.get(rel.toId);
        if (entity) {
          result.push({ entity, relation: rel.relation, direction: 'from' });
        }
      }
      if (rel.toId === entityId) {
        const entity = this.entities.get(rel.fromId);
        if (entity) {
          result.push({ entity, relation: rel.relation, direction: 'to' });
        }
      }
    }

    return result;
  }

  removeEntity(id: string): boolean {
    const deleted = this.entities.delete(id);
    if (deleted) {
      this.relations = this.relations.filter((r) => r.fromId !== id && r.toId !== id);
    }
    return deleted;
  }

  toJSON(): { entities: KnowledgeEntity[]; relations: KnowledgeRelation[] } {
    return {
      entities: Array.from(this.entities.values()),
      relations: [...this.relations],
    };
  }

  clear(): void {
    this.entities.clear();
    this.relations = [];
  }
}
