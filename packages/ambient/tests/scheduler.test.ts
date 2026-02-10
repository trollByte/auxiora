import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AmbientScheduler, DEFAULT_AMBIENT_SCHEDULER_CONFIG } from '../src/scheduler.js';
import { BriefingGenerator, formatBriefingAsText } from '../src/briefing.js';
import type { AmbientSchedulerDeps } from '../src/scheduler.js';
import type { Briefing } from '../src/briefing.js';

function createMockScheduler() {
  const jobs = new Map<string, { cron: string; callback: () => void }>();
  return {
    schedule: vi.fn((id: string, cron: string, callback: () => void) => {
      jobs.set(id, { cron, callback });
    }),
    stop: vi.fn((id: string) => {
      jobs.delete(id);
    }),
    stopAll: vi.fn(() => jobs.clear()),
    isScheduled: vi.fn((id: string) => jobs.has(id)),
    listScheduled: vi.fn(() => Array.from(jobs.keys())),
    _jobs: jobs,
  };
}

function createMockDeps(overrides?: Partial<AmbientSchedulerDeps>): AmbientSchedulerDeps & { _scheduler: ReturnType<typeof createMockScheduler> } {
  const scheduler = createMockScheduler();
  const deps: AmbientSchedulerDeps = {
    scheduler: scheduler as any,
    connectorRegistry: { get: vi.fn(), list: vi.fn(() => []), has: vi.fn() } as any,
    triggerManager: { pollAll: vi.fn(async () => []), subscribe: vi.fn(), unsubscribe: vi.fn() } as any,
    briefingGenerator: new BriefingGenerator(),
    deliveryChannel: vi.fn(async () => {}),
    userId: 'test-user',
    ...overrides,
  };
  return { ...deps, _scheduler: scheduler };
}

describe('AmbientScheduler', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let scheduler: AmbientScheduler;

  beforeEach(() => {
    deps = createMockDeps();
    scheduler = new AmbientScheduler(deps);
  });

  it('should not be running initially', () => {
    expect(scheduler.isRunning()).toBe(false);
  });

  it('should schedule 4 cron jobs on start', () => {
    scheduler.start();
    expect(deps._scheduler.schedule).toHaveBeenCalledTimes(4);
    expect(scheduler.isRunning()).toBe(true);
  });

  it('should schedule jobs with correct cron expressions', () => {
    scheduler.start();
    const calls = deps._scheduler.schedule.mock.calls;
    const jobMap = new Map(calls.map((c: any[]) => [c[0], c[1]]));
    expect(jobMap.get('ambient:email-poll')).toBe('*/2 * * * *');
    expect(jobMap.get('ambient:calendar-poll')).toBe('*/5 * * * *');
    expect(jobMap.get('ambient:morning-briefing')).toBe('0 7 * * *');
    expect(jobMap.get('ambient:evening-summary')).toBe('0 18 * * *');
  });

  it('should use custom cron expressions from config', () => {
    const custom = createMockDeps({
      config: { morningCron: '0 6 * * *', eveningCron: '0 20 * * *' },
    });
    const s = new AmbientScheduler(custom);
    s.start();
    const calls = custom._scheduler.schedule.mock.calls;
    const jobMap = new Map(calls.map((c: any[]) => [c[0], c[1]]));
    expect(jobMap.get('ambient:morning-briefing')).toBe('0 6 * * *');
    expect(jobMap.get('ambient:evening-summary')).toBe('0 20 * * *');
  });

  it('should not start if disabled', () => {
    const disabled = createMockDeps({ config: { enabled: false } });
    const s = new AmbientScheduler(disabled);
    s.start();
    expect(disabled._scheduler.schedule).not.toHaveBeenCalled();
    expect(s.isRunning()).toBe(false);
  });

  it('should not start twice', () => {
    scheduler.start();
    scheduler.start();
    expect(deps._scheduler.schedule).toHaveBeenCalledTimes(4);
  });

  it('should stop all jobs', () => {
    scheduler.start();
    scheduler.stop();
    expect(deps._scheduler.stop).toHaveBeenCalledTimes(4);
    expect(scheduler.isRunning()).toBe(false);
  });

  it('should return config', () => {
    const config = scheduler.getConfig();
    expect(config.morningCron).toBe(DEFAULT_AMBIENT_SCHEDULER_CONFIG.morningCron);
    expect(config.enabled).toBe(true);
  });

  it('should poll triggers when email poll fires', () => {
    scheduler.start();
    const emailPoll = deps._scheduler._jobs.get('ambient:email-poll');
    emailPoll!.callback();
    expect(deps.triggerManager.pollAll).toHaveBeenCalled();
  });

  it('should generate and deliver morning briefing', async () => {
    scheduler.start();
    await scheduler.generateAndDeliverBriefing('morning');
    expect(deps.deliveryChannel).toHaveBeenCalledTimes(1);
    const delivered = (deps.deliveryChannel as any).mock.calls[0][0] as string;
    expect(delivered).toContain('Good morning');
  });

  it('should generate and deliver evening briefing', async () => {
    scheduler.start();
    await scheduler.generateAndDeliverBriefing('evening');
    expect(deps.deliveryChannel).toHaveBeenCalledTimes(1);
    const delivered = (deps.deliveryChannel as any).mock.calls[0][0] as string;
    expect(delivered).toContain('evening summary');
  });

  it('should include calendar events when calendarIntelligence is available', async () => {
    const calDeps = createMockDeps({
      calendarIntelligence: {
        analyzeDay: vi.fn(async () => ({
          events: [{ title: 'Team standup', time: '10:00' }],
        })),
      },
    });
    const s = new AmbientScheduler(calDeps);
    await s.generateAndDeliverBriefing('morning');
    const delivered = (calDeps.deliveryChannel as any).mock.calls[0][0] as string;
    expect(delivered).toContain('Team standup');
  });

  it('should include email notifications when emailIntelligence is available', async () => {
    const emailDeps = createMockDeps({
      emailIntelligence: {
        triage: {
          getTriageSummary: vi.fn(async () => ({
            items: [{ subject: 'Urgent: server down', priority: 'urgent' }],
          })),
        },
      },
    });
    const s = new AmbientScheduler(emailDeps);
    await s.generateAndDeliverBriefing('morning');
    const delivered = (emailDeps.deliveryChannel as any).mock.calls[0][0] as string;
    expect(delivered).toContain('Urgent: server down');
  });

  it('should handle calendar fetch errors gracefully', async () => {
    const errorDeps = createMockDeps({
      calendarIntelligence: {
        analyzeDay: vi.fn(async () => { throw new Error('API error'); }),
      },
    });
    const s = new AmbientScheduler(errorDeps);
    await expect(s.generateAndDeliverBriefing('morning')).resolves.toBeUndefined();
    expect(errorDeps.deliveryChannel).toHaveBeenCalled();
  });

  it('should handle email fetch errors gracefully', async () => {
    const errorDeps = createMockDeps({
      emailIntelligence: {
        triage: {
          getTriageSummary: vi.fn(async () => { throw new Error('API error'); }),
        },
      },
    });
    const s = new AmbientScheduler(errorDeps);
    await expect(s.generateAndDeliverBriefing('morning')).resolves.toBeUndefined();
    expect(errorDeps.deliveryChannel).toHaveBeenCalled();
  });
});

