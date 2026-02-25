import { describe, it, expect } from 'vitest';
import { ContactGraph } from '../src/graph.js';
import { ContextRecall } from '../src/context.js';
import type { Contact } from '../src/types.js';

function setupGraph() {
  const graph = new ContactGraph();
  const contact = graph.addContact({
    displayName: 'Alice Smith',
    emails: ['alice@example.com'],
    sources: [{ type: 'manual', sourceId: 'test', importedAt: Date.now() }],
    company: 'Acme Corp',
    jobTitle: 'Engineer',
    notes: ['Met at conference'],
    birthday: getBirthdaySoon(),
  });
  // Manually update relationship for testing
  graph.update(contact.id, {
    relationship: { strength: 0.85, frequency: 5, recency: 3, context: 'colleague' },
  });
  return { graph, contact: graph.getById(contact.id)! };
}

function getBirthdaySoon(): string {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return `${d.getFullYear() - 30}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('ContextRecall', () => {
  it('getContext finds by email', () => {
    const { graph } = setupGraph();
    const recall = new ContextRecall(graph);
    const result = recall.getContext('alice@example.com');
    expect(result).not.toBeNull();
    expect(result!.contact.displayName).toBe('Alice Smith');
    expect(result!.relationshipSummary).toContain('0.85');
  });

  it('getContext finds by name', () => {
    const { graph } = setupGraph();
    const recall = new ContextRecall(graph);
    const result = recall.getContext('Alice');
    expect(result).not.toBeNull();
    expect(result!.contact.emails).toContain('alice@example.com');
  });

  it('getContext returns null for unknown', () => {
    const { graph } = setupGraph();
    const recall = new ContextRecall(graph);
    expect(recall.getContext('nobody@nowhere.com')).toBeNull();
  });

  it('whoIs returns formatted string', () => {
    const { graph } = setupGraph();
    const recall = new ContextRecall(graph);
    const result = recall.whoIs('Alice');
    expect(result).toContain('Alice Smith');
    expect(result).toContain('alice@example.com');
    expect(result).toContain('Acme Corp');
    expect(result).toContain('Engineer');
    expect(result).toContain('Met at conference');
  });

  it('getUpcomingBirthdays filters correctly', () => {
    const { graph, contact } = setupGraph();
    const recall = new ContextRecall(graph);
    const allContacts = graph.getAll();

    const upcoming = recall.getUpcomingBirthdays(allContacts, 10);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].id).toBe(contact.id);

    // Birthday 5 days away should not appear in 2-day window
    const none = recall.getUpcomingBirthdays(allContacts, 2);
    expect(none).toHaveLength(0);
  });
});
