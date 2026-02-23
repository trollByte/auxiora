export const plugin = {
  name: 'pomodoro',
  version: '1.0.0',
  description: 'Simple pomodoro timer helper that formats timer info as markdown.',
  permissions: [],
  tools: [
    {
      name: 'pomodoro_timer',
      description:
        'Manage a pomodoro timer session. Supports start, status, and complete actions.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start', 'status', 'complete'],
            description:
              'Timer action: start, status, or complete. Defaults to start.',
          },
          task: {
            type: 'string',
            description: 'Task name for the pomodoro session (used with start).',
          },
        },
        required: [],
      },
      execute: async (params) => {
        const action = params.action || 'start';

        if (action === 'start') {
          const task = params.task || 'Unnamed task';
          const now = new Date();
          const end = new Date(now.getTime() + 25 * 60 * 1000);

          const lines = [
            `## Pomodoro Started`,
            '',
            `- **Task**: ${task}`,
            `- **Duration**: 25 minutes`,
            `- **Started**: ${now.toISOString()}`,
            `- **Ends at**: ${end.toISOString()}`,
          ];

          return { success: true, output: lines.join('\n') };
        }

        if (action === 'complete') {
          const lines = [
            `## Pomodoro Complete!`,
            '',
            `Congratulations! You finished your pomodoro session.`,
            '',
            `Take a 5-minute break before starting the next one.`,
          ];

          return { success: true, output: lines.join('\n') };
        }

        // status
        return {
          success: true,
          output: 'No active pomodoro timer. Use the start action to begin one.',
        };
      },
    },
  ],
};
