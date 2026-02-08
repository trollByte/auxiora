import { describe, it, expect, beforeEach } from 'vitest';
import { AmbientPatternEngine } from '../src/pattern-engine.js';
import { AnticipationEngine } from '../src/anticipation.js';
import { BriefingGenerator } from '../src/briefing.js';
import { QuietNotificationManager } from '../src/notification.js';
import type { AmbientPattern } from '../src/types.js';

describe('AmbientPatternEngine', () => {
  let engine: AmbientPatternEngine;

  beforeEach(() => {
    engine = new AmbientPatternEngine();
  });

  it('should start with no events', () => {
    expect(engine.getEventCount()).toBe(0);
    expect(engine.getPatterns()).toHaveLength(0);
  });

  it('should observe events', () => {
    engine.observe({ type: 'coffee', timestamp: Date.now() });
    engine.observe({ type: 'coffee', timestamp: Date.now() });
    expect(engine.getEventCount()).toBe(2);
  });

  it('should detect schedule patterns from repeated events at same hour', () => {
    const now = Date.now();
    const hour = new Date(now).getHours();

    // Create events at same hour across multiple days
    for (let i = 0; i < 5; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(hour, 0, 0, 0);
      engine.observe({ type: 'standup', timestamp: d.getTime() });
    }

    const patterns = engine.detectPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    const schedule = patterns.find(p => p.type === 'schedule');
    expect(schedule).toBeDefined();
    expect(schedule!.description).toContain('standup');
  });

  it('should detect frequency patterns from regularly spaced events', () => {
    const now = Date.now();
    const interval = 2 * 60 * 60 * 1000; // 2 hours

    for (let i = 0; i < 5; i++) {
      engine.observe({ type: 'check-email', timestamp: now - i * interval });
    }

    const patterns = engine.detectPatterns();
    const freq = patterns.find(p => p.type === 'preference');
    expect(freq).toBeDefined();
    expect(freq!.description).toContain('check-email');
    expect(freq!.description).toContain('hours');
  });

  it('should detect correlations between event types', () => {
    const now = Date.now();

    // A always followed by B within 5 minutes
    for (let i = 0; i < 3; i++) {
      const base = now - i * 60 * 60 * 1000;
      engine.observe({ type: 'open-slack', timestamp: base });
      engine.observe({ type: 'check-calendar', timestamp: base + 2 * 60 * 1000 });
    }

    const patterns = engine.detectPatterns();
    const correlation = patterns.find(p => p.type === 'correlation');
    expect(correlation).toBeDefined();
    expect(correlation!.description).toContain('follows');
  });

  it('should prune events outside window', () => {
    // Use a tiny window (1 second)
    const shortEngine = new AmbientPatternEngine(1000);
    shortEngine.observe({ type: 'old', timestamp: Date.now() - 5000 });
    shortEngine.observe({ type: 'new', timestamp: Date.now() });
    // Prune happens on next observe
    shortEngine.observe({ type: 'new2', timestamp: Date.now() });
    expect(shortEngine.getEventCount()).toBe(2); // 'old' pruned
  });

  it('should reset state', () => {
    engine.observe({ type: 'test', timestamp: Date.now() });
    engine.reset();
    expect(engine.getEventCount()).toBe(0);
    expect(engine.getPatterns()).toHaveLength(0);
  });
});

