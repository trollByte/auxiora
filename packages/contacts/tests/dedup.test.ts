import { describe, it, expect } from 'vitest';
import { ContactDeduplicator } from '../src/dedup.js';
import type { Contact } from '../src/types.js';

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'test-id',
    displayName: 'Test User',
    emails: ['test@example.com'],
    sources: [{ type: 'manual', sourceId: 'test', importedAt: Date.now() }],
    relationship: { strength: 0, frequency: 0, recency: Infinity, context: 'unknown' },
    ...overrides,
  };
}

describe('ContactDeduplicator', () => {
  const dedup = new ContactDeduplicator();

  it('same email produces similarity >= 0.9', () => {
    const a = makeContact({ id: 'a', displayName: 'Alice', emails: ['shared@example.com'] });
    const b = makeContact({ id: 'b', displayName: 'Bob', emails: ['shared@example.com'] });
    expect(dedup.similarity(a, b)).toBeGreaterThanOrEqual(0.9);
  });

  it('same name produces high similarity', () => {
    const a = makeContact({ id: 'a', displayName: 'Alice Smith', emails: ['a@test.com'] });
    const b = makeContact({ id: 'b', displayName: 'Alice Smith', emails: ['b@test.com'] });
    expect(dedup.similarity(a, b)).toBe(1.0);
  });

  it('no overlap produces low similarity', () => {
    const a = makeContact({ id: 'a', displayName: 'Alice', emails: ['alice@test.com'] });
    const b = makeContact({ id: 'b', displayName: 'Zyx', emails: ['zyx@other.com'] });
    expect(dedup.similarity(a, b)).toBeLessThan(0.5);
  });

  it('findDuplicates returns pairs above threshold', () => {
    const contacts = [
      makeContact({ id: 'a', displayName: 'Alice', emails: ['alice@test.com'] }),
      makeContact({ id: 'b', displayName: 'Alice', emails: ['alice@test.com'] }),
    ];
    const pairs = dedup.findDuplicates(contacts, 0.7);
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    expect(pairs[0].similarity).toBeGreaterThanOrEqual(0.7);
  });

  it('findDuplicates ignores below threshold', () => {
    const contacts = [
      makeContact({ id: 'a', displayName: 'Alice', emails: ['alice@test.com'] }),
      makeContact({ id: 'b', displayName: 'Zyx', emails: ['zyx@other.com'] }),
    ];
    const pairs = dedup.findDuplicates(contacts, 0.9);
    expect(pairs).toHaveLength(0);
  });

  it('company match adds to score', () => {
    const a = makeContact({
      id: 'a', displayName: 'Alice Smith', emails: ['a@test.com'], company: 'Acme',
    });
    const b = makeContact({
      id: 'b', displayName: 'Al Smith', emails: ['b@test.com'], company: 'Acme',
    });
    const withCompany = dedup.similarity(a, b);

    const c = makeContact({
      id: 'c', displayName: 'Alice Smith', emails: ['a@test.com'],
    });
    const d = makeContact({
      id: 'd', displayName: 'Al Smith', emails: ['b@test.com'],
    });
    const withoutCompany = dedup.similarity(c, d);

    expect(withCompany).toBeGreaterThan(withoutCompany);
  });
});