describe('formatBriefingAsText', () => {
  it('should format a morning briefing', () => {
    const briefing: Briefing = {
      userId: 'user1',
      generatedAt: Date.now(),
      timeOfDay: 'morning',
      sections: [
        { title: "Today's Schedule", items: ['10:00 - Standup', '12:00 - Lunch'] },
        { title: 'Active Tasks', items: ['Review PR (in-progress)'] },
      ],
    };
    const text = formatBriefingAsText(briefing);
    expect(text).toContain('Good morning');
    expect(text).toContain("Today's Schedule");
    expect(text).toContain('  10:00 - Standup');
    expect(text).toContain('  12:00 - Lunch');
    expect(text).toContain('Active Tasks');
    expect(text).toContain('  Review PR (in-progress)');
  });

  it('should format an evening briefing', () => {
    const briefing: Briefing = {
      userId: 'user1',
      generatedAt: Date.now(),
      timeOfDay: 'evening',
      sections: [{ title: "Tomorrow's Schedule", items: ['09:00 - Sprint planning'] }],
    };
    const text = formatBriefingAsText(briefing);
    expect(text).toContain('evening summary');
    expect(text).toContain("Tomorrow's Schedule");
  });

  it('should format a custom briefing', () => {
    const briefing: Briefing = {
      userId: 'user1',
      generatedAt: Date.now(),
      timeOfDay: 'custom',
      sections: [{ title: 'Updates', items: ['Item 1'] }],
    };
    const text = formatBriefingAsText(briefing);
    expect(text).toContain('Here\'s your briefing:');
  });

  it('should handle empty sections', () => {
    const briefing: Briefing = {
      userId: 'user1',
      generatedAt: Date.now(),
      timeOfDay: 'morning',
      sections: [],
    };
    const text = formatBriefingAsText(briefing);
    expect(text).toContain('No updates right now');
  });
});
