import { describe, it, expect } from 'vitest';
import { TemplateEngine } from '../src/templates.js';
import type { Template } from '../src/types.js';

describe('TemplateEngine', () => {
  it('register adds template', () => {
    const engine = new TemplateEngine();
    const template: Template = {
      id: 'custom-1',
      name: 'Custom',
      category: 'test',
      body: 'Hello {{name}}',
      variables: ['name'],
      tone: 'casual',
    };
    engine.register(template);
    expect(engine.get('custom-1')).toEqual(template);
  });

  it('get returns template by id', () => {
    const engine = new TemplateEngine();
    const template = engine.get('meeting-follow-up');
    expect(template).toBeDefined();
    expect(template!.name).toBe('Meeting Follow-Up');
  });

  it('list returns all templates', () => {
    const engine = new TemplateEngine();
    const all = engine.list();
    expect(all.length).toBeGreaterThanOrEqual(6);
  });

  it('list filters by category', () => {
    const engine = new TemplateEngine();
    const business = engine.list('business');
    expect(business.length).toBeGreaterThanOrEqual(1);
    for (const t of business) {
      expect(t.category).toBe('business');
    }
  });

  it('render replaces variables', () => {
    const engine = new TemplateEngine();
    const result = engine.render('thank-you', {
      name: 'Alice',
      reason: 'your help',
      additionalNote: 'You are great!',
    });
    expect(result).toContain('Alice');
    expect(result).toContain('your help');
    expect(result).toContain('You are great!');
  });

  it('render handles missing variables gracefully', () => {
    const engine = new TemplateEngine();
    const result = engine.render('thank-you', { name: 'Bob' });
    expect(result).toContain('Bob');
    expect(result).toContain('{{reason}}');
  });

  it('built-in templates registered (count >= 6)', () => {
    const engine = new TemplateEngine();
    expect(engine.list().length).toBeGreaterThanOrEqual(6);
  });

  it('render throws for unknown templateId', () => {
    const engine = new TemplateEngine();
    expect(() => engine.render('nonexistent', {})).toThrow('Template not found');
  });
});
