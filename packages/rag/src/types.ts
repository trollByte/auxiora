export type DocumentType = 'text' | 'markdown' | 'html' | 'json' | 'csv';

export interface Document {
  id: string;
  title: string;
  type: DocumentType;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  index: number;
  metadata: Record<string, unknown>;
  tokens: number;
}

export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
  document: Document;
}

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  documentIds?: string[];
  type?: DocumentType;
}
