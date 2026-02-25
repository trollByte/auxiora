import { describe, it, expect } from 'vitest';
import { ContactGraph } from '../src/graph.js';

function makeInput(overrides: Partial<Parameters<ContactGraph['addContact']>[0]> = {}) {
  return {
    displayName: 'Alice Smith',
    emails: ['alice@example.com'],
    sources: [{ type: 'manual' as const, sourceId: 'test', importedAt: Date.now() }],
    ...overrides,
  };
}

describe('ContactGraph', () => {
  it('addContact generates ID', () => {
    const graph = new ContactGraph();
    const contact = graph.addContact(makeInput());
    expect(contact.id).toBeDefined();
    expect(typeof contact.id).toBe('string');
    expect(contact.id.length).toBeGreaterThan(0);
  });

  it('addContact sets default relationship', () => {
    const graph = new ContactGraph();
    const contact = graph.addContact(makeInput());
    expect(contact.relationship).toEqual({
      strength: 0,
      frequency: 0,
      recency: Infinity,
      context: 'unknown',
    });
  });

  it('findByEmail finds correct contact', () => {
    const graph = new ContactGraph();
    graph.addContact(makeInput());
    const found = graph.findByEmail('alice@example.com');
    expect(found).toBeDefined();
    expect(found!.displayName).toBe('Alice Smith');
  });

  it('findByEmail returns undefined for unknown', () => {
    const graph = new ContactGraph();
    graph.addContact(makeInput());
    expect(graph.findByEmail('unknown@example.com')).toBeUndefined();
  });

  it('findByName case-insensitive match', () => {
    const graph = new ContactGraph();
    graph.addContact(makeInput());
    const results = graph.findByName('alice');
    expect(results).toHaveLength(1);
    expect(results[0].displayName).toBe('Alice Smith');
  });

  it('search matches across fields', () => {
    const graph = new ContactGraph();
    graph.addContact(makeInput({ company: 'Acme Corp', tags: ['vip'] }));
    expect(graph.search('acme')).toHaveLength(1);
    expect(graph.search('vip')).toHaveLength(1);
    expect(graph.search('alice')).toHaveLength(1);
    expect(graph.search('example.com')).toHaveLength(1);
  });

  it('merge combines emails', () => {
    const graph = new ContactGraph();
    const c1 = graph.addContact(makeInput());
    const c2 = graph.addContact(makeInput({
      displayName: 'Alice S.',
      emails: ['alice2@example.com'],
    }));
    const merged = graph.merge(c1.id, c2.id);
    expect(merged.emails).toContain('alice@example.com');
    expect(merged.emails).toContain('alice2@example.com');
    expect(merged.displayName).toBe('Alice Smith');
  });

  it('merge removes second contact', () => {
    const graph = new ContactGraph();
    const c1 = graph.addContact(makeInput());
    const c2 = graph.addContact(makeInput({
      displayName: 'Alice S.',
      emails: ['alice2@example.com'],
    }));
    graph.merge(c1.id, c2.id);
    expect(graph.getById(c2.id)).toBeUndefined();
    expect(graph.count()).toBe(1);
  });

  it('remove deletes contact', () => {
    const graph = new ContactGraph();
    const c = graph.addContact(makeInput());
    expect(graph.remove(c.id)).toBe(true);
    expect(graph.getById(c.id)).toBeUndefined();
  });

  it('count returns correct number', () => {
    const graph = new ContactGraph();
    expect(graph.count()).toBe(0);
    graph.addContact(makeInput());
    expect(graph.count()).toBe(1);
    graph.addContact(makeInput({ displayName: 'Bob', emails: ['bob@example.com'] }));
    expect(graph.count()).toBe(2);
  });
});
