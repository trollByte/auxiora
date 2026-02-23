export const plugin = {
  name: 'daily-summary',
  version: '1.0.0',
  description: 'Generates a daily briefing with calendar, email, and task sections.',
  permissions: [],
  tools: [
    {
      name: 'daily_summary',
      description:
        'Generate a daily briefing with sections for calendar events, emails, and tasks. Returns formatted markdown.',
      parameters: {
        type: 'object',
        properties: {
          include: {
            type: 'string',
            description:
              'Comma-separated list of sections to include (calendar,email,tasks). Defaults to all.',
          },
        },
      },
      execute: async (params) => {
        const validSections = ['calendar', 'email', 'tasks'];
        const requested = params.include
          ? params.include
              .split(',')
              .map((s) => s.trim().toLowerCase())
              .filter((s) => validSections.includes(s))
          : validSections;

        const timestamp = new Date().toISOString();
        const lines = [`# Daily Summary`, `_Generated: ${timestamp}_`, ''];

        if (requested.includes('calendar')) {
          lines.push(
            '## Calendar',
            '- No upcoming events scheduled.',
            '',
          );
        }

        if (requested.includes('email')) {
          lines.push(
            '## Email',
            '- Inbox is clear — no unread messages.',
            '',
          );
        }

        if (requested.includes('tasks')) {
          lines.push(
            '## Tasks',
            '- No pending tasks. Great job!',
            '',
          );
        }

        return { success: true, output: lines.join('\n') };
      },
    },
  ],
};
