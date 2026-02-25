import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { IntentParser, AutomationBuilder } from '@auxiora/nl-automation';
import { Router } from 'express';

function createAutomationRouter(parser: IntentParser, builder: AutomationBuilder) {
  const router = Router();

  router.post('/parse', (req: any, res: any) => {
    const { input } = req.body;
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: 'input required' });
    }
    const spec = parser.parse(input);
    res.json({ spec });
  });

  router.post('/build', (req: any, res: any) => {
    const { spec } = req.body;
    if (!spec || typeof spec !== 'object') {
      return res.status(400).json({ error: 'spec required' });
    }
    try {
      const behavior = builder.build(spec);
      res.json({ behavior });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/validate', (req: any, res: any) => {
    const { spec } = req.body;
    if (!spec || typeof spec !== 'object') {
      return res.status(400).json({ error: 'spec required' });
    }
    const result = builder.validate(spec, [], []);
    res.json({ result });
  });

  return router;
}

describe('Automation REST API', () => {
  let app: express.Express;
  let parser: IntentParser;
  let builder: AutomationBuilder;

  beforeEach(() => {
    parser = new IntentParser();
    builder = new AutomationBuilder();
    app = express();
    app.use(express.json());
    app.use('/api/v1/automation', createAutomationRouter(parser, builder));
  });

  describe('POST /parse', () => {
    it('parses a schedule-based automation', async () => {
      const res = await request(app)
        .post('/api/v1/automation/parse')
        .send({ input: 'every morning at 9 send me a briefing' });
      expect(res.status).toBe(200);
      expect(res.body.spec).toBeDefined();
      expect(res.body.spec.success).toBe(true);
      expect(res.body.spec.spec).toBeDefined();
      expect(res.body.spec.spec.trigger.type).toBe('schedule');
    });

    it('parses an event-based automation', async () => {
      const res = await request(app)
        .post('/api/v1/automation/parse')
        .send({ input: 'when I receive an email summarize it' });
      expect(res.status).toBe(200);
      expect(res.body.spec.success).toBe(true);
      expect(res.body.spec.spec.trigger.type).toBe('event');
    });

    it('returns 400 when input is missing', async () => {
      const res = await request(app)
        .post('/api/v1/automation/parse')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('input required');
    });

    it('returns 400 when input is not a string', async () => {
      const res = await request(app)
        .post('/api/v1/automation/parse')
        .send({ input: 42 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('input required');
    });

    it('returns a failed parse for unrecognized input', async () => {
      const res = await request(app)
        .post('/api/v1/automation/parse')
        .send({ input: 'hello world' });
      expect(res.status).toBe(200);
      expect(res.body.spec.success).toBe(false);
    });
  });

  describe('POST /build', () => {
    it('builds a scheduled behavior config', async () => {
      const spec = {
        name: 'morning-briefing',
        description: 'Every morning send briefing',
        trigger: { type: 'schedule', schedule: { cron: '0 9 * * *' } },
        actions: [{ tool: 'briefing', params: {}, description: 'Generate a briefing' }],
        enabled: true,
      };
      const res = await request(app)
        .post('/api/v1/automation/build')
        .send({ spec });
      expect(res.status).toBe(200);
      expect(res.body.behavior).toBeDefined();
      expect(res.body.behavior.type).toBe('scheduled');
      expect(res.body.behavior.schedule.cron).toBe('0 9 * * *');
    });

    it('builds a monitor behavior config for event trigger', async () => {
      const spec = {
        name: 'email-summary',
        description: 'Summarize emails',
        trigger: { type: 'event', source: 'google-workspace', event: 'email.received' },
        actions: [{ tool: 'summarize', params: {}, description: 'Summarize' }],
        enabled: true,
      };
      const res = await request(app)
        .post('/api/v1/automation/build')
        .send({ spec });
      expect(res.status).toBe(200);
      expect(res.body.behavior.type).toBe('monitor');
    });

    it('returns 400 when spec is missing', async () => {
      const res = await request(app)
        .post('/api/v1/automation/build')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('spec required');
    });
  });

  describe('POST /validate', () => {
    it('validates a spec with empty tools/connectors', async () => {
      const spec = {
        name: 'test-automation',
        description: 'Test',
        trigger: { type: 'schedule', schedule: { cron: '0 9 * * *' } },
        actions: [{ tool: 'briefing', params: {}, description: 'Briefing' }],
        enabled: true,
      };
      const res = await request(app)
        .post('/api/v1/automation/validate')
        .send({ spec });
      expect(res.status).toBe(200);
      expect(res.body.result).toBeDefined();
      expect(res.body.result.valid).toBe(false);
      expect(res.body.result.errors).toContain('Unknown tool: briefing');
    });

    it('reports missing name', async () => {
      const spec = {
        name: '',
        description: 'Test',
        trigger: { type: 'schedule', schedule: { cron: '0 9 * * *' } },
        actions: [{ tool: 'briefing', params: {}, description: 'Briefing' }],
        enabled: true,
      };
      const res = await request(app)
        .post('/api/v1/automation/validate')
        .send({ spec });
      expect(res.status).toBe(200);
      expect(res.body.result.errors).toContain('Automation name is required');
    });

    it('returns 400 when spec is missing', async () => {
      const res = await request(app)
        .post('/api/v1/automation/validate')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('spec required');
    });
  });
});
