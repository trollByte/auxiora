import type { Contact } from './types.js';
import type { ContactGraph } from './graph.js';

export class ContextRecall {
  private graph: ContactGraph;

  constructor(graph: ContactGraph) {
    this.graph = graph;
  }

  getContext(emailOrName: string): { contact: Contact; relationshipSummary: string } | null {
    let contact = this.graph.findByEmail(emailOrName);
    if (!contact) {
      const byName = this.graph.findByName(emailOrName);
      if (byName.length > 0) {
        contact = byName[0];
      }
    }
    if (!contact) return null;

    const rel = contact.relationship;
    const recencyText = isFinite(rel.recency)
      ? `${Math.round(rel.recency)} days ago`
      : 'never';
    const relationshipSummary = `Strong relationship (score ${rel.strength.toFixed(2)}). Context: ${rel.context}. Last interaction: ${recencyText}.`;

    return { contact, relationshipSummary };
  }

  whoIs(query: string): string {
    const result = this.getContext(query);
    if (!result) return `No contact found for "${query}".`;

    const { contact, relationshipSummary } = result;
    const email = contact.emails[0] ?? 'no email';
    const company = contact.company ? ` at ${contact.company}` : '';
    const title = contact.jobTitle ? ` - ${contact.jobTitle}` : '';
    const notes = contact.notes?.length ? ` Notes: ${contact.notes.join('; ')}` : '';

    return `${contact.displayName} (${email})${company}${title}. ${relationshipSummary}${notes}`;
  }

  getUpcomingBirthdays(contacts: Contact[], withinDays = 30): Contact[] {
    const now = new Date();
    const currentYear = now.getFullYear();

    return contacts.filter(contact => {
      if (!contact.birthday) return false;

      const bday = new Date(contact.birthday);
      // Set birthday to current year
      const thisYearBday = new Date(currentYear, bday.getMonth(), bday.getDate());

      // If birthday already passed this year, check next year
      if (thisYearBday.getTime() < now.getTime()) {
        thisYearBday.setFullYear(currentYear + 1);
      }

      const diffMs = thisYearBday.getTime() - now.getTime();
      const diffDays = diffMs / (24 * 60 * 60 * 1000);
      return diffDays >= 0 && diffDays <= withinDays;
    });
  }
}
