import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AmbientScheduler, DEFAULT_AMBIENT_SCHEDULER_CONFIG } from '../src/scheduler.js';
import { BriefingGenerator, formatBriefingAsText } from '../src/briefing.js';
import type { AmbientSchedulerDeps } from '../src/scheduler.js';
import type { Briefing } from '../src/briefing.js';

function createMockScheduler() {
  const jobs = new Map<string, { cron: string; callback: () => void }>();
  return {
    schedule: vi.fn((id: string, cron: string, callback: () => void, _timezone?: string) => {
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

  it('should schedule 5 cron jobs on start', () => {
    scheduler.start();
    expect(deps._scheduler.schedule).toHaveBeenCalledTimes(5);
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
    expect(jobMap.get('ambient:notification-poll')).toBe('*/1 * * * *');
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
    expect(deps._scheduler.schedule).toHaveBeenCalledTimes(5);
  });

  it('should stop all jobs', () => {
    scheduler.start();
    scheduler.stop();
    expect(deps._scheduler.stop).toHaveBeenCalledTimes(5);
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

  it('should generate and deliver morning briefing when data exists', async () => {
    const calDeps = createMockDeps({
      calendarIntelligence: {
        analyzeDay: vi.fn(async () => ({
          events: [{ title: 'Standup', time: '10:00' }],
        })),
      },
    });
    const s = new AmbientScheduler(calDeps);
    await s.generateAndDeliverBriefing('morning');
    expect(calDeps.deliveryChannel).toHaveBeenCalledTimes(1);
    const delivered = (calDeps.deliveryChannel as any).mock.calls[0][0] as string;
    expect(delivered).toContain('Good morning');
  });

  it('should generate and deliver evening briefing when data exists', async () => {
    const calDeps = createMockDeps({
      calendarIntelligence: {
        analyzeDay: vi.fn(async () => ({
          events: [{ title: 'Sprint planning', time: '09:00' }],
        })),
      },
    });
    const s = new AmbientScheduler(calDeps);
    await s.generateAndDeliverBriefing('evening');
    expect(calDeps.deliveryChannel).toHaveBeenCalledTimes(1);
    const delivered = (calDeps.deliveryChannel as any).mock.calls[0][0] as string;
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
    // No data means no delivery (empty briefing suppressed)
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
  });

  it('should not deliver briefing when there are no sections', async () => {
    // Default deps have no data sources, so briefing will have 0 sections
    await scheduler.generateAndDeliverBriefing('morning');
    expect(deps.deliveryChannel).not.toHaveBeenCalled();
  });

  it('should pass timezone to scheduler.schedule', () => {
    const tzDeps = createMockDeps({
      config: { timezone: 'America/Los_Angeles' },
    });
    const s = new AmbientScheduler(tzDeps);
    s.start();
    const calls = tzDeps._scheduler.schedule.mock.calls;
    // Every job should receive the timezone as the 4th argument
    for (const call of calls) {
      expect(call[3]).toBe('America/Los_Angeles');
    }
  });

  it('should not pass timezone when not configured', () => {
    scheduler.start();
    const calls = deps._scheduler.schedule.mock.calls;
    for (const call of calls) {
      expect(call[3]).toBeUndefined();
    }
  });

  it('should schedule notification poll job on start', () => {
    scheduler.start();
    const jobs = Array.from(deps._scheduler._jobs.keys());
    expect(jobs).toContain('ambient:notification-poll');
  });

  it('should stop notification poll job on stop', () => {
    scheduler.start();
    scheduler.stop();
    expect(deps._scheduler.stop).toHaveBeenCalledWith('ambient:notification-poll');
  });

  it('should call triggerManager.pollAll and orchestrator when notification poll fires', async () => {
    const mockOrchestrator = {
      processTriggerEvents: vi.fn(),
      processCalendarCheck: vi.fn(),
      getPending: vi.fn(() => []),
      dismiss: vi.fn(),
    };
    const orchDeps = createMockDeps({
      notificationOrchestrator: mockOrchestrator as any,
    });
    (orchDeps.triggerManager.pollAll as any).mockResolvedValue([
      { triggerId: 'new-email', connectorId: 'email', data: { subject: 'Test' }, timestamp: Date.now() },
    ]);
    const s = new AmbientScheduler(orchDeps);
    s.start();

    const pollJob = orchDeps._scheduler._jobs.get('ambient:notification-poll');
    pollJob!.callback();

    // Wait for async pollAndNotify to complete
    await vi.waitFor(() => {
      expect(orchDeps.triggerManager.pollAll).toHaveBeenCalled();
      expect(mockOrchestrator.processTriggerEvents).toHaveBeenCalledWith([
        expect.objectContaining({ triggerId: 'new-email' }),
      ]);
    });
  });

  it('should not call orchestrator when no events are returned', async () => {
    const mockOrchestrator = {
      processTriggerEvents: vi.fn(),
      processCalendarCheck: vi.fn(),
      getPending: vi.fn(() => []),
      dismiss: vi.fn(),
    };
    const orchDeps = createMockDeps({
      notificationOrchestrator: mockOrchestrator as any,
    });
    (orchDeps.triggerManager.pollAll as any).mockResolvedValue([]);
    const s = new AmbientScheduler(orchDeps);
    s.start();

    const pollJob = orchDeps._scheduler._jobs.get('ambient:notification-poll');
    pollJob!.callback();

    await vi.waitFor(() => {
      expect(orchDeps.triggerManager.pollAll).toHaveBeenCalled();
    });
    expect(mockOrchestrator.processTriggerEvents).not.toHaveBeenCalled();
  });

  it('should skip notification polling when orchestrator is not provided', async () => {
    scheduler.start();
    const pollJob = deps._scheduler._jobs.get('ambient:notification-poll');
    pollJob!.callback();
    // Should not throw; pollAll should not be called since orchestrator is absent
    await vi.waitFor(() => {
      expect(deps.triggerManager.pollAll).not.toHaveBeenCalled();
    });
  });

  describe('consciousness data wiring', () => {
    it('should include active decisions as tasks in briefing', async () => {
      const decisionDeps = createMockDeps({
        decisionLog: {
          query: vi.fn(() => [
            { summary: 'Use PostgreSQL for persistence', domain: 'architecture', status: 'active' },
            { summary: 'Add rate limiting', domain: 'security', status: 'active' },
          ]),
          getDueFollowUps: vi.fn(() => []),
        },
      });
      const s = new AmbientScheduler(decisionDeps);
      await s.generateAndDeliverBriefing('evening');
      const delivered = (decisionDeps.deliveryChannel as any).mock.calls[0][0] as string;
      expect(delivered).toContain('Use PostgreSQL for persistence');
      expect(delivered).toContain('Add rate limiting');
      expect(delivered).toContain('Active Tasks');
    });

    it('should include due follow-ups as tasks', async () => {
      const decisionDeps = createMockDeps({
        decisionLog: {
          query: vi.fn(() => []),
          getDueFollowUps: vi.fn(() => [
            { summary: 'Review caching strategy', followUpDate: Date.now() - 86_400_000 },
          ]),
        },
      });
      const s = new AmbientScheduler(decisionDeps);
      await s.generateAndDeliverBriefing('morning');
      const delivered = (decisionDeps.deliveryChannel as any).mock.calls[0][0] as string;
      expect(delivered).toContain('Follow up: Review caching strategy');
    });

    it('should include health anomalies as notifications', async () => {
      const healthDeps = createMockDeps({
        consciousnessMonitor: {
          getPulse: vi.fn(() => ({
            overall: 'degraded',
            anomalies: [
              { subsystem: 'memory', description: 'High memory usage', severity: 'medium' },
            ],
          })),
        },
      });
      const s = new AmbientScheduler(healthDeps);
      await s.generateAndDeliverBriefing('evening');
      const delivered = (healthDeps.deliveryChannel as any).mock.calls[0][0] as string;
      expect(delivered).toContain('System health is degraded');
      expect(delivered).toContain('memory: High memory usage');
    });

    it('should not include health notification when system is healthy', async () => {
      const healthDeps = createMockDeps({
        consciousnessMonitor: {
          getPulse: vi.fn(() => ({
            overall: 'healthy',
            anomalies: [],
          })),
        },
      });
      const s = new AmbientScheduler(healthDeps);
      await s.generateAndDeliverBriefing('morning');
      // Healthy system + no other data = empty briefing = no delivery
      expect(healthDeps.deliveryChannel).not.toHaveBeenCalled();
    });

    it('should include satisfaction trend as observed pattern', async () => {
      const feedbackDeps = createMockDeps({
        feedbackStore: {
          getInsights: vi.fn(() => ({
            trend: 'improving',
            weakDomains: ['sales_pitch'],
            totalFeedback: 42,
          })),
        },
      });
      const s = new AmbientScheduler(feedbackDeps);
      await s.generateAndDeliverBriefing('evening');
      const delivered = (feedbackDeps.deliveryChannel as any).mock.calls[0][0] as string;
      expect(delivered).toContain('User satisfaction is improving');
      expect(delivered).toContain('Observed Patterns');
    });

    it('should not include satisfaction pattern when no feedback exists', async () => {
      const feedbackDeps = createMockDeps({
        feedbackStore: {
          getInsights: vi.fn(() => ({
            trend: 'stable',
            weakDomains: [],
            totalFeedback: 0,
          })),
        },
      });
      const s = new AmbientScheduler(feedbackDeps);
      await s.generateAndDeliverBriefing('morning');
      // No feedback + no other data = empty briefing = no delivery
      expect(feedbackDeps.deliveryChannel).not.toHaveBeenCalled();
    });

    it('should handle decisionLog errors gracefully', async () => {
      const errorDeps = createMockDeps({
        decisionLog: {
          query: vi.fn(() => { throw new Error('DB error'); }),
          getDueFollowUps: vi.fn(() => []),
        },
      });
      const s = new AmbientScheduler(errorDeps);
      await expect(s.generateAndDeliverBriefing('morning')).resolves.toBeUndefined();
      // Error swallowed, no crash — but also no delivery since no sections
    });

    it('should handle consciousnessMonitor errors gracefully', async () => {
      const errorDeps = createMockDeps({
        consciousnessMonitor: {
          getPulse: vi.fn(() => { throw new Error('Monitor error'); }),
        },
      });
      const s = new AmbientScheduler(errorDeps);
      await expect(s.generateAndDeliverBriefing('evening')).resolves.toBeUndefined();
    });

    it('should handle feedbackStore errors gracefully', async () => {
      const errorDeps = createMockDeps({
        feedbackStore: {
          getInsights: vi.fn(() => { throw new Error('Store error'); }),
        },
      });
      const s = new AmbientScheduler(errorDeps);
      await expect(s.generateAndDeliverBriefing('morning')).resolves.toBeUndefined();
    });

    it('should combine all data sources in a single briefing', async () => {
      const allDeps = createMockDeps({
        calendarIntelligence: {
          analyzeDay: vi.fn(async () => ({
            events: [{ title: 'Team standup', time: '10:00' }],
          })),
        },
        decisionLog: {
          query: vi.fn(() => [
            { summary: 'Migrate to Redis', domain: 'infra', status: 'active' },
          ]),
          getDueFollowUps: vi.fn(() => []),
        },
        consciousnessMonitor: {
          getPulse: vi.fn(() => ({
            overall: 'degraded',
            anomalies: [
              { subsystem: 'providers', description: 'Slow response times', severity: 'medium' },
            ],
          })),
        },
        feedbackStore: {
          getInsights: vi.fn(() => ({
            trend: 'improving',
            weakDomains: [],
            totalFeedback: 15,
          })),
        },
      });
      const s = new AmbientScheduler(allDeps);
      await s.generateAndDeliverBriefing('morning');
      const delivered = (allDeps.deliveryChannel as any).mock.calls[0][0] as string;
      expect(delivered).toContain('Team standup');
      expect(delivered).toContain('Migrate to Redis');
      expect(delivered).toContain('System health is degraded');
      expect(delivered).toContain('User satisfaction is improving');
    });
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
