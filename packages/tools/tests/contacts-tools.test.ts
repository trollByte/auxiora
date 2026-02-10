import { describe, it, expect } from 'vitest';
import {
  WhoIsTool,
  ContactSearchTool,
  ToolPermission,
  setContactGraph,
  setContextRecall,
} from '../src/index.js';

describe('WhoIsTool', () => {
  it('should have correct name', () => {
    expect(WhoIsTool.name).toBe('who_is');
  });

  it('should require query parameter', () => {
    const query = WhoIsTool.parameters.find(p => p.name === 'query');
    expect(query?.required).toBe(true);
  });

  it('should auto-approve (read-only)', () => {
    expect(WhoIsTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should handle missing context recall gracefully', async () => {
    setContextRecall(null);
    const result = await WhoIsTool.execute({ query: 'John' }, {} as any);
    expect(result.success).toBe(true);
    expect(result.output).toContain('not configured');
  });

  it('should look up a contact', async () => {
    setContextRecall({
      whoIs: (query: string) => `Jane Doe (jane@example.com) at Acme Corp. Strong relationship.`,
    });
    const result = await WhoIsTool.execute({ query: 'Jane' }, {} as any);
    expect(result.success).toBe(true);
    expect(result.output).toContain('Jane Doe');
    expect(result.output).toContain('Acme Corp');
  });

  it('should return no-match message', async () => {
    setContextRecall({
      whoIs: (query: string) => `No contact found for "${query}".`,
    });
    const result = await WhoIsTool.execute({ query: 'nobody@example.com' }, {} as any);
    expect(result.success).toBe(true);
    expect(result.output).toContain('No contact found');
  });
});

describe('ContactSearchTool', () => {
  it('should have correct name', () => {
    expect(ContactSearchTool.name).toBe('contact_search');
  });

  it('should require query parameter', () => {
    const query = ContactSearchTool.parameters.find(p => p.name === 'query');
    expect(query?.required).toBe(true);
  });

  it('should auto-approve (read-only)', () => {
    expect(ContactSearchTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should fail without contact graph', async () => {
    setContactGraph(null);
    const result = await ContactSearchTool.execute({ query: 'John' }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not initialized');
  });

  it('should search contacts', async () => {
    setContactGraph({
      search: (query: string) => [
        {
          id: '1',
          displayName: 'John Smith',
          emails: ['john@example.com'],
          company: 'TechCo',
          jobTitle: 'Engineer',
          relationship: { strength: 0.8, frequency: 5, recency: 2, context: 'colleague' },
        },
      ],
    });
    const result = await ContactSearchTool.execute({ query: 'John' }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.count).toBe(1);
    expect(parsed.contacts[0].displayName).toBe('John Smith');
  });

  it('should respect limit parameter', async () => {
    setContactGraph({
      search: () => Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        displayName: `Contact ${i}`,
        emails: [`c${i}@example.com`],
        relationship: { strength: 0, frequency: 0, recency: Infinity, context: 'unknown' },
      })),
    });
    const result = await ContactSearchTool.execute({ query: 'Contact', limit: 5 }, {} as any);
    const parsed = JSON.parse(result.output!);
    expect(parsed.count).toBe(5);
  });
});
