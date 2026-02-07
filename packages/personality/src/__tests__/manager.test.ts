import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PersonalityManager } from '../manager.js';
import type { SoulConfig } from '../types.js';

describe('PersonalityManager', () => {
  let tmpDir: string;
  let templatesDir: string;
  let workspaceDir: string;
  let manager: PersonalityManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'personality-test-'));
    templatesDir = path.join(tmpDir, 'templates');
    workspaceDir = path.join(tmpDir, 'workspace');
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });
    manager = new PersonalityManager(templatesDir, workspaceDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should list templates from the templates directory', async () => {
    await fs.writeFile(
      path.join(templatesDir, 'professional.md'),
      `<!-- name: Professional Assistant\ndescription: A formal assistant\npreview: How may I assist you? -->\n---\nname: Professional\n---\n`,
    );
    await fs.writeFile(
      path.join(templatesDir, 'friendly.md'),
      `<!-- name: Friendly Helper\ndescription: A warm helper\npreview: Hey! What can I do for you? -->\n---\nname: Friendly\n---\n`,
    );

    const templates = await manager.listTemplates();

    expect(templates).toHaveLength(2);
    const ids = templates.map((t) => t.id);
    expect(ids).toContain('professional');
    expect(ids).toContain('friendly');
  });

  it('should return empty array when templates directory does not exist', async () => {
    const badManager = new PersonalityManager('/nonexistent', workspaceDir);
    const templates = await badManager.listTemplates();
    expect(templates).toEqual([]);
  });

  it('should get a specific template by ID', async () => {
    await fs.writeFile(
      path.join(templatesDir, 'sarcastic.md'),
      `<!-- name: Sarcastic Bot\ndescription: Witty and sarcastic\npreview: Oh, another question. How delightful. -->\n---\nname: Snarky\n---\n`,
    );

    const template = await manager.getTemplate('sarcastic');

    expect(template).toBeDefined();
    expect(template!.id).toBe('sarcastic');
    expect(template!.name).toBe('Sarcastic Bot');
    expect(template!.description).toBe('Witty and sarcastic');
    expect(template!.preview).toBe('Oh, another question. How delightful.');
  });

  it('should return undefined for nonexistent template', async () => {
    const template = await manager.getTemplate('nonexistent');
    expect(template).toBeUndefined();
  });

  it('should apply a template to the workspace', async () => {
    const soulContent = `---\nname: TestBot\npronouns: they/them\n---\n`;
    await fs.writeFile(
      path.join(templatesDir, 'test.md'),
      `<!-- name: Test\ndescription: Test template\npreview: Hello -->\n${soulContent}`,
    );

    await manager.applyTemplate('test');

    const written = await fs.readFile(path.join(workspaceDir, 'SOUL.md'), 'utf-8');
    expect(written).toBe(soulContent);
  });

  it('should throw when applying nonexistent template', async () => {
    await expect(manager.applyTemplate('nonexistent')).rejects.toThrow(
      'Template not found: nonexistent',
    );
  });

  it('should read current personality from workspace SOUL.md', async () => {
    await fs.writeFile(
      path.join(workspaceDir, 'SOUL.md'),
      `---\nname: Current\npronouns: he/him\nerrorStyle: matter_of_fact\ntone:\n  warmth: 0.9\n  directness: 0.4\n  humor: 0.2\n  formality: 0.8\n---\n`,
    );

    const personality = await manager.getCurrentPersonality();

    expect(personality).toBeDefined();
    expect(personality!.name).toBe('Current');
    expect(personality!.pronouns).toBe('he/him');
    expect(personality!.tone.warmth).toBe(0.9);
  });

  it('should return undefined when no SOUL.md exists', async () => {
    const personality = await manager.getCurrentPersonality();
    expect(personality).toBeUndefined();
  });

  it('should build a custom personality and write SOUL.md', async () => {
    const config: SoulConfig = {
      name: 'Custom',
      pronouns: 'she/her',
      tone: { warmth: 0.7, directness: 0.6, humor: 0.4, formality: 0.5 },
      expertise: ['Python'],
      errorStyle: 'apologetic',
      catchphrases: { greeting: 'Hi!' },
      boundaries: { neverJokeAbout: [], neverAdviseOn: [] },
    };

    const content = await manager.buildCustom(config, '# My Bot');

    expect(content).toContain('name: Custom');
    expect(content).toContain('# My Bot');

    const written = await fs.readFile(path.join(workspaceDir, 'SOUL.md'), 'utf-8');
    expect(written).toBe(content);
  });

  it('should ignore non-.md files in templates directory', async () => {
    await fs.writeFile(path.join(templatesDir, 'readme.txt'), 'not a template');
    await fs.writeFile(
      path.join(templatesDir, 'valid.md'),
      `<!-- name: Valid -->\n---\nname: Valid\n---\n`,
    );

    const templates = await manager.listTemplates();
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('valid');
  });
});
