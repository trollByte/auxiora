import { describe, it, expect } from 'vitest';

describe('starter skills batch 2', () => {
  describe('web-clipper', () => {
    it('exports valid plugin manifest', async () => {
      const { plugin } = await import('../starter-skills/web-clipper.js');

      expect(plugin.name).toBe('web-clipper');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.description).toBeTruthy();
      expect(plugin.tools).toHaveLength(1);
      expect(plugin.tools[0].name).toBe('clip_url');
      expect(plugin.tools[0].parameters.required).toContain('url');
    });

    it('execute clips a URL with title and tags', async () => {
      const { plugin } = await import('../starter-skills/web-clipper.js');
      const tool = plugin.tools[0];

      const result = await tool.execute({
        url: 'https://example.com',
        title: 'Example Site',
        tags: 'reference, test',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('[Example Site](https://example.com)');
      expect(result.output).toContain('**Saved**');
      expect(result.output).toContain('#reference');
      expect(result.output).toContain('#test');
    });

    it('uses URL as default title', async () => {
      const { plugin } = await import('../starter-skills/web-clipper.js');
      const tool = plugin.tools[0];

      const result = await tool.execute({ url: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(result.output).toContain(
        '[https://example.com](https://example.com)',
      );
      expect(result.output).not.toContain('**Tags**');
    });
  });

  describe('pomodoro', () => {
    it('exports valid plugin manifest', async () => {
      const { plugin } = await import('../starter-skills/pomodoro.js');

      expect(plugin.name).toBe('pomodoro');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.description).toBeTruthy();
      expect(plugin.tools).toHaveLength(1);
      expect(plugin.tools[0].name).toBe('pomodoro_timer');
    });

    it('start action returns timer info', async () => {
      const { plugin } = await import('../starter-skills/pomodoro.js');
      const tool = plugin.tools[0];

      const result = await tool.execute({ action: 'start', task: 'Write docs' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Pomodoro Started');
      expect(result.output).toContain('Write docs');
      expect(result.output).toContain('25 minutes');
      expect(result.output).toContain('Ends at');
    });

    it('complete action returns break reminder', async () => {
      const { plugin } = await import('../starter-skills/pomodoro.js');
      const tool = plugin.tools[0];

      const result = await tool.execute({ action: 'complete' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Pomodoro Complete');
      expect(result.output).toContain('Congratulations');
      expect(result.output).toContain('5-minute break');
    });

    it('status action returns no-timer message', async () => {
      const { plugin } = await import('../starter-skills/pomodoro.js');
      const tool = plugin.tools[0];

      const result = await tool.execute({ action: 'status' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('No active pomodoro timer');
    });
  });
});
