import { describe, it, expect } from 'vitest';
import { IntentParser } from '../src/intent-parser.js';

describe('IntentParser', () => {
  const parser = new IntentParser();

  describe('schedule triggers', () => {
    it('parses "every morning at 9am" as a schedule', () => {
      const result = parser.parse('Every morning at 9am, give me a weather briefing');
      expect(result.success).toBe(true);
      expect(result.spec!.trigger.type).toBe('schedule');
      expect(result.spec!.trigger.schedule!.cron).toBe('0 9 * * *');
      expect(result.spec!.actions).toHaveLength(1);
      expect(result.spec!.actions[0]!.tool).toBe('briefing');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('parses "every day at 3pm" with PM conversion', () => {
      const result = parser.parse('Every day at 3pm send me a notification');
      expect(result.success).toBe(true);
      expect(result.spec!.trigger.schedule!.cron).toBe('0 15 * * *');
    });

    it('parses "every 5 minutes"', () => {
      const result = parser.parse('Every 5 minutes check for new issues');
      expect(result.success).toBe(true);
      expect(result.spec!.trigger.schedule!.cron).toBe('*/5 * * * *');
    });

    it('parses "hourly"', () => {
      const result = parser.parse('Hourly notify me of updates');
      expect(result.success).toBe(true);
      expect(result.spec!.trigger.schedule!.cron).toBe('0 * * * *');
    });

    it('parses "every Monday"', () => {
      const result = parser.parse('Every Monday create a task for weekly review');
      expect(result.success).toBe(true);
      expect(result.spec!.trigger.schedule!.cron).toBe('0 9 * * 1');
    });

    it('parses "every 2 hours"', () => {
      const result = parser.parse('Every 2 hours check GitHub PRs and notify me of new ones');
      expect(result.success).toBe(true);
      expect(result.spec!.trigger.schedule!.cron).toBe('0 */2 * * *');
      expect(result.spec!.actions.some((a) => a.tool === 'check-prs')).toBe(true);
    });
  });

  describe('event triggers', () => {
    it('parses email event with multiple actions', () => {
      const result = parser.parse(
        'When I get an email from my boss, summarize it and send me a Slack notification',
      );
      expect(result.success).toBe(true);
      expect(result.spec!.trigger.type).toBe('event');
      expect(result.spec!.trigger.source).toBe('google-workspace');
      expect(result.spec!.trigger.event).toBe('email.received');
      expect(result.spec!.actions).toHaveLength(2);
      expect(result.spec!.actions[0]!.tool).toBe('summarize');
      expect(result.spec!.actions[1]!.tool).toBe('send-notification');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('parses PR opened event', () => {
      const result = parser.parse('When a PR is opened, send me a notification');
      expect(result.success).toBe(true);
      expect(result.spec!.trigger.source).toBe('github');
      expect(result.spec!.trigger.event).toBe('pull_request.opened');
    });

    it('parses mention event', () => {
      const result = parser.parse('When someone mentions me, reply with a summary');
      expect(result.success).toBe(true);
      expect(result.spec!.trigger.source).toBe('slack');
      expect(result.spec!.trigger.event).toBe('mention');
    });
  });

  describe('condition triggers', () => {
    it('parses condition-based monitoring', () => {
      const result = parser.parse('Check if the server is down and notify me');
      expect(result.success).toBe(true);
      expect(result.spec!.trigger.type).toBe('condition');
      expect(result.spec!.trigger.condition).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('returns low confidence for gibberish', () => {
      const result = parser.parse('asdfghjkl qwerty zxcvbn');
      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('returns error for empty input', () => {
      const result = parser.parse('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty input');
      expect(result.confidence).toBe(0);
    });

    it('handles action-only input with partial result', () => {
      const result = parser.parse('Summarize it please');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Could not identify a trigger');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.spec!.actions).toHaveLength(1);
    });

    it('generates a name from input', () => {
      const result = parser.parse('Every day at 9am send me a notification');
      expect(result.spec!.name).toMatch(/^[a-z0-9-]+$/);
    });

    it('sets enabled to true by default', () => {
      const result = parser.parse('Hourly notify me');
      expect(result.spec!.enabled).toBe(true);
    });
  });
});
