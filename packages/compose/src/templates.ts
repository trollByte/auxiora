import type { Template, Tone } from './types.js';

const BUILT_IN: readonly Omit<Template, 'id'>[] = [
  {
    name: 'Meeting Follow-Up',
    category: 'business',
    body: 'Hi {{name}},\n\nThank you for taking the time to meet today. Here\'s a summary of what we discussed:\n\n{{summary}}\n\nNext steps:\n{{nextSteps}}\n\nPlease let me know if I missed anything.',
    variables: ['name', 'summary', 'nextSteps'],
    tone: 'formal' as Tone,
  },
  {
    name: 'Introduction',
    category: 'networking',
    body: 'Hi {{name}},\n\nI\'m {{senderName}} from {{company}}. {{reason}}\n\nI\'d love to connect and discuss further.',
    variables: ['name', 'senderName', 'company', 'reason'],
    tone: 'professional' as Tone,
  },
  {
    name: 'Thank You',
    category: 'personal',
    body: 'Hi {{name}},\n\nThank you so much for {{reason}}. I really appreciate it.\n\n{{additionalNote}}',
    variables: ['name', 'reason', 'additionalNote'],
    tone: 'friendly' as Tone,
  },
  {
    name: 'Cold Outreach',
    category: 'sales',
    body: 'Hi {{name}},\n\n{{hook}}\n\n{{valueProposition}}\n\nWould you be open to a {{meetingLength}} minute chat this week?',
    variables: ['name', 'hook', 'valueProposition', 'meetingLength'],
    tone: 'professional' as Tone,
  },
  {
    name: 'Status Update',
    category: 'business',
    body: '{{greeting}}\n\nHere\'s the status update for {{project}}:\n\n**Completed:**\n{{completed}}\n\n**In Progress:**\n{{inProgress}}\n\n**Blockers:**\n{{blockers}}',
    variables: ['greeting', 'project', 'completed', 'inProgress', 'blockers'],
    tone: 'professional' as Tone,
  },
  {
    name: 'Apology',
    category: 'personal',
    body: 'Hi {{name}},\n\nI want to sincerely apologize for {{issue}}. {{explanation}}\n\nTo make this right, {{resolution}}.',
    variables: ['name', 'issue', 'explanation', 'resolution'],
    tone: 'formal' as Tone,
  },
] as const;

export class TemplateEngine {
  private templates: Map<string, Template> = new Map();

  constructor() {
    const ids = [
      'meeting-follow-up',
      'introduction',
      'thank-you',
      'cold-outreach',
      'status-update',
      'apology',
    ];

    for (let i = 0; i < BUILT_IN.length; i++) {
      const builtin = BUILT_IN[i];
      const template: Template = { id: ids[i], ...builtin };
      this.templates.set(template.id, template);
    }
  }

  register(template: Template): void {
    this.templates.set(template.id, template);
  }

  get(id: string): Template | undefined {
    return this.templates.get(id);
  }

  list(category?: string): Template[] {
    const all = [...this.templates.values()];
    if (category) {
      return all.filter((t) => t.category === category);
    }
    return all;
  }

  render(templateId: string, variables: Record<string, string>): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    let result = template.body;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replaceAll(`{{${key}}}`, value);
    }

    return result;
  }
}