describe('AnticipationEngine', () => {
  let anticipation: AnticipationEngine;

  beforeEach(() => {
    anticipation = new AnticipationEngine();
  });

  it('should generate anticipations from schedule patterns', () => {
    const pattern: AmbientPattern = {
      id: 'p1',
      type: 'schedule',
      description: '"standup" events frequently occur around 10:00',
      confidence: 0.8,
      evidence: [],
      detectedAt: Date.now(),
      lastConfirmedAt: Date.now(),
      occurrences: 5,
    };

    const results = anticipation.generateAnticipations([pattern]);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].sourcePatterns).toContain('p1');
    expect(results[0].expectedAt).toBeGreaterThan(Date.now());
  });

  it('should generate anticipations from preference patterns', () => {
    const pattern: AmbientPattern = {
      id: 'p2',
      type: 'preference',
      description: '"email" occurs roughly every 2.5 hours',
      confidence: 0.7,
      evidence: [],
      detectedAt: Date.now(),
      lastConfirmedAt: Date.now(),
      occurrences: 4,
    };

    const results = anticipation.generateAnticipations([pattern]);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].expectedAt).toBeGreaterThan(Date.now());
  });

  it('should skip low-confidence patterns', () => {
    const pattern: AmbientPattern = {
      id: 'p3',
      type: 'schedule',
      description: '"rare" around 14:00',
      confidence: 0.2,
      evidence: [],
      detectedAt: Date.now(),
      lastConfirmedAt: Date.now(),
      occurrences: 1,
    };

    const results = anticipation.generateAnticipations([pattern]);
    expect(results).toHaveLength(0);
  });

  it('should prune expired anticipations', () => {
    const pattern: AmbientPattern = {
      id: 'p4',
      type: 'correlation',
      description: '"B" often follows "A" within 5 minutes',
      confidence: 0.8,
      evidence: [],
      detectedAt: Date.now(),
      lastConfirmedAt: Date.now(),
      occurrences: 3,
    };

    // Generate with a past time so anticipations expire immediately
    anticipation.generateAnticipations([pattern], { currentTime: Date.now() - 10 * 60 * 1000 });
    const pruned = anticipation.prune();
    expect(pruned).toBeGreaterThanOrEqual(1);
  });

  it('should reset', () => {
    const pattern: AmbientPattern = {
      id: 'p5',
      type: 'trigger',
      description: 'trigger detected',
      confidence: 0.9,
      evidence: [],
      detectedAt: Date.now(),
      lastConfirmedAt: Date.now(),
      occurrences: 1,
    };
    anticipation.generateAnticipations([pattern]);
    anticipation.reset();
    expect(anticipation.getAnticipations()).toHaveLength(0);
  });
});

describe('BriefingGenerator', () => {
  let generator: BriefingGenerator;

  beforeEach(() => {
    generator = new BriefingGenerator();
  });

  it('should generate a morning briefing with sections', () => {
    const briefing = generator.generateBriefing('user1', 'morning', {
      notifications: [
        { id: 'n1', priority: 'nudge', message: 'New email', createdAt: Date.now(), dismissed: false, source: 'email' },
      ],
      calendarEvents: [
        { title: 'Team standup', time: '10:00' },
        { title: 'Lunch', time: '12:00' },
      ],
      tasks: [
        { title: 'Review PR', status: 'in-progress' },
      ],
    });

    expect(briefing.userId).toBe('user1');
    expect(briefing.timeOfDay).toBe('morning');
    expect(briefing.sections.length).toBeGreaterThan(0);

    const calendarSection = briefing.sections.find(s => s.title.includes('Schedule'));
    expect(calendarSection).toBeDefined();
    expect(calendarSection!.items).toHaveLength(2);
  });

  it('should include patterns section when patterns are available', () => {
    const briefing = generator.generateBriefing('user1', 'evening', {
      patterns: [
        {
          id: 'p1',
          type: 'schedule',
          description: 'Standup at 10:00',
          confidence: 0.8,
          evidence: [],
          detectedAt: Date.now(),
          lastConfirmedAt: Date.now(),
          occurrences: 5,
        },
      ],
    });

    const patternsSection = briefing.sections.find(s => s.title === 'Observed Patterns');
    expect(patternsSection).toBeDefined();
  });

  it('should filter dismissed notifications', () => {
    const briefing = generator.generateBriefing('user1', 'morning', {
      notifications: [
        { id: 'n1', priority: 'nudge', message: 'Old', createdAt: Date.now(), dismissed: true, source: 'test' },
      ],
    });

    const notifSection = briefing.sections.find(s => s.title === 'Notifications');
    expect(notifSection).toBeUndefined();
  });

  it('should respect maxItemsPerSection', () => {
    const generator2 = new BriefingGenerator({ maxItemsPerSection: 2 });
    const briefing = generator2.generateBriefing('user1', 'morning', {
      calendarEvents: [
        { title: 'Event 1', time: '09:00' },
        { title: 'Event 2', time: '10:00' },
        { title: 'Event 3', time: '11:00' },
      ],
    });

    const calSection = briefing.sections.find(s => s.title.includes('Schedule'));
    expect(calSection!.items).toHaveLength(2);
  });

  it('should return config', () => {
    const config = generator.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.morningTime).toBe('08:00');
  });
});

