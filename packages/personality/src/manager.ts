import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PersonalityTemplate, SoulConfig } from './types.js';
import { parseSoulMd } from './parser.js';
import { buildSoulMd } from './builder.js';

export class PersonalityManager {
  private templatesDir: string;
  private workspaceDir: string;

  constructor(templatesDir: string, workspaceDir: string) {
    this.templatesDir = templatesDir;
    this.workspaceDir = workspaceDir;
  }

  /**
   * List all available personality templates from the templates directory.
   */
  async listTemplates(): Promise<PersonalityTemplate[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.templatesDir);
    } catch {
      return [];
    }

    const templates: PersonalityTemplate[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const template = await this.loadTemplateFile(entry);
      if (template) templates.push(template);
    }
    return templates;
  }

  /**
   * Get a specific personality template by ID.
   */
  async getTemplate(id: string): Promise<PersonalityTemplate | undefined> {
    const filename = `${id}.md`;
    return this.loadTemplateFile(filename);
  }

  /**
   * Apply a template by copying its content to the workspace SOUL.md.
   */
  async applyTemplate(id: string): Promise<void> {
    const template = await this.getTemplate(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }
    const soulPath = path.join(this.workspaceDir, 'SOUL.md');
    await fs.mkdir(this.workspaceDir, { recursive: true });
    await fs.writeFile(soulPath, template.soulContent, 'utf-8');
  }

  /**
   * Read and parse the current SOUL.md from the workspace.
   */
  async getCurrentPersonality(): Promise<SoulConfig | undefined> {
    const soulPath = path.join(this.workspaceDir, 'SOUL.md');
    try {
      const content = await fs.readFile(soulPath, 'utf-8');
      return parseSoulMd(content);
    } catch {
      return undefined;
    }
  }

  /**
   * Build a custom SOUL.md from a SoulConfig and write it to the workspace.
   */
  async buildCustom(config: SoulConfig, bodyMarkdown?: string): Promise<string> {
    const content = buildSoulMd(config, bodyMarkdown);
    const soulPath = path.join(this.workspaceDir, 'SOUL.md');
    await fs.mkdir(this.workspaceDir, { recursive: true });
    await fs.writeFile(soulPath, content, 'utf-8');
    return content;
  }

  private async loadTemplateFile(filename: string): Promise<PersonalityTemplate | undefined> {
    const filePath = path.join(this.templatesDir, filename);
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      return undefined;
    }

    const id = path.basename(filename, '.md');

    // Extract template metadata from a comment block at the top before frontmatter
    // Format: <!-- name: ...\n description: ...\n preview: ... -->
    const metaMatch = content.match(/^<!--\s*([\s\S]*?)-->\s*\n/);
    let name = id;
    let description = '';
    let preview = '';

    if (metaMatch) {
      const metaLines = metaMatch[1].split('\n');
      for (const line of metaLines) {
        const kv = line.match(/^\s*(\w+):\s*(.+)$/);
        if (kv) {
          const [, key, value] = kv;
          if (key === 'name') name = value.trim();
          else if (key === 'description') description = value.trim();
          else if (key === 'preview') preview = value.trim();
        }
      }
      // Remove the comment block from the soul content
      content = content.slice(metaMatch[0].length);
    }

    return { id, name, description, preview, soulContent: content };
  }
}
