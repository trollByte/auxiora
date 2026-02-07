export interface MemoryEntry {
  id: string;
  content: string;
  category: 'preference' | 'fact' | 'context';
  source: 'extracted' | 'explicit';
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  tags: string[];
}

export type MemoryCategory = MemoryEntry['category'];
export type MemorySource = MemoryEntry['source'];
