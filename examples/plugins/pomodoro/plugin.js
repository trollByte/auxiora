/**
 * Pomodoro Plugin — Behavior plugin with scheduled messages
 *
 * Demonstrates:
 * - PluginManifest with behaviors[]
 * - Scheduled behavior using cron
 * - PluginContext usage in initialize()
 * - Dynamic tool registration
 */

let sessions = [];
let currentSession = null;

export const plugin = {
  name: 'pomodoro',
  version: '1.0.0',
  description: 'Pomodoro timer with focus sessions and break reminders',
  permissions: [],

  tools: [
    {
      name: 'pomodoro_start',
      description: 'Start a new Pomodoro focus session (default 25 minutes)',
      parameters: {
        type: 'object',
        properties: {
          duration: { type: 'number', description: 'Focus duration in minutes (default: 25)' },
          task: { type: 'string', description: 'What are you working on?' },
        },
        required: [],
      },
      execute: async ({ duration = 25, task = 'Focus session' }) => {
        if (currentSession) {
          return {
            success: false,
            error: `A session is already running: "${currentSession.task}" (started ${new Date(currentSession.startedAt).toLocaleTimeString()})`,
          };
        }

        currentSession = {
          id: `pom-${Date.now()}`,
          task,
          duration,
          startedAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + duration * 60_000).toISOString(),
        };

        return {
          success: true,
          output: [
            `Pomodoro started: ${task}`,
            `Duration: ${duration} minutes`,
            `Ends at: ${new Date(currentSession.endsAt).toLocaleTimeString()}`,
            'Stay focused! I will remind you when the session ends.',
          ].join('\n'),
        };
      },
    },
    {
      name: 'pomodoro_stop',
      description: 'Stop the current Pomodoro session',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        if (!currentSession) {
          return { success: false, error: 'No active Pomodoro session' };
        }

        const elapsed = Math.round((Date.now() - new Date(currentSession.startedAt).getTime()) / 60_000);
        const session = { ...currentSession, completedAt: new Date().toISOString(), elapsed };
        sessions.push(session);
        currentSession = null;

        return {
          success: true,
          output: [
            `Pomodoro stopped: ${session.task}`,
            `Duration: ${elapsed} of ${session.duration} minutes`,
            `Total sessions today: ${sessions.length}`,
          ].join('\n'),
        };
      },
    },
    {
      name: 'pomodoro_status',
      description: 'Check the current Pomodoro session status',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        if (!currentSession) {
          return {
            success: true,
            output: `No active Pomodoro session. Total completed today: ${sessions.length}`,
          };
        }

        const elapsed = Math.round((Date.now() - new Date(currentSession.startedAt).getTime()) / 60_000);
        const remaining = currentSession.duration - elapsed;

        return {
          success: true,
          output: [
            `Active session: ${currentSession.task}`,
            `Elapsed: ${elapsed}/${currentSession.duration} minutes`,
            `Remaining: ${Math.max(0, remaining)} minutes`,
            `Completed today: ${sessions.length}`,
          ].join('\n'),
        };
      },
    },
  ],

  behaviors: [
    {
      name: 'pomodoro-break-reminder',
      description: 'Reminds the user to take a break after a Pomodoro session ends',
      type: 'monitor',
      execute: async (ctx) => {
        if (!currentSession) return 'no active session';

        const elapsed = Date.now() - new Date(currentSession.startedAt).getTime();
        const durationMs = currentSession.duration * 60_000;

        if (elapsed >= durationMs) {
          const task = currentSession.task;
          sessions.push({
            ...currentSession,
            completedAt: new Date().toISOString(),
            elapsed: currentSession.duration,
          });
          currentSession = null;

          await ctx.sendMessage(
            `Pomodoro complete! "${task}" session finished. Time for a 5-minute break. You have completed ${sessions.length} sessions today.`
          );
          return 'session completed, break reminder sent';
        }

        return 'session in progress';
      },
    },
  ],

  initialize: async (ctx) => {
    ctx.logger.info('Pomodoro plugin initialized');
  },
};
