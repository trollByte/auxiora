import { describe, it, expect } from 'vitest';

import { plugin as dailySummary } from '../starter-skills/daily-summary.js';
import { plugin as smartReply } from '../starter-skills/smart-reply.js';
import { plugin as noteTaker } from '../starter-skills/note-taker.js';

describe('starter skills', () => {
  describe('daily-summary', () => {
    it('exports valid plugin manifest', async () => {
      expect(dailySummary.name).toBe('daily-summary');
      expect(dailySummary.version).toBe('1.0.0');
      expect(dailySummary.permissions).toEqual([]);
      expect(dailySummary.tools).toHaveLength(1);
      expect(dailySummary.tools[0].name).toBe('daily_summary');
    });

    it('execute returns markdown summary', async () => {
      const result = await dailySummary.tools[0].execute({});
      expect(result.success).toBe(true);
      expect(result.output).toContain('# Daily Summary');
      expect(result.output).toContain('## Calendar');
      expect(result.output).toContain('## Email');
      expect(result.output).toContain('## Tasks');
      expect(result.output).toContain('_Generated:');
    });

    it('filters sections via include param', async () => {
      const result = await dailySummary.tools[0].execute({ include: 'email' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('## Email');
      expect(result.output).not.toContain('## Calendar');
      expect(result.output).not.toContain('## Tasks');
    });
  });

  describe('smart-reply', () => {
    it('exports valid plugin manifest', async () => {
      expect(smartReply.name).toBe('smart-reply');
      expect(smartReply.version).toBe('1.0.0');
      expect(smartReply.permissions).toEqual([]);
      expect(smartReply.tools).toHaveLength(1);
      expect(smartReply.tools[0].name).toBe('smart_reply');
    });

    it('execute returns 3 suggestions', async () => {
      const result = await smartReply.tools[0].execute({ message: 'Hello!' });
      expect(result.success).toBe(true);
      const lines = result.output!.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatch(/^1\. /);
      expect(lines[1]).toMatch(/^2\. /);
      expect(lines[2]).toMatch(/^3\. /);
    });

    it('respects tone parameter', async () => {
      const result = await smartReply.tools[0].execute({
        message: 'Can you review this?',
        tone: 'professional',
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Thank you');
    });
  });

  describe('note-taker', () => {
    it('exports valid plugin manifest', async () => {
      expect(noteTaker.name).toBe('note-taker');
      expect(noteTaker.version).toBe('1.0.0');
      expect(noteTaker.permissions).toEqual([]);
      expect(noteTaker.tools).toHaveLength(1);
      expect(noteTaker.tools[0].name).toBe('take_notes');
    });

    it('execute returns checklist by default', async () => {
      const result = await noteTaker.tools[0].execute({
        text: 'First item. Second item. Third item.',
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain('- [ ] First item.');
      expect(result.output).toContain('- [ ] Second item.');
      expect(result.output).toContain('- [ ] Third item.');
    });

    it('supports numbered format', async () => {
      const result = await noteTaker.tools[0].execute({
        text: 'Alpha sentence. Beta sentence.',
        format: 'numbered',
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain('1. Alpha sentence.');
      expect(result.output).toContain('2. Beta sentence.');
    });
  });
});
