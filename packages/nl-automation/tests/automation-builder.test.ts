import { describe, it, expect } from 'vitest';
import { AutomationBuilder } from '../src/automation-builder.js';
import type { AutomationSpec } from '../src/types.js';

describe('AutomationBuilder', () => {
  const builder = new AutomationBuilder();

  const scheduleSpec: AutomationSpec = {
    name: 'morning-briefing',
    description: 'Every morning at 9am, give me a weather briefing',
    trigger: { type: 'schedule', schedule: { cron: '0 9 * * *' } },
    actions: [{ tool: 'briefing', params: {}, description: 'Generate a briefing' }],
    enabled: true,
  };

  const eventSpec: AutomationSpec = {
    name: 'email-summary',
    description: 'When I get an email, summarize it',
    trigger: { type: 'event', source: 'google-workspace', event: 'email.received' },
    actions: [
      { tool: 'summarize', params: {}, description: 'Summarize the content' },
      { tool: 'send-notification', params: {}, description: 'Send a notification' },
    ],
    enabled: true,
  };

  const conditionSpec: AutomationSpec = {
    name: 'server-monitor',
    description: 'Check if the server is down',
    trigger: { type: 'condition', condition: 'server is down' },
    actions: [{ tool: 'send-notification', params: {}, description: 'Send a notification' }],
    enabled: true,
  };

  describe('build', () => {
    it('converts schedule spec to scheduled behavior', () => {
      const config = builder.build(scheduleSpec);
      expect(config.type).toBe('scheduled');
      expect(config.schedule).toEqual({ cron: '0 9 * * *', timezone: 'UTC' });
      expect(config.action).toContain('briefing');
    });

    it('converts event spec to monitor behavior', () => {
      const config = builder.build(eventSpec);
      expect(config.type).toBe('monitor');
      expect(config.polling).toBeDefined();
      expect(config.polling!.condition).toBe('google-workspace:email.received');
      expect(config.action).toContain('summarize');
      expect(config.action).toContain('send-notification');
    });

    it('converts condition spec to monitor behavior', () => {
      const config = builder.build(conditionSpec);
      expect(config.type).toBe('monitor');
      expect(config.polling!.condition).toBe('server is down');
    });

    it('uses default cron when schedule trigger has no cron', () => {
      const spec: AutomationSpec = {
        ...scheduleSpec,
        trigger: { type: 'schedule' },
      };
      const config = builder.build(spec);
      expect(config.schedule!.cron).toBe('0 9 * * *');
    });

    it('preserves timezone from spec', () => {
      const spec: AutomationSpec = {
        ...scheduleSpec,
        trigger: { type: 'schedule', schedule: { cron: '0 9 * * *', timezone: 'America/New_York' } },
      };
      const config = builder.build(spec);
      expect(config.schedule!.timezone).toBe('America/New_York');
    });
  });

  describe('validate', () => {
    const availableTools = ['briefing', 'summarize', 'send-notification'];
    const availableConnectors = ['google-workspace', 'github', 'slack'];

    it('validates a valid schedule spec', () => {
      const result = builder.validate(scheduleSpec, availableTools, availableConnectors);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates a valid event spec', () => {
      const result = builder.validate(eventSpec, availableTools, availableConnectors);
      expect(result.valid).toBe(true);
    });

    it('rejects unknown tools', () => {
      const spec: AutomationSpec = {
        ...scheduleSpec,
        actions: [{ tool: 'unknown-tool', params: {}, description: 'Unknown' }],
      };
      const result = builder.validate(spec, availableTools, availableConnectors);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown tool: unknown-tool');
    });

    it('rejects unknown connectors', () => {
      const spec: AutomationSpec = {
        ...eventSpec,
        trigger: { type: 'event', source: 'unknown-connector', event: 'test' },
      };
      const result = builder.validate(spec, availableTools, availableConnectors);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown connector: unknown-connector');
    });

    it('rejects empty name', () => {
      const spec: AutomationSpec = { ...scheduleSpec, name: '' };
      const result = builder.validate(spec, availableTools, availableConnectors);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Automation name is required');
    });

    it('rejects empty actions', () => {
      const spec: AutomationSpec = { ...scheduleSpec, actions: [] };
      const result = builder.validate(spec, availableTools, availableConnectors);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one action is required');
    });

    it('rejects schedule trigger without cron', () => {
      const spec: AutomationSpec = {
        ...scheduleSpec,
        trigger: { type: 'schedule' },
      };
      const result = builder.validate(spec, availableTools, availableConnectors);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Schedule trigger requires a cron expression');
    });

    it('rejects condition trigger without condition', () => {
      const spec: AutomationSpec = {
        ...conditionSpec,
        trigger: { type: 'condition' },
      };
      const result = builder.validate(spec, availableTools, availableConnectors);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Condition trigger requires a condition');
    });

    it('collects multiple errors', () => {
      const spec: AutomationSpec = {
        name: '',
        description: 'bad',
        trigger: { type: 'event', source: 'nope', event: 'x' },
        actions: [{ tool: 'nope', params: {}, description: 'x' }],
        enabled: true,
      };
      const result = builder.validate(spec, availableTools, availableConnectors);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