describe('QuietNotificationManager', () => {
  let manager: QuietNotificationManager;

  beforeEach(() => {
    manager = new QuietNotificationManager();
  });

  it('should create notifications', () => {
    const n = manager.notify('nudge', 'Test message');
    expect(n.id).toBeDefined();
    expect(n.priority).toBe('nudge');
    expect(n.message).toBe('Test message');
    expect(n.dismissed).toBe(false);
  });

  it('should queue notifications by priority', () => {
    manager.notify('whisper', 'Low');
    manager.notify('alert', 'High');
    manager.notify('nudge', 'Medium');

    const queue = manager.getQueue();
    expect(queue[0].priority).toBe('alert');
    expect(queue[1].priority).toBe('nudge');
    expect(queue[2].priority).toBe('whisper');
  });

  it('should dismiss a notification', () => {
    const n = manager.notify('nudge', 'Dismiss me');
    expect(manager.dismiss(n.id)).toBe(true);
    expect(manager.getQueue()).toHaveLength(0);
  });

  it('should return false for unknown dismiss', () => {
    expect(manager.dismiss('nonexistent')).toBe(false);
  });

  it('should dismiss all', () => {
    manager.notify('whisper', 'A');
    manager.notify('nudge', 'B');
    const count = manager.dismissAll();
    expect(count).toBe(2);
    expect(manager.getQueue()).toHaveLength(0);
  });

  it('should filter by priority', () => {
    manager.notify('whisper', 'A');
    manager.notify('alert', 'B');
    manager.notify('whisper', 'C');

    const whispers = manager.getByPriority('whisper');
    expect(whispers).toHaveLength(2);
  });

  it('should get notification by ID', () => {
    const n = manager.notify('alert', 'Important');
    const fetched = manager.get(n.id);
    expect(fetched).toBeDefined();
    expect(fetched!.message).toBe('Important');
  });

  it('should count pending notifications', () => {
    manager.notify('whisper', 'A');
    manager.notify('nudge', 'B');
    expect(manager.getPendingCount()).toBe(2);

    const n = manager.notify('alert', 'C');
    manager.dismiss(n.id);
    expect(manager.getPendingCount()).toBe(2);
  });

  it('should prune old dismissed notifications', () => {
    const n = manager.notify('whisper', 'Old');
    manager.dismiss(n.id);
    // Manually set createdAt to old
    const notification = manager.get(n.id)!;
    (notification as any).createdAt = Date.now() - 48 * 60 * 60 * 1000;

    const pruned = manager.prune();
    expect(pruned).toBe(1);
    expect(manager.get(n.id)).toBeUndefined();
  });

  it('should clear all', () => {
    manager.notify('alert', 'A');
    manager.notify('nudge', 'B');
    manager.clear();
    expect(manager.getPendingCount()).toBe(0);
  });

  it('should include source and detail', () => {
    const n = manager.notify('nudge', 'Msg', { source: 'calendar', detail: 'Extra info' });
    expect(n.source).toBe('calendar');
    expect(n.detail).toBe('Extra info');
  });
});
