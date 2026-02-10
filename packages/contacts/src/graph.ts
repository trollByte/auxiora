import { nanoid } from 'nanoid';
import type { Contact, ContactGraphConfig } from './types.js';

export class ContactGraph {
  private contacts: Map<string, Contact> = new Map();
  private config: ContactGraphConfig;

  constructor(config?: ContactGraphConfig) {
    this.config = {
      mergeThreshold: config?.mergeThreshold ?? 0.8,
      decayDays: config?.decayDays ?? 90,
    };
  }

  addContact(input: Omit<Contact, 'id' | 'relationship'>): Contact {
    const contact: Contact = {
      ...input,
      id: nanoid(),
      relationship: {
        strength: 0,
        frequency: 0,
        recency: Infinity,
        context: 'unknown',
      },
    };
    this.contacts.set(contact.id, contact);
    return contact;
  }

  getById(id: string): Contact | undefined {
    return this.contacts.get(id);
  }

  findByEmail(email: string): Contact | undefined {
    const lower = email.toLowerCase();
    for (const contact of this.contacts.values()) {
      if (contact.emails.some(e => e.toLowerCase() === lower)) {
        return contact;
      }
    }
    return undefined;
  }

  findByName(name: string): Contact[] {
    const lower = name.toLowerCase();
    const results: Contact[] = [];
    for (const contact of this.contacts.values()) {
      if (contact.displayName.toLowerCase().includes(lower)) {
        results.push(contact);
      }
    }
    return results;
  }

  search(query: string): Contact[] {
    const lower = query.toLowerCase();
    const results: Contact[] = [];
    for (const contact of this.contacts.values()) {
      if (
        contact.displayName.toLowerCase().includes(lower) ||
        contact.emails.some(e => e.toLowerCase().includes(lower)) ||
        contact.company?.toLowerCase().includes(lower) ||
        contact.tags?.some(t => t.toLowerCase().includes(lower))
      ) {
        results.push(contact);
      }
    }
    return results;
  }

  merge(id1: string, id2: string): Contact {
    const c1 = this.contacts.get(id1);
    const c2 = this.contacts.get(id2);
    if (!c1 || !c2) {
      throw new Error(`Contact not found: ${!c1 ? id1 : id2}`);
    }

    const mergedEmails = [...new Set([...c1.emails, ...c2.emails])];
    const mergedSources = [...c1.sources, ...c2.sources];
    const mergedNotes = [...(c1.notes ?? []), ...(c2.notes ?? [])];
    const mergedTags = [...new Set([...(c1.tags ?? []), ...(c2.tags ?? [])])];

    const merged: Contact = {
      ...c1,
      emails: mergedEmails,
      sources: mergedSources,
      notes: mergedNotes.length > 0 ? mergedNotes : undefined,
      tags: mergedTags.length > 0 ? mergedTags : undefined,
    };

    this.contacts.set(id1, merged);
    this.contacts.delete(id2);
    return merged;
  }

  update(id: string, updates: Partial<Omit<Contact, 'id'>>): Contact | undefined {
    const contact = this.contacts.get(id);
    if (!contact) return undefined;
    const updated = { ...contact, ...updates, id: contact.id };
    this.contacts.set(id, updated);
    return updated;
  }

  remove(id: string): boolean {
    return this.contacts.delete(id);
  }

  getAll(): Contact[] {
    return [...this.contacts.values()];
  }

  count(): number {
    return this.contacts.size;
  }
}
